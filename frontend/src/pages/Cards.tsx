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
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';

/** Monto para línea de pago mínimo: $0 sin decimales; resto con 2 decimales (es-DO). */
function formatMinPaymentAmount(value: number | undefined | null): string {
  const n = Number(value ?? 0);
  if (n === 0) return '0';
  return n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
  const { user } = useAuth();
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
  const [cardPaymentForm, setCardPaymentForm] = useState({
    paymentDate: todayYmdLocal(),
    amount: '',
    notes: '',
    bankAccountId: '',
    payCurrency: 'DOP' as 'DOP' | 'USD',
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
      toast.error('Error al cargar tarjetas');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, bankFilter]);

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
  }, [searchTerm, bankFilter]);
  const cardTotalPages = Math.max(1, Math.ceil(orderedCards.length / TABLE_PAGE_SIZE_CARDS));
  const cardPageSafe = Math.min(listPage, cardTotalPages);
  useEffect(() => {
    setListPage((p) => Math.min(p, cardTotalPages));
  }, [cardTotalPages]);
  const pagedCards = useMemo(() => {
    const start = (cardPageSafe - 1) * TABLE_PAGE_SIZE_CARDS;
    return orderedCards.slice(start, start + TABLE_PAGE_SIZE_CARDS);
  }, [orderedCards, cardPageSafe]);
  const cardListStart = (cardPageSafe - 1) * TABLE_PAGE_SIZE_CARDS;
  const listDnd = useListOrderPageDnd(pagedCards, cardListStart, orderedCards, commitCardOrder);

  const accountsForCardPayment = useMemo(() => {
    const c = cardPaymentForm.payCurrency;
    return bankAccounts.filter((a: BankAccount) => a.currencyType === 'DUAL' || a.currencyType === c);
  }, [bankAccounts, cardPaymentForm.payCurrency]);

  const bankAccountNameById = useMemo(() => {
    const m = new Map<number, string>();
    bankAccounts.forEach((a) => m.set(a.id, formatBankAccountOptionLabel(a)));
    return m;
  }, [bankAccounts]);

  const openCardPaymentModal = async (card: CreditCard) => {
    const payCurrency: 'DOP' | 'USD' =
      card.currencyType === 'DOP'
        ? 'DOP'
        : card.currencyType === 'USD'
          ? 'USD'
          : card.currentDebtDop >= card.currentDebtUsd
            ? 'DOP'
            : 'USD';
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
      toast.error('Indica un monto válido');
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
      toast.success('Pago registrado');
      setShowPaymentModal(false);
      setPaymentTargetCard(null);
      fetchCards();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al registrar pago');
    }
  };

  const handleDeleteCardPayment = async (paymentId: number) => {
    if (!window.confirm('¿Eliminar este pago de tarjeta? Se revertirá la deuda y el saldo de la cuenta si aplica.')) return;
    try {
      await api.delete(`/cards/payments/${paymentId}`);
      toast.success('Pago eliminado');
      if (paymentTargetCard) {
        const r = await api.get(`/cards/${paymentTargetCard.id}/payments`, { params: { limit: 12 } });
        setRecentCardPayments(r.data.payments || []);
      }
      fetchCards();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Error al eliminar');
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
        toast.success('Tarjeta actualizada');
      } else {
        await api.post('/cards', data);
        toast.success('Tarjeta creada');
      }

      setShowModal(false);
      resetForm();
      fetchCards();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar tarjeta');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta tarjeta?')) return;

    try {
      await api.delete(`/cards/${id}`);
      toast.success('Tarjeta eliminada');
      fetchCards();
    } catch (error: any) {
      toast.error('Error al eliminar tarjeta');
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
      currencyType: 'DOP',
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
        title="Tarjetas de Crédito"
        subtitle="Gestiona tus tarjetas de crédito"
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
              <span>Agregar Tarjeta</span>
            </button>
          </div>
        }
      />

      {/* Summary */}
      {summaryBarVisible && summary && (
        <div className="card-view">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">Deudas Totales (DOP)</p>
              <p className="text-2xl font-bold text-white">{summary.totalDebtDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Deudas Totales (USD)</p>
              <p className="text-2xl font-bold text-white">{summary.totalDebtUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Pagos Mínimos (DOP)</p>
              <p className="text-2xl font-bold text-white">{summary.totalMinPaymentDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Pagos Mínimos (USD)</p>
              <p className="text-2xl font-bold text-white">{summary.totalMinPaymentUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Cantidad de Tarjetas</p>
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
                placeholder="Buscar por nombre o banco..."
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
                <option value="">Todos los bancos</option>
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
          <p className="text-dark-400 mb-4">No tienes tarjetas registradas</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            Agregar Primera Tarjeta
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 xl:gap-6">
            {pagedCards.map((card) => (
              <motion.article
                key={card.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                onDragOver={listDnd.onDragOver}
                onDrop={listDnd.onDrop(card.id)}
                className={[
                  LIST_CARD_SHELL,
                  creditCardListAccent(card),
                  listDnd.dragId === card.id ? 'opacity-60' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="flex flex-row gap-3 justify-between items-start">
                  <div className="min-w-0 flex-1 space-y-2 pr-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                        <CardIcon className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                        Tarjeta
                      </span>
                      <span className="text-xs text-dark-500 sm:text-sm">{card.currencyType}</span>
                    </div>
                    <h3 className="text-balance break-words text-lg font-bold leading-snug text-white sm:text-xl">{card.cardName}</h3>
                    <p className="text-sm text-dark-400">{card.bankName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <ListOrderDragHandle
                      itemId={card.id}
                      onDragStart={listDnd.onDragStart}
                      onDragEnd={listDnd.onDragEnd}
                      disabled={pagedCards.length < 2}
                    />
                    <button
                      type="button"
                      onClick={() => openCardPaymentModal(card)}
                      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-emerald-400 transition-colors hover:bg-emerald-500/15"
                      title="Registrar pago"
                      aria-label="Registrar pago"
                    >
                      <DollarSign className="h-[18px] w-[18px]" />
                    </button>
                    <button type="button" onClick={() => handleEdit(card)} className={listCardBtnEdit} title="Editar" aria-label="Editar tarjeta">
                      <Edit className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(card.id)} className={listCardBtnDanger} title="Eliminar" aria-label="Eliminar tarjeta">
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-dark-700/80 pt-4">
                  {card.currencyType === 'DUAL' ? (
                    <div className="flex flex-col gap-2 sm:gap-3">
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Límite (DOP)</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                            {card.creditLimitDop.toLocaleString('es-DO')}
                          </p>
                        </div>
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Límite (USD)</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                            {card.creditLimitUsd.toLocaleString('es-DO')}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Deuda (DOP)</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                            {card.currentDebtDop.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Deuda (USD)</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                            {card.currentDebtUsd.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Pago mínimo (DOP)</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-400 sm:text-base">
                            {formatMinPaymentAmount(card.minimumPaymentDop)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Pago mínimo (USD)</p>
                          <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-400 sm:text-base">
                            {formatMinPaymentAmount(card.minimumPaymentUsd)}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:gap-3">
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Corte</p>
                          <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">Día {card.cutOffDay}</p>
                        </div>
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Vencimiento</p>
                          <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">Día {card.paymentDueDay}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:gap-3">
                      <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Límite</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                          {card.currencyType === 'DOP' && `${card.creditLimitDop.toLocaleString('es-DO')} DOP`}
                          {card.currencyType === 'USD' && `${card.creditLimitUsd.toLocaleString('es-DO')} USD`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Deuda</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                          {card.currencyType === 'DOP' && `${card.currentDebtDop.toLocaleString('es-DO')} DOP`}
                          {card.currencyType === 'USD' && `${card.currentDebtUsd.toLocaleString('es-DO')} USD`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3 xs:col-span-2">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Pago mínimo</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-amber-400 sm:text-base">
                          {card.currencyType === 'DOP' && `${formatMinPaymentAmount(card.minimumPaymentDop)} DOP`}
                          {card.currencyType === 'USD' && `${formatMinPaymentAmount(card.minimumPaymentUsd)} USD`}
                        </p>
                      </div>
                      <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Corte</p>
                        <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">Día {card.cutOffDay}</p>
                      </div>
                      <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Vencimiento</p>
                        <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">Día {card.paymentDueDay}</p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.article>
            ))}
          </div>
          <TablePagination
            currentPage={cardPageSafe}
            totalPages={cardTotalPages}
            totalItems={orderedCards.length}
            itemsPerPage={TABLE_PAGE_SIZE_CARDS}
            onPageChange={setListPage}
            itemLabel="tarjetas"
            variant="card"
          />
        </div>
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
              Registrar pago
            </h2>
            <p className="text-sm text-dark-400 mb-4">
              {paymentTargetCard.cardName} — {paymentTargetCard.bankName}
            </p>
            <form onSubmit={handleCardPaymentSubmit} className="space-y-4">
              {paymentTargetCard.currencyType === 'DUAL' && (
                <div>
                  <label className="label">Moneda del pago</label>
                  <select
                    value={cardPaymentForm.payCurrency}
                    onChange={(e) =>
                      setCardPaymentForm({
                        ...cardPaymentForm,
                        payCurrency: e.target.value as 'DOP' | 'USD',
                        bankAccountId: '',
                      })
                    }
                    className="input w-full"
                  >
                    <option value="DOP">DOP (deuda: {paymentTargetCard.currentDebtDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })})</option>
                    <option value="USD">USD (deuda: {paymentTargetCard.currentDebtUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })})</option>
                  </select>
                </div>
              )}
              <div>
                <label className="label">Fecha</label>
                <input
                  type="date"
                  value={cardPaymentForm.paymentDate}
                  onChange={(e) => setCardPaymentForm({ ...cardPaymentForm, paymentDate: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="label">Monto</label>
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
                  Se aplicará hasta el saldo de la deuda en {cardPaymentForm.payCurrency}.
                </p>
              </div>
              <div>
                <label className="label">Cuenta origen (opcional)</label>
                <select
                  value={cardPaymentForm.bankAccountId}
                  onChange={(e) => setCardPaymentForm({ ...cardPaymentForm, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Sin vincular saldo</option>
                  {accountsForCardPayment.map((a: BankAccount) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Notas (opcional)</label>
                <textarea
                  value={cardPaymentForm.notes}
                  onChange={(e) => setCardPaymentForm({ ...cardPaymentForm, notes: e.target.value })}
                  className="input w-full"
                  rows={2}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  Registrar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPaymentModal(false);
                    setPaymentTargetCard(null);
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
              </div>
            </form>
            {recentCardPayments.length > 0 && (
              <div className="mt-6 border-t border-dark-600 pt-4">
                <h3 className="text-sm font-semibold text-dark-300 mb-2">Pagos recientes</h3>
                <ul className="space-y-2 text-sm">
                  {recentCardPayments.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dark-600/80 bg-dark-900/40 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 text-dark-300">
                        <span className="block">
                          {p.paymentDate?.slice(0, 10)} — {p.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                          {p.currency}
                        </span>
                        <span className="block text-xs text-dark-500 mt-0.5">
                          Origen:{' '}
                          {p.bankAccountId != null
                            ? bankAccountNameById.get(p.bankAccountId) ?? `Cuenta #${p.bankAccountId}`
                            : 'Sin cuenta vinculada'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteCardPayment(p.id)}
                        className="text-xs text-red-400 hover:text-red-300"
                      >
                        Eliminar
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
              {editingCard ? 'Editar Tarjeta' : 'Nueva Tarjeta'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Banco</label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">Nombre de Tarjeta</label>
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
                <label className="label">Tipo de Moneda</label>
                <select
                  value={formData.currencyType}
                  onChange={(e) => setFormData({ ...formData, currencyType: e.target.value as any })}
                  className="input w-full"
                  required
                >
                  <option value="DOP">DOP</option>
                  <option value="USD">USD</option>
                  <option value="DUAL">DUAL</option>
                </select>
              </div>

              {(formData.currencyType === 'DOP' || formData.currencyType === 'DUAL') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Límite de Crédito (DOP)</label>
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
                    <label className="label">Deuda Actual (DOP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.currentDebtDop}
                      onChange={(e) => setFormData({ ...formData, currentDebtDop: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="label">Pago Mínimo (DOP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.minimumPaymentDop}
                      onChange={(e) => setFormData({ ...formData, minimumPaymentDop: e.target.value })}
                      className="input w-full"
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              )}

              {(formData.currencyType === 'USD' || formData.currencyType === 'DUAL') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Límite de Crédito (USD)</label>
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
                    <label className="label">Deuda Actual (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.currentDebtUsd}
                      onChange={(e) => setFormData({ ...formData, currentDebtUsd: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="label">Pago Mínimo (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.minimumPaymentUsd}
                      onChange={(e) => setFormData({ ...formData, minimumPaymentUsd: e.target.value })}
                      className="input w-full"
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Día de Corte</label>
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
                  <label className="label">Día Límite de Pago</label>
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
                  {editingCard ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancelar
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
