import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import api from '../services/api';
import { BankAccount, BankAccountLedgerMovement } from '../types';
import { Plus, Edit, Trash2, Wallet, Search, X, ArrowLeftRight, Copy, ScrollText } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';
import { LIST_CARD_SHELL, listCardAccentNeutral, listCardBtnEdit, listCardBtnDanger } from '../utils/listCard';
import { TABLE_PAGE_SIZE_ACCOUNTS } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { bankAccountSupportsLedgerCurrency, formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';
import { usePersistedIdOrder } from '../hooks/usePersistedIdOrder';
import { useListOrderPageDnd } from '../hooks/useListOrderPageDnd';
import ListOrderDragHandle from '../components/ListOrderDragHandle';
import ListOrderDragGhostPortal from '../components/ListOrderDragGhostPortal';
import SummaryBarToggleButton from '../components/SummaryBarToggleButton';
import EntityActiveToggle from '../components/EntityActiveToggle';
import { usePersistedSummaryBarVisible } from '../hooks/usePersistedSummaryBarVisible';

function buildBankAccountCopyText(
  account: BankAccount,
  fullName: string,
  cedula: string,
  labels: {
    bankName: string;
    accountNumber: string;
    accountType: string;
    name: string;
    idNumber: string;
  }
): string {
  const bank = (account.bankName || '').trim();
  const num = (account.accountNumber || '').trim();
  const tipo = (account.accountType || '').trim();
  const nombre = (fullName || '').trim();
  const ced = (cedula || '').trim();

  const parts: string[] = [
    labels.bankName,
    bank,
    '',
    labels.accountNumber,
    num,
    '',
    labels.accountType,
    tipo,
  ];

  if (nombre) {
    parts.push('', labels.name, nombre);
  }
  if (ced) {
    parts.push('', labels.idNumber, ced);
  }

  return parts.join('\n');
}

const Accounts: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    formatCurrency: fc,
    formatDateTimeMedium,
    currencySelectLabel,
    defaultLedgerCurrency,
    ledgerCurrencyOptions,
    defaultBankMoneyCurrencyType,
    primaryCurrency,
    secondaryCurrency,
  } = useIntlFormatting();
  const formatMovementOccurredAt = useCallback(
    (iso: string) => {
      try {
        return formatDateTimeMedium(new Date(iso));
      } catch {
        return iso;
      }
    },
    [formatDateTimeMedium]
  );
  const movementStatusLabel = useCallback(
    (status: string): string => {
      switch (status) {
        case 'completed':
          return t('pages.accounts.movementStatus.completed');
        case 'pending':
          return t('pages.accounts.movementStatus.pending');
        case 'cancelled':
          return t('pages.accounts.movementStatus.cancelled');
        default:
          return status;
      }
    },
    [t]
  );
  const { pageSize: accountPageSize, setPageSize: setAccountPageSize, pageSizeOptions: accountPageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:accounts', TABLE_PAGE_SIZE_ACCOUNTS);
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [summary, setSummary] = useState({
    totalBalanceDop: 0,
    totalBalanceUsd: 0,
    totalAccounts: 0,
    totalBankDop: 0,
    totalBankUsd: 0,
    totalCashDop: 0,
    totalCashUsd: 0,
  });
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    currency: primaryCurrency,
    note: '',
  });
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    bankAccountId: '',
    amountDelta: '',
    currency: primaryCurrency,
    reason: '',
  });
  const [movementsModalAccount, setMovementsModalAccount] = useState<BankAccount | null>(null);
  const [ledgerMovements, setLedgerMovements] = useState<BankAccountLedgerMovement[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [formData, setFormData] = useState({
    bankName: '',
    accountType: '',
    accountNumber: '',
    balanceDop: '',
    balanceUsd: '',
    currencyType: 'DOP' as 'DOP' | 'USD' | 'DUAL',
    accountKind: 'bank' as 'bank' | 'cash' | 'wallet',
  });

  const fetchAccounts = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (searchTerm) params.search = searchTerm;
      if (bankFilter) params.bank = bankFilter;

      const response = await api.get('/accounts', { params });
      setAccounts(response.data.accounts);
      setSummary(
        response.data.summary || {
          totalBalanceDop: 0,
          totalBalanceUsd: 0,
          totalAccounts: 0,
          totalBankDop: 0,
          totalBankUsd: 0,
          totalCashDop: 0,
          totalCashUsd: 0,
        }
      );
    } catch {
      toast.error(t('toast.accounts.loadError'));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, bankFilter, t]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const { visible: summaryBarVisible, toggle: toggleSummaryBar } = usePersistedSummaryBarVisible(
    user?.id,
    'accounts'
  );

  const { ordered: orderedAccounts, setOrderByIds } = usePersistedIdOrder<BankAccount>({
    module: 'accounts',
    userId: user?.id,
    sourceItems: accounts,
  });
  const commitAccountOrder = useCallback(
    (next: BankAccount[]) => {
      setOrderByIds(next.map((a) => a.id));
    },
    [setOrderByIds]
  );

  const [listPage, setListPage] = useState(1);
  useEffect(() => {
    setListPage(1);
  }, [searchTerm, bankFilter, accountPageSize]);
  const accountTotalPages = Math.max(1, Math.ceil(orderedAccounts.length / accountPageSize));
  const accountPageSafe = Math.min(listPage, accountTotalPages);
  useEffect(() => {
    setListPage((p) => Math.min(p, accountTotalPages));
  }, [accountTotalPages]);
  const pagedAccounts = useMemo(() => {
    const start = (accountPageSafe - 1) * accountPageSize;
    return orderedAccounts.slice(start, start + accountPageSize);
  }, [orderedAccounts, accountPageSafe, accountPageSize]);
  const accountListStart = (accountPageSafe - 1) * accountPageSize;
  const listDnd = useListOrderPageDnd(pagedAccounts, accountListStart, orderedAccounts, commitAccountOrder, {
    ghostLabel: (a) =>
      [a.bankName, a.accountNumber].filter((s) => Boolean(s && String(s).trim())).join(' · '),
  });

  const accountsForTransfer = useMemo(
    () =>
      accounts.filter((a) =>
        a.isActive && bankAccountSupportsLedgerCurrency(a, transferForm.currency, primaryCurrency, secondaryCurrency)
      ),
    [accounts, transferForm.currency, primaryCurrency, secondaryCurrency]
  );

  const accountsForAdjust = useMemo(
    () =>
      accounts.filter((a) =>
        a.isActive && bankAccountSupportsLedgerCurrency(a, adjustForm.currency, primaryCurrency, secondaryCurrency)
      ),
    [accounts, adjustForm.currency, primaryCurrency, secondaryCurrency]
  );

  const copyBankAccountDetails = async (account: BankAccount) => {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    const text = buildBankAccountCopyText(account, fullName, user?.cedula ?? '', {
      bankName: t('pages.accounts.copyBankName'),
      accountNumber: t('pages.accounts.copyAccountNumber'),
      accountType: t('pages.accounts.copyAccountType'),
      name: t('pages.accounts.copyName'),
      idNumber: t('pages.accounts.copyIdNumber'),
    });
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('toast.generic.copied'));
    } catch {
      toast.error(t('toast.generic.copyFailed'));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        balanceDop: formData.balanceDop ? parseFloat(formData.balanceDop) : 0,
        balanceUsd: formData.balanceUsd ? parseFloat(formData.balanceUsd) : 0,
        accountNumber: formData.accountNumber || null,
        accountKind: formData.accountKind,
      };

      if (editingAccount) {
        await api.put(`/accounts/${editingAccount.id}`, data);
        toast.success(t('toast.accounts.updated'));
      } else {
        await api.post('/accounts', data);
        toast.success(t('toast.accounts.created'));
      }

      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.accounts.saveError'));
    }
  };

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/accounts/transfers', {
        fromAccountId: parseInt(transferForm.fromAccountId, 10),
        toAccountId: parseInt(transferForm.toAccountId, 10),
        amount: parseFloat(transferForm.amount),
        currency: transferForm.currency,
        note: transferForm.note || undefined,
      });
      toast.success(t('toast.accounts.transferDone'));
      setShowTransferModal(false);
      setTransferForm({ fromAccountId: '', toAccountId: '', amount: '', currency: defaultLedgerCurrency, note: '' });
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.accounts.transferError'));
    }
  };

  const submitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(adjustForm.bankAccountId, 10);
    if (!id) {
      toast.error(t('toast.generic.selectAccount'));
      return;
    }
    try {
      await api.post(`/accounts/${id}/cash-adjustments`, {
        amountDelta: parseFloat(adjustForm.amountDelta),
        currency: adjustForm.currency,
        reason: adjustForm.reason || undefined,
      });
      toast.success(t('toast.accounts.adjustmentRegistered'));
      setShowAdjustModal(false);
      setAdjustForm({ bankAccountId: '', amountDelta: '', currency: defaultLedgerCurrency, reason: '' });
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.accounts.adjustmentError'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('confirm.deleteBankAccount'))) return;
    try {
      await api.delete(`/accounts/${id}`);
      toast.success(t('toast.accounts.deleted'));
      fetchAccounts();
    } catch (error: any) {
      toast.error(t('toast.accounts.deleteError'));
    }
  };

  const resetForm = () => {
    setFormData({
      bankName: '',
      accountType: '',
      accountNumber: '',
      balanceDop: '',
      balanceUsd: '',
      currencyType: defaultBankMoneyCurrencyType,
      accountKind: 'bank',
    });
    setEditingAccount(null);
  };

  useEscapeKey(showModal, () => {
    setShowModal(false);
    resetForm();
  });
  useEscapeKey(!!movementsModalAccount, () => setMovementsModalAccount(null));

  useEffect(() => {
    if (!movementsModalAccount) {
      setLedgerMovements([]);
      setLedgerTotal(0);
      return;
    }
    let cancelled = false;
    (async () => {
      setMovementsLoading(true);
      try {
        const res = await api.get(`/accounts/${movementsModalAccount.id}/movements`, {
          params: { limit: 100, offset: 0 },
        });
        if (!cancelled) {
          setLedgerMovements(res.data.movements || []);
          setLedgerTotal(Number(res.data.total) || 0);
        }
      } catch {
        if (!cancelled) {
          toast.error(t('toast.accounts.movementsLoadError'));
          setLedgerMovements([]);
          setLedgerTotal(0);
        }
      } finally {
        if (!cancelled) setMovementsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [movementsModalAccount, t]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.accounts.title')}
        subtitle={t('pages.accounts.subtitle')}
        actions={
          <div className="flex flex-wrap gap-2 w-full sm:w-auto shrink-0 items-stretch sm:items-center justify-end">
            <SummaryBarToggleButton visible={summaryBarVisible} onToggle={toggleSummaryBar} />
            <button
              type="button"
              onClick={() => {
                setTransferForm({ fromAccountId: '', toAccountId: '', amount: '', currency: defaultLedgerCurrency, note: '' });
                setShowTransferModal(true);
              }}
              className="btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <ArrowLeftRight size={18} />
              <span>{t('pages.accounts.transfer')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAdjustForm({ bankAccountId: '', amountDelta: '', currency: defaultLedgerCurrency, reason: '' });
                setShowAdjustModal(true);
              }}
              className="btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <span aria-hidden>💵</span>
              <span>{t('pages.accounts.cashAdjustment')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Plus size={20} />
              <span>{t('pages.accounts.addAccount')}</span>
            </button>
          </div>
        }
      />

      {/* Summary */}
      {summaryBarVisible && summary && (
        <div className="card-view">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.accounts.totalBalanceCurrency', { currency: primaryCurrency })}</p>
              <p className="text-2xl font-bold text-white">{fc(summary.totalBalanceDop, primaryCurrency)}</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.accounts.totalBalanceCurrency', { currency: secondaryCurrency })}</p>
              <p className="text-2xl font-bold text-white">{fc(summary.totalBalanceUsd, secondaryCurrency)}</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.accounts.totalAccounts')}</p>
              <p className="text-2xl font-bold text-white">{summary.totalAccounts}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {accounts.length > 0 && (
        <>
          <div className="card-view">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
                <input
                  type="text"
                  placeholder={t('pages.accounts.searchPlaceholder')}
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
                  <option value="">{t('pages.accounts.allBanks')}</option>
                  {Array.from(new Set(accounts.map(a => a.bankName))).map((bank) => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      {accounts.length === 0 ? (
        <div className="card-view text-center py-12 sm:py-16">
          <Wallet className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">{t('pages.accounts.emptyState')}</p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary"
          >
            {t('pages.accounts.addFirstAccount')}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 xl:gap-6">
            {pagedAccounts.map((account) => (
              <motion.article
                key={account.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                {...listDnd.droppableAttr(account.id)}
                className={[
                  LIST_CARD_SHELL,
                  listCardAccentNeutral(),
                  listDnd.dragId === account.id ? 'opacity-[0.22]' : '',
                  listDnd.dragId !== null &&
                  listDnd.pointerOverItemId === account.id &&
                  listDnd.dragId !== account.id
                    ? 'ring-2 ring-primary-400/75 z-[1]'
                    : '',
                ].join(' ')}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[min(100%,12rem)] flex-1 space-y-2 pr-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                        <span aria-hidden>{account.accountKind === 'bank' ? '🏦' : '💵'}</span>
                        <Wallet className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                        {account.accountType}
                      </span>
                      <span className="text-xs text-dark-500 sm:text-sm">{account.currencyType}</span>
                    </div>
                    <h3 className="break-words text-lg font-bold leading-snug text-white sm:text-xl">{account.bankName}</h3>
                    {account.accountNumber && (
                      <span className="inline-flex max-w-full truncate rounded-md bg-primary-600/15 px-2 py-0.5 text-xs font-medium text-primary-200 ring-1 ring-primary-500/25">
                        {account.accountNumber}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <ListOrderDragHandle
                      itemId={account.id}
                      gripBinder={listDnd.gripBinder}
                      disabled={pagedAccounts.length < 2}
                    />
                    <button
                      type="button"
                      onClick={() => setMovementsModalAccount(account)}
                      className={listCardBtnEdit}
                      title={t('pages.accounts.movementsTitle')}
                      aria-label={t('pages.accounts.movementsAria')}
                    >
                      <ScrollText className="h-5 w-5" />
                    </button>
                    {account.accountKind === 'bank' && (
                      <button
                        type="button"
                        onClick={() => copyBankAccountDetails(account)}
                        className={listCardBtnEdit}
                        title={t('pages.accounts.copyTitle')}
                        aria-label={t('pages.accounts.copyAria')}
                      >
                        <Copy className="h-5 w-5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingAccount(account);
                        setFormData({
                          bankName: account.bankName,
                          accountType: account.accountType,
                          accountNumber: account.accountNumber || '',
                          balanceDop: account.balanceDop.toString(),
                          balanceUsd: account.balanceUsd.toString(),
                          currencyType: account.currencyType,
                          accountKind: account.accountKind || 'bank',
                        });
                        setShowModal(true);
                      }}
                      className={listCardBtnEdit}
                      title={t('common.actions.edit')}
                      aria-label={t('pages.accounts.editAria')}
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <EntityActiveToggle
                      resourcePath="accounts"
                      entityId={account.id}
                      isActive={account.isActive}
                      entityLabel={account.bankName}
                      onChanged={fetchAccounts}
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(account.id)}
                      className={listCardBtnDanger}
                      title={t('common.actions.delete')}
                      aria-label={t('pages.accounts.deleteAria')}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-dark-700/80 pt-4">
                  <div className="metrics-cq">
                    <div className="metrics-row-2">
                      {(account.currencyType === 'DOP' || account.currencyType === 'DUAL') && (
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                          {t('pages.accounts.balanceCurrency', { currency: primaryCurrency })}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                          {fc(account.balanceDop, primaryCurrency)}
                        </p>
                      </div>
                    )}
                    {(account.currencyType === 'USD' || account.currencyType === 'DUAL') && (
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                          {t('pages.accounts.balanceCurrency', { currency: secondaryCurrency })}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                          {fc(account.balanceUsd, secondaryCurrency)}
                        </p>
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
          <ListOrderDragGhostPortal ghost={listDnd.dragGhost} />
          <TablePagination
            className="mt-4 sm:mt-5"
            currentPage={accountPageSafe}
            totalPages={accountTotalPages}
            totalItems={orderedAccounts.length}
            itemsPerPage={accountPageSize}
            onPageChange={setListPage}
            itemLabel={t('pages.accounts.itemsLabel')}
            variant="card"
            pageSizeOptions={accountPageSizeOptions}
            onPageSizeChange={setAccountPageSize}
          />
        </>
      )}

      {movementsModalAccount && (
        <div
          className="modal-overlay"
          onClick={() => setMovementsModalAccount(null)}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-2xl w-full max-h-[min(90vh,40rem)] flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accounts-movements-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4 shrink-0">
              <div className="min-w-0">
                <h2 id="accounts-movements-title" className="text-xl font-bold text-white">
                  {t('pages.accounts.movements')}
                </h2>
                <p className="text-dark-400 text-sm mt-1 truncate">
                  {formatBankAccountOptionLabel(movementsModalAccount)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMovementsModalAccount(null)}
                className="text-dark-400 hover:text-white p-1 rounded-md"
                aria-label={t('common.actions.close')}
              >
                <X size={22} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
              {movementsLoading ? (
                <div className="flex justify-center py-16">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-500" />
                </div>
              ) : ledgerMovements.length === 0 ? (
                <p className="text-dark-400 text-center py-12 text-sm">
                  {t('pages.accounts.noMovements')}
                </p>
              ) : (
                <ul className="space-y-2 pb-2">
                  {ledgerMovements.map((m) => (
                    <li
                      key={m.id}
                      className="rounded-xl border border-dark-600/60 bg-dark-900/40 px-3 py-2.5 sm:px-4 sm:py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-xs text-dark-500 tabular-nums shrink-0">
                          {formatMovementOccurredAt(m.occurredAt)}
                        </p>
                        <span
                          className={[
                            'text-[0.65rem] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5',
                            m.direction === 'IN'
                              ? 'bg-emerald-900/35 text-emerald-300 ring-1 ring-emerald-500/30'
                              : 'bg-rose-900/30 text-rose-200 ring-1 ring-rose-500/25',
                          ].join(' ')}
                        >
                          {m.direction === 'IN' ? t('pages.accounts.directionIn') : t('pages.accounts.directionOut')}
                        </span>
                      </div>
                      <p className="text-sm font-semibold tabular-nums text-white mt-1.5">
                        {fc(m.amount, m.currency)}
                      </p>
                      <p className="text-sm text-dark-300 mt-1 break-words">{m.description}</p>
                      <p className="text-[0.7rem] text-dark-500 mt-2">
                        {t('pages.accounts.status')}:{' '}
                        <span className="text-dark-400">{movementStatusLabel(m.status)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {!movementsLoading && ledgerTotal > ledgerMovements.length && (
              <p className="text-xs text-dark-500 shrink-0 pt-3 border-t border-dark-700/80 mt-2">
                {t('pages.accounts.showingRecentMovements', { shown: ledgerMovements.length, total: ledgerTotal })}
              </p>
            )}
          </motion.div>
        </div>
      )}

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
            aria-labelledby="accounts-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="accounts-modal-title" className="text-2xl font-bold text-white mb-6">
              {editingAccount ? t('pages.accounts.editAccount') : t('pages.accounts.newAccount')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">{t('pages.accounts.nameBankOrCash')}</label><input type="text" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="input w-full" required /></div>
                <div>
                  <label className="label">{t('pages.accounts.class')}</label>
                  <select
                    value={formData.accountKind}
                    onChange={(e) => setFormData({ ...formData, accountKind: e.target.value as 'bank' | 'cash' | 'wallet' })}
                    className="input w-full"
                  >
                    <option value="bank">{t('pages.accounts.kindBank')}</option>
                    <option value="cash">{t('pages.accounts.kindCash')}</option>
                    <option value="wallet">{t('pages.accounts.kindWallet')}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">{t('pages.accounts.accountTypeLabel')}</label><input type="text" value={formData.accountType} onChange={(e) => setFormData({ ...formData, accountType: e.target.value })} className="input w-full" placeholder={t('pages.accounts.accountTypePlaceholder')} required /></div>
                <div><label className="label">{t('pages.accounts.numberOptional')}</label><input type="text" value={formData.accountNumber} onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })} className="input w-full" /></div>
              </div>
              <div>
                <label className="label">{t('pages.accounts.currencyType')}</label>
                <select
                  value={formData.currencyType}
                  onChange={(e) => setFormData({ ...formData, currencyType: e.target.value as any })}
                  className="input w-full"
                >
                  {ledgerCurrencyOptions.map((code) => (
                    <option key={code} value={code}>
                      {currencySelectLabel(code)}
                    </option>
                  ))}
                  <option value="DUAL">{currencySelectLabel('DUAL')}</option>
                </select>
              </div>
              {(formData.currencyType === 'DOP' || formData.currencyType === 'DUAL') && (
                <div>
                  <label className="label">{t('pages.accounts.balanceCurrency', { currency: primaryCurrency })}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.balanceDop}
                    onChange={(e) => setFormData({ ...formData, balanceDop: e.target.value })}
                    className="input w-full"
                    required={formData.currencyType === 'DOP'}
                  />
                </div>
              )}
              {(formData.currencyType === 'USD' || formData.currencyType === 'DUAL') && (
                <div>
                  <label className="label">{t('pages.accounts.balanceCurrency', { currency: secondaryCurrency })}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.balanceUsd}
                    onChange={(e) => setFormData({ ...formData, balanceUsd: e.target.value })}
                    className="input w-full"
                    required={formData.currencyType === 'USD'}
                  />
                </div>
              )}
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">{editingAccount ? t('pages.accounts.update') : t('pages.accounts.create')}</button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">{t('common.actions.cancel')}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showTransferModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowTransferModal(false)}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-lg w-full"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-white mb-4">{t('pages.accounts.transferBetweenAccounts')}</h2>
            <p className="text-dark-400 text-sm mb-4">{t('pages.accounts.transferDescription')}</p>
            <form onSubmit={submitTransfer} className="space-y-3">
              <div>
                <label className="label">{t('pages.accounts.from')}</label>
                <select
                  value={transferForm.fromAccountId}
                  onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">{t('pages.accounts.select')}</option>
                  {accountsForTransfer.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">{t('pages.accounts.to')}</label>
                <select
                  value={transferForm.toAccountId}
                  onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">{t('pages.accounts.select')}</option>
                  {accountsForTransfer.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('pages.accounts.amount')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">{t('pages.accounts.currency')}</label>
                  <select
                    value={transferForm.currency}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, currency: e.target.value })
                    }
                    className="input w-full"
                  >
                    {ledgerCurrencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {currencySelectLabel(code)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">{t('pages.accounts.noteOptional')}</label>
                <input
                  type="text"
                  value={transferForm.note}
                  onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  {t('pages.accounts.transfer')}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowTransferModal(false)}>
                  {t('common.actions.cancel')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showAdjustModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAdjustModal(false)}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-lg w-full"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-white mb-2">{t('pages.accounts.cashAdjustment')}</h2>
            <p className="text-dark-400 text-sm mb-4">
              {t('pages.accounts.adjustDescription')}
            </p>
            <form onSubmit={submitAdjust} className="space-y-3">
              <div>
                <label className="label">{t('pages.accounts.account')}</label>
                <select
                  value={adjustForm.bankAccountId}
                  onChange={(e) => setAdjustForm({ ...adjustForm, bankAccountId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">{t('pages.accounts.select')}</option>
                  {accountsForAdjust.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('pages.accounts.delta')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={adjustForm.amountDelta}
                    onChange={(e) => setAdjustForm({ ...adjustForm, amountDelta: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">{t('pages.accounts.currency')}</label>
                  <select
                    value={adjustForm.currency}
                    onChange={(e) =>
                      setAdjustForm({ ...adjustForm, currency: e.target.value })
                    }
                    className="input w-full"
                  >
                    {ledgerCurrencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {currencySelectLabel(code)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">{t('pages.accounts.reasonOptional')}</label>
                <input
                  type="text"
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  {t('pages.accounts.registerAdjustment')}
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowAdjustModal(false)}>
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

export default Accounts;
