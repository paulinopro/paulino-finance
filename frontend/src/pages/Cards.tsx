import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { BankAccount, CardPayment, CreditCard } from '../types';
import { Plus, Edit, Trash2, CreditCard as CardIcon, DollarSign, Search, X } from 'lucide-react';
import { todayYmdLocal } from '../utils/dateUtils';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { usePersistedIdOrder } from '../hooks/usePersistedIdOrder';
import { useListOrderPageDnd } from '../hooks/useListOrderPageDnd';
import ListOrderDragHandle from '../components/ListOrderDragHandle';
import ListOrderDragGhostPortal from '../components/ListOrderDragGhostPortal';
import SummaryBarToggleButton from '../components/SummaryBarToggleButton';
import { usePersistedSummaryBarVisible } from '../hooks/usePersistedSummaryBarVisible';
import {
  LIST_CARD_SHELL,
  listCardAccentFromPercent,
  listCardAccentCreditUtilization,
  listCardBtnEdit,
  listCardBtnDanger,
} from '../utils/listCard';
import { TABLE_PAGE_SIZE_CARDS } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { bankAccountSupportsLedgerCurrency, formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';

function creditCardListAccent(card: CreditCard): string {
  if (card.currencyType === 'DUAL') {
    const pDop = card.creditLimitDop > 0 ? (card.currentDebtDop / card.creditLimitDop) * 100 : 0;
    const pUsd = card.creditLimitUsd > 0 ? (card.currentDebtUsd / card.creditLimitUsd) * 100 : 0;
    return listCardAccentFromPercent(Math.min(100, Math.max(pDop, pUsd)));
  }
  return listCardAccentCreditUtilization(
    card.currencyType === 'USD' ? card.currentDebtUsd : card.currentDebtDop,
    card.currencyType === 'USD' ? card.creditLimitUsd : card.creditLimitDop
  );
}

const Cards: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    formatCurrency: fc,
    defaultBankMoneyCurrencyType,
    ledgerCurrencyOptions,
    defaultLedgerCurrency,
    primaryCurrency,
    secondaryCurrency,
  } = useIntlFormatting();
  const { pageSize: cardPageSize, setPageSize: setCardPageSize, pageSizeOptions: cardPageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:cards', TABLE_PAGE_SIZE_CARDS);
  const { visible: summaryBarVisible, toggle: toggleSummaryBar } = usePersistedSummaryBarVisible(
    user?.id,
    'cards'
  );
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const cardPaymentModalRef = useRef<HTMLDivElement>(null);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [summary, setSummary] = useState({ totalDebtDop: 0, totalDebtUsd: 0, totalMinPaymentDop: 0, totalMinPaymentUsd: 0, totalCards: 0 });
  const [formData, setFormData] = useState({
    bankName: '',
    cardName: '',
    creditLimitDop: '',
    creditLimitUsd: '',
    currentDebtDop: '',
    currentDebtUsd: '',
    minimumPaymentDop: '',
    minimumPaymentUsd: '',
    cutOffDay: '',
    paymentDueDay: '',
    currencyType: 'DOP' as 'DOP' | 'USD' | 'DUAL',
  });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentTargetCard, setPaymentTargetCard] = useState<CreditCard | null>(null);
  const [cardPaymentForm, setCardPaymentForm] = useState<{
    paymentDate: string;
    amount: string;
    notes: string;
    bankAccountId: string;
    payCurrency: string;
  }>({
    paymentDate: todayYmdLocal(),
    amount: '',
    notes: '',
    bankAccountId: '',
    payCurrency: defaultLedgerCurrency,
  });
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [recentCardPayments, setRecentCardPayments] = useState<CardPayment[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/accounts');
        setBankAccounts(res.data.accounts || []);
      } catch {
        setBankAccounts([]);
      }
    })();
  }, []);

  const fetchCards = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (searchTerm) params.search = searchTerm;
      if (bankFilter) params.bank = bankFilter;

      const response = await api.get('/cards', { params });
      setCards(response.data.cards);
      setSummary(response.data.summary || { totalDebtDop: 0, totalDebtUsd: 0, totalMinPaymentDop: 0, totalMinPaymentUsd: 0, totalCards: 0 });
    } catch {
      toast.error(t('toast.cards.loadError'));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, bankFilter, t]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  const { ordered: orderedCards, setOrderByIds: setCardOrderByIds } = usePersistedIdOrder<CreditCard>({
    module: 'cards',
    userId: user?.id,
    sourceItems: cards,
  });
  const commitCardOrder = useCallback(
    (next: CreditCard[]) => {
      setCardOrderByIds(next.map((c) => c.id));
    },
    [setCardOrderByIds]
  );

  const [listPage, setListPage] = useState(1);
  useEffect(() => {
    setListPage(1);
  }, [searchTerm, bankFilter, cardPageSize]);
  const cardTotalPages = Math.max(1, Math.ceil(orderedCards.length / cardPageSize));
  const cardPageSafe = Math.min(listPage, cardTotalPages);
  useEffect(() => {
    setListPage((p) => Math.min(p, cardTotalPages));
  }, [cardTotalPages]);
  const pagedCards = useMemo(() => {
    const start = (cardPageSafe - 1) * cardPageSize;
    return orderedCards.slice(start, start + cardPageSize);
  }, [orderedCards, cardPageSafe, cardPageSize]);
  const cardListStart = (cardPageSafe - 1) * cardPageSize;
  const listDnd = useListOrderPageDnd(pagedCards, cardListStart, orderedCards, commitCardOrder, {
    ghostLabel: (c) => [c.cardName, c.bankName].filter(Boolean).join(' · '),
  });

  const accountsForCardPayment = useMemo(() => {
    const c = cardPaymentForm.payCurrency;
    return bankAccounts.filter((a: BankAccount) =>
      bankAccountSupportsLedgerCurrency(a, c, primaryCurrency, secondaryCurrency)
    );
  }, [bankAccounts, cardPaymentForm.payCurrency, primaryCurrency, secondaryCurrency]);

  const bankAccountNameById = useMemo(() => {
    const m = new Map<number, string>();
    bankAccounts.forEach((a) => m.set(a.id, formatBankAccountOptionLabel(a)));
    return m;
  }, [bankAccounts]);

  const openCardPaymentModal = async (card: CreditCard) => {
    const priInPair = ledgerCurrencyOptions.includes(primaryCurrency);
    const secInPair = ledgerCurrencyOptions.includes(secondaryCurrency);
    let payCurrency: string;
    if (card.currencyType === 'DOP') {
      payCurrency = primaryCurrency;
    } else if (card.currencyType === 'USD') {
      payCurrency = secondaryCurrency;
    } else {
      if (priInPair && secInPair) {
        payCurrency = card.currentDebtDop >= card.currentDebtUsd ? primaryCurrency : secondaryCurrency;
      } else if (secInPair) {
        payCurrency = secondaryCurrency;
      } else if (priInPair) {
        payCurrency = primaryCurrency;
      } else {
        payCurrency = defaultLedgerCurrency;
      }
    }
    setPaymentTargetCard(card);
    setCardPaymentForm({
      paymentDate: todayYmdLocal(),
      amount: '',
      notes: '',
      bankAccountId: '',
      payCurrency,
    });
    try {
      const r = await api.get(`/cards/${card.id}/payments`, { params: { limit: 12 } });
      setRecentCardPayments(r.data.payments || []);
    } catch {
      setRecentCardPayments([]);
    }
    setShowPaymentModal(true);
  };

  const handleCardPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentTargetCard) return;
    const amt = parseFloat(cardPaymentForm.amount);
    if (!amt || amt <= 0 || Number.isNaN(amt)) {
      toast.error(t('toast.generic.invalidAmount'));
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        amount: amt,
        currency: cardPaymentForm.payCurrency,
        paymentDate: cardPaymentForm.paymentDate,
        notes: cardPaymentForm.notes || null,
      };
      if (cardPaymentForm.bankAccountId) {
        payload.bankAccountId = parseInt(cardPaymentForm.bankAccountId, 10);
      } else {
        payload.bankAccountId = null;
      }
      await api.post(`/cards/${paymentTargetCard.id}/payments`, payload);
      toast.success(t('toast.cards.paymentRegistered'));
      setShowPaymentModal(false);
      setPaymentTargetCard(null);
      fetchCards();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toast.cards.paymentRegisterError'));
    }
  };

  const handleDeleteCardPayment = async (paymentId: number) => {
    if (!window.confirm(t('confirm.deleteCardPayment'))) return;
    try {
      await api.delete(`/cards/payments/${paymentId}`);
      toast.success(t('toast.cards.paymentDeleted'));
      if (paymentTargetCard) {
        const r = await api.get(`/cards/${paymentTargetCard.id}/payments`, { params: { limit: 12 } });
        setRecentCardPayments(r.data.payments || []);
      }
      fetchCards();
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('toast.cards.paymentDeleteError'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        creditLimitDop: formData.creditLimitDop ? parseFloat(formData.creditLimitDop) : null,
        creditLimitUsd: formData.creditLimitUsd ? parseFloat(formData.creditLimitUsd) : null,
        currentDebtDop: formData.currentDebtDop ? parseFloat(formData.currentDebtDop) : 0,
        currentDebtUsd: formData.currentDebtUsd ? parseFloat(formData.currentDebtUsd) : 0,
        minimumPaymentDop: formData.minimumPaymentDop ? parseFloat(formData.minimumPaymentDop) : null,
        minimumPaymentUsd: formData.minimumPaymentUsd ? parseFloat(formData.minimumPaymentUsd) : null,
        cutOffDay: parseInt(formData.cutOffDay),
        paymentDueDay: parseInt(formData.paymentDueDay),
      };

      if (editingCard) {
        await api.put(`/cards/${editingCard.id}`, data);
        toast.success(t('toast.cards.updated'));
      } else {
        await api.post('/cards', data);
        toast.success(t('toast.cards.created'));
      }

      setShowModal(false);
      resetForm();
      fetchCards();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.cards.saveError'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('confirm.deleteCard'))) return;

    try {
      await api.delete(`/cards/${id}`);
      toast.success(t('toast.cards.deleted'));
      fetchCards();
    } catch (error: any) {
      toast.error(t('toast.cards.deleteError'));
    }
  };

  const handleEdit = (card: CreditCard) => {
    setEditingCard(card);
    setFormData({
      bankName: card.bankName,
      cardName: card.cardName,
      creditLimitDop: card.creditLimitDop.toString(),
      creditLimitUsd: card.creditLimitUsd.toString(),
      currentDebtDop: card.currentDebtDop.toString(),
      currentDebtUsd: card.currentDebtUsd.toString(),
      minimumPaymentDop: (card.minimumPaymentDop || 0).toString(),
      minimumPaymentUsd: (card.minimumPaymentUsd || 0).toString(),
      cutOffDay: card.cutOffDay.toString(),
      paymentDueDay: card.paymentDueDay.toString(),
      currencyType: card.currencyType,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      bankName: '',
      cardName: '',
      creditLimitDop: '',
      creditLimitUsd: '',
      currentDebtDop: '',
      currentDebtUsd: '',
      minimumPaymentDop: '',
      minimumPaymentUsd: '',
      cutOffDay: '',
      paymentDueDay: '',
      currencyType: defaultBankMoneyCurrencyType,
    });
    setEditingCard(null);
  };

  useEscapeKey(showModal, () => {
    setShowModal(false);
    resetForm();
  });
  useModalFocusTrap(modalPanelRef, showModal);

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-4"
        title={t('pages.cards.title')}
        subtitle={t('pages.cards.subtitle')}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
            <SummaryBarToggleButton visible={summaryBarVisible} onToggle={toggleSummaryBar} />
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto sm:flex-initial"
            >
              <Plus size={20} />
              <span>{t('pages.cards.addCard')}</span>
            </button>
          </div>
        }
      />

      {/* Summary */}
      {summaryBarVisible && summary && (
        <div className="card-view">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.cards.totalDebt', { currency: primaryCurrency })}</p>
              <p className="text-2xl font-bold text-white">{fc(summary.totalDebtDop, primaryCurrency)}</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.cards.totalDebt', { currency: secondaryCurrency })}</p>
              <p className="text-2xl font-bold text-white">{fc(summary.totalDebtUsd, secondaryCurrency)}</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.cards.totalMinPayments', { currency: primaryCurrency })}</p>
              <p className="text-2xl font-bold text-white">{fc(summary.totalMinPaymentDop, primaryCurrency)}</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.cards.totalMinPayments', { currency: secondaryCurrency })}</p>
              <p className="text-2xl font-bold text-white">{fc(summary.totalMinPaymentUsd, secondaryCurrency)}</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.cards.totalCards')}</p>
              <p className="text-2xl font-bold text-white">{summary.totalCards}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {cards.length > 0 && (
        <div className="card-view">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
              <input
                type="text"
                placeholder={t('pages.cards.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input w-full pl-10"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-dark-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            <div>
              <select
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value)}
                className="input w-full"
              >
                <option value="">{t('pages.cards.allBanks')}</option>
                {Array.from(new Set(cards.map(c => c.bankName))).map((bank) => (
                  <option key={bank} value={bank}>{bank}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="card-view text-center py-12 sm:py-16">
          <CardIcon className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">{t('pages.cards.emptyState')}</p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary"
          >
            {t('pages.cards.addFirstCard')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 xl:gap-6">
            {pagedCards.map((card) => (
              <motion.article
                key={card.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                {...listDnd.droppableAttr(card.id)}
                className={[
                  LIST_CARD_SHELL,
                  creditCardListAccent(card),
                  listDnd.dragId === card.id ? 'opacity-[0.22]' : '',
                  listDnd.dragId !== null &&
                  listDnd.pointerOverItemId === card.id &&
                  listDnd.dragId !== card.id
                    ? 'ring-2 ring-primary-400/75 z-[1]'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[min(100%,12rem)] flex-1 space-y-2 pr-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                        <CardIcon className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                        {t('pages.cards.cardBadge')}
                      </span>
                      <span className="text-xs text-dark-500 sm:text-sm">
                        {card.currencyType === 'DUAL'
                          ? `${primaryCurrency} + ${secondaryCurrency}`
                          : card.currencyType === 'DOP'
                            ? primaryCurrency
                            : secondaryCurrency}
                      </span>
                    </div>
                    <h3 className="break-words text-lg font-bold leading-snug text-white sm:text-xl">{card.cardName}</h3>
                    <p className="text-sm text-dark-400">{card.bankName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <ListOrderDragHandle
                      itemId={card.id}
                      gripBinder={listDnd.gripBinder}
                      disabled={pagedCards.length < 2}
                    />
                    <button
                      type="button"
                      onClick={() => openCardPaymentModal(card)}
                      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-emerald-400 transition-colors hover:bg-emerald-500/15"
                      title={t('pages.cards.registerPayment')}
                      aria-label={t('pages.cards.registerPayment')}
                    >
                      <DollarSign className="h-[18px] w-[18px]" />
                    </button>
                    <button type="button" onClick={() => handleEdit(card)} className={listCardBtnEdit} title={t('common.actions.edit')} aria-label={t('pages.cards.editAria')}>
                      <Edit className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(card.id)} className={listCardBtnDanger} title={t('common.actions.delete')} aria-label={t('pages.cards.deleteAria')}>
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-dark-700/80 pt-4">
                  {card.currencyType === 'DUAL' ? (
                    <div className="flex flex-col gap-2 sm:gap-3">
                      <div className="metrics-cq">
                        <div className="metrics-row-2">
                          <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                            {t('pages.cards.limitCurrency', { currency: primaryCurrency })}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                            {fc(card.creditLimitDop, primaryCurrency)}
                          </p>
                        </div>
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                            {t('pages.cards.limitCurrency', { currency: secondaryCurrency })}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                            {fc(card.creditLimitUsd, secondaryCurrency)}
                          </p>
                        </div>
                        </div>
                      </div>
                      <div className="metrics-cq">
                        <div className="metrics-row-2">
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                            {t('pages.cards.debtCurrency', { currency: primaryCurrency })}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                            {fc(card.currentDebtDop, primaryCurrency)}
                          </p>
                        </div>
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                            {t('pages.cards.debtCurrency', { currency: secondaryCurrency })}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                            {fc(card.currentDebtUsd, secondaryCurrency)}
                          </p>
                        </div>
                        </div>
                      </div>
                      <div className="metrics-cq">
                        <div className="metrics-row-2">
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                            {t('pages.cards.minimumPaymentCurrency', { currency: primaryCurrency })}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-400 sm:text-base">
                            {fc(Number(card.minimumPaymentDop ?? 0), primaryCurrency)}
                          </p>
                        </div>
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                            {t('pages.cards.minimumPaymentCurrency', { currency: secondaryCurrency })}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-400 sm:text-base">
                            {fc(Number(card.minimumPaymentUsd ?? 0), secondaryCurrency)}
                          </p>
                        </div>
                        </div>
                      </div>
                      <div className="metrics-cq">
                        <div className="metrics-row-2">
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.cards.cutOff')}</p>
                          <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">{t('pages.cards.dayValue', { day: card.cutOffDay })}</p>
                        </div>
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.cards.dueDate')}</p>
                          <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">{t('pages.cards.dayValue', { day: card.paymentDueDay })}</p>
                        </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="metrics-cq">
                      <div className="metrics-row-2">
                      <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.cards.limit')}</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                          {card.currencyType === 'DOP' && fc(card.creditLimitDop, primaryCurrency)}
                          {card.currencyType === 'USD' && fc(card.creditLimitUsd, secondaryCurrency)}
                        </p>
                      </div>
                      <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.cards.debt')}</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                          {card.currencyType === 'DOP' && fc(card.currentDebtDop, primaryCurrency)}
                          {card.currencyType === 'USD' && fc(card.currentDebtUsd, secondaryCurrency)}
                        </p>
                      </div>
                      <div className="metrics-cell-span-2 rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.cards.minimumPayment')}</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-400 sm:text-base">
                          {card.currencyType === 'DOP' &&
                            fc(Number(card.minimumPaymentDop ?? 0), primaryCurrency)}
                          {card.currencyType === 'USD' &&
                            fc(Number(card.minimumPaymentUsd ?? 0), secondaryCurrency)}
                        </p>
                      </div>
                      <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.cards.cutOff')}</p>
                        <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">{t('pages.cards.dayValue', { day: card.cutOffDay })}</p>
                      </div>
                      <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.cards.dueDate')}</p>
                        <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">{t('pages.cards.dayValue', { day: card.paymentDueDay })}</p>
                      </div>
                    </div>
                    </div>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
          <ListOrderDragGhostPortal ghost={listDnd.dragGhost} />
          <TablePagination
            className="mt-4 sm:mt-5"
            currentPage={cardPageSafe}
            totalPages={cardTotalPages}
            totalItems={orderedCards.length}
            itemsPerPage={cardPageSize}
            onPageChange={setListPage}
            itemLabel={t('pages.cards.itemsLabel')}
            variant="card"
            pageSizeOptions={cardPageSizeOptions}
            onPageSizeChange={setCardPageSize}
          />
        </>
      )}

      {/* Card payment modal */}
      {showPaymentModal && paymentTargetCard && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowPaymentModal(false);
            setPaymentTargetCard(null);
          }}
          role="presentation"
        >
          <motion.div
            ref={cardPaymentModalRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cards-payment-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cards-payment-modal-title" className="text-xl font-bold text-white mb-1">
              {t('pages.cards.registerPayment')}
            </h2>
            <p className="text-sm text-dark-400 mb-4">
              {paymentTargetCard.cardName} — {paymentTargetCard.bankName}
            </p>
            <form onSubmit={handleCardPaymentSubmit} className="space-y-4">
              {paymentTargetCard.currencyType === 'DUAL' && (
                <div>
                  <label className="label">{t('pages.cards.paymentCurrency')}</label>
                  <select
                    value={cardPaymentForm.payCurrency}
                    onChange={(e) =>
                      setCardPaymentForm({
                        ...cardPaymentForm,
                        payCurrency: e.target.value,
                        bankAccountId: '',
                      })
                    }
                    className="input w-full"
                  >
                    {ledgerCurrencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {code} — {t('pages.cards.debtInline')}:{' '}
                        {fc(
                          code === primaryCurrency
                            ? paymentTargetCard.currentDebtDop
                            : paymentTargetCard.currentDebtUsd,
                          code
                        )}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="label">{t('pages.cards.date')}</label>
                <input
                  type="date"
                  value={cardPaymentForm.paymentDate}
                  onChange={(e) => setCardPaymentForm({ ...cardPaymentForm, paymentDate: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="label">{t('pages.cards.amount')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cardPaymentForm.amount}
                  onChange={(e) => setCardPaymentForm({ ...cardPaymentForm, amount: e.target.value })}
                  className="input w-full"
                  required
                />
                <p className="text-xs text-dark-500 mt-1">
                  {t('pages.cards.paymentAppliesHint', { currency: cardPaymentForm.payCurrency })}
                </p>
              </div>
              <div>
                <label className="label">{t('pages.cards.sourceAccountOptional')}</label>
                <select
                  value={cardPaymentForm.bankAccountId}
                  onChange={(e) => setCardPaymentForm({ ...cardPaymentForm, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">{t('pages.cards.unlinkedBalance')}</option>
                  {accountsForCardPayment.map((a: BankAccount) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t('pages.cards.notesOptional')}</label>
                <textarea
                  value={cardPaymentForm.notes}
                  onChange={(e) => setCardPaymentForm({ ...cardPaymentForm, notes: e.target.value })}
                  className="input w-full"
                  rows={2}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  {t('pages.cards.register')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentTargetCard(null);
                  }}
                  className="btn-secondary flex-1"
                >
                  {t('common.actions.cancel')}
                </button>
              </div>
            </form>
            {recentCardPayments.length > 0 && (
              <div className="mt-6 border-t border-dark-600 pt-4">
                <h3 className="text-sm font-semibold text-dark-300 mb-2">{t('pages.cards.recentPayments')}</h3>
                <ul className="space-y-2 text-sm">
                  {recentCardPayments.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dark-600/80 bg-dark-900/40 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 text-dark-300">
                        <span className="block">
                          {p.paymentDate?.slice(0, 10)} — {fc(p.amount, p.currency)}
                        </span>
                        <span className="block text-xs text-dark-500 mt-0.5">
                          {t('pages.cards.source')}:{' '}
                          {p.bankAccountId != null
                            ? bankAccountNameById.get(p.bankAccountId) ?? t('pages.cards.accountNumber', { id: p.bankAccountId })
                            : t('pages.cards.noLinkedAccount')}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCardPayment(p.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        {t('common.actions.delete')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowModal(false);
            resetForm();
          }}
          role="presentation"
        >
          <motion.div
            ref={modalPanelRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-2xl w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cards-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cards-modal-title" className="text-2xl font-bold text-white mb-6">
              {editingCard ? t('pages.cards.editCard') : t('pages.cards.newCard')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('pages.cards.bank')}</label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">{t('pages.cards.cardName')}</label>
                  <input
                    type="text"
                    value={formData.cardName}
                    onChange={(e) => setFormData({ ...formData, cardName: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">{t('pages.cards.currencyType')}</label>
                <select
                  value={formData.currencyType}
                  onChange={(e) => setFormData({ ...formData, currencyType: e.target.value as any })}
                  className="input w-full"
                  required
                >
                  <option value="DOP">{primaryCurrency}</option>
                  <option value="USD">{secondaryCurrency}</option>
                  <option value="DUAL">
                    {primaryCurrency} + {secondaryCurrency} (DUAL)
                  </option>
                </select>
              </div>

              {(formData.currencyType === 'DOP' || formData.currencyType === 'DUAL') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">{t('pages.cards.creditLimitCurrency', { currency: primaryCurrency })}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.creditLimitDop}
                      onChange={(e) => setFormData({ ...formData, creditLimitDop: e.target.value })}
                      className="input w-full"
                      required={formData.currencyType === 'DOP'}
                    />
                  </div>
                  <div>
                    <label className="label">{t('pages.cards.currentDebtCurrency', { currency: primaryCurrency })}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.currentDebtDop}
                      onChange={(e) => setFormData({ ...formData, currentDebtDop: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="label">{t('pages.cards.minimumPaymentCurrency', { currency: primaryCurrency })}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.minimumPaymentDop}
                      onChange={(e) => setFormData({ ...formData, minimumPaymentDop: e.target.value })}
                      className="input w-full"
                      placeholder={t('pages.cards.optional')}
                    />
                  </div>
                </div>
              )}

              {(formData.currencyType === 'USD' || formData.currencyType === 'DUAL') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">{t('pages.cards.creditLimitCurrency', { currency: secondaryCurrency })}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.creditLimitUsd}
                      onChange={(e) => setFormData({ ...formData, creditLimitUsd: e.target.value })}
                      className="input w-full"
                      required={formData.currencyType === 'USD'}
                    />
                  </div>
                  <div>
                    <label className="label">{t('pages.cards.currentDebtCurrency', { currency: secondaryCurrency })}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.currentDebtUsd}
                      onChange={(e) => setFormData({ ...formData, currentDebtUsd: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="label">{t('pages.cards.minimumPaymentCurrency', { currency: secondaryCurrency })}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.minimumPaymentUsd}
                      onChange={(e) => setFormData({ ...formData, minimumPaymentUsd: e.target.value })}
                      className="input w-full"
                      placeholder={t('pages.cards.optional')}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('pages.cards.cutOffDay')}</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.cutOffDay}
                    onChange={(e) => setFormData({ ...formData, cutOffDay: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">{t('pages.cards.paymentDueDay')}</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.paymentDueDay}
                    onChange={(e) => setFormData({ ...formData, paymentDueDay: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingCard ? t('pages.cards.update') : t('pages.cards.create')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="btn-secondary flex-1"
                >
                  {t('common.actions.cancel')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Cards;
