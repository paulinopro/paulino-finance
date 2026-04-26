import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import type { BankAccount, ExpenseCategory } from '../types';
import { formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';
import { Plus, Edit, Trash2, CheckCircle, Search, X, Calendar, Banknote, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { LIST_CARD_SHELL, listCardAccentReceivable, listCardBtnEdit, listCardBtnDanger } from '../utils/listCard';
import { formatDateForInput, formatDateDdMmYyyy } from '../utils/dateUtils';
import { TABLE_PAGE_SIZE_ACCOUNTS_RECEIVABLE } from '../constants/pagination';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { usePersistedIdOrder } from '../hooks/usePersistedIdOrder';
import { useListOrderPageDnd } from '../hooks/useListOrderPageDnd';
import ListOrderDragHandle from '../components/ListOrderDragHandle';
import SummaryBarToggleButton from '../components/SummaryBarToggleButton';
import { usePersistedSummaryBarVisible } from '../hooks/usePersistedSummaryBarVisible';

interface AccountReceivable {
  id: number;
  description: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'PENDING' | 'RECEIVED' | 'OVERDUE';
  category?: string;
  notes?: string;
  receivedDate?: string;
  totalReceived?: number;
  createdAt: string;
  updatedAt: string;
}

interface AccountPaymentRow {
  id: number;
  amount: number;
  paymentDate: string;
  createdAt: string;
  bankAccountId?: number | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const AccountsReceivable: React.FC = () => {
  const { user } = useAuth();
  const { visible: summaryBarVisible, toggle: toggleSummaryBar } = usePersistedSummaryBarVisible(
    user?.id,
    'accounts_receivable'
  );
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const receiveModalRef = useRef<HTMLDivElement>(null);
  const abonoModalRef = useRef<HTMLDivElement>(null);
  const historyModalRef = useRef<HTMLDivElement>(null);
  const editPaymentModalRef = useRef<HTMLDivElement>(null);

  const [accounts, setAccounts] = useState<AccountReceivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountReceivable | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    currency: 'DOP',
    dueDate: '',
    category: '',
    notes: '',
  });
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<AccountReceivable | null>(null);
  const [receiveDate, setReceiveDate] = useState(todayYmd());

  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [abonoTarget, setAbonoTarget] = useState<AccountReceivable | null>(null);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoDate, setAbonoDate] = useState(todayYmd());

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<AccountReceivable | null>(null);
  const [historyPayments, setHistoryPayments] = useState<AccountPaymentRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [paymentBeingEdited, setPaymentBeingEdited] = useState<AccountPaymentRow | null>(null);
  const [editPayAmount, setEditPayAmount] = useState('');
  const [editPayDate, setEditPayDate] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [abonoBankAccountId, setAbonoBankAccountId] = useState('');
  const [editPayBankAccountId, setEditPayBankAccountId] = useState('');

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await api.get('/categories');
        setCategories(response.data.categories || []);
      } catch {
        /* listado vacío si falla */
      }
    };
    loadCategories();
  }, []);

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

  const accountsForArAbono = useMemo(() => {
    if (!abonoTarget) return [];
    return bankAccounts.filter(
      (a) => a.currencyType === 'DUAL' || a.currencyType === abonoTarget.currency
    );
  }, [bankAccounts, abonoTarget]);

  const accountsForArEditPayment = useMemo(() => {
    if (!historyTarget) return [];
    return bankAccounts.filter(
      (a) => a.currencyType === 'DUAL' || a.currencyType === historyTarget.currency
    );
  }, [bankAccounts, historyTarget]);

  const fetchAccounts = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;

      const response = await api.get('/accounts-receivable', { params });
      setAccounts(response.data.accountsReceivable);
    } catch {
      toast.error('Error al cargar cuentas por cobrar');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.dueDate) {
      toast.error('Seleccione la fecha de vencimiento');
      return;
    }
    try {
      const data = {
        ...formData,
        amount: parseFloat(formData.amount),
        dueDate: formData.dueDate,
      };

      if (editingAccount) {
        await api.put(`/accounts-receivable/${editingAccount.id}`, data);
        toast.success('Cuenta por cobrar actualizada');
      } else {
        await api.post('/accounts-receivable', data);
        toast.success('Cuenta por cobrar creada');
      }

      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar cuenta por cobrar');
    }
  };

  const openReceiveModal = (account: AccountReceivable) => {
    setReceiveTarget(account);
    setReceiveDate(todayYmd());
    setShowReceiveModal(true);
  };

  const submitReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveTarget || !receiveDate) {
      toast.error('Seleccione la fecha del ingreso');
      return;
    }
    try {
      await api.put(`/accounts-receivable/${receiveTarget.id}/receive`, { paymentDate: receiveDate });
      toast.success('Cuenta marcada como cobrada; ingreso registrado en la fecha indicada');
      setShowReceiveModal(false);
      setReceiveTarget(null);
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al marcar como cobrada');
    }
  };

  const openAbonoModal = (account: AccountReceivable) => {
    setAbonoTarget(account);
    setAbonoAmount('');
    setAbonoDate(todayYmd());
    setAbonoBankAccountId('');
    setShowAbonoModal(true);
  };

  const submitAbono = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!abonoTarget) return;
    const amt = parseFloat(abonoAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Indique un monto válido');
      return;
    }
    if (!abonoDate) {
      toast.error('Seleccione la fecha del abono');
      return;
    }
    try {
      const body: Record<string, unknown> = { amount: amt, paymentDate: abonoDate };
      if (abonoBankAccountId) {
        body.bankAccountId = parseInt(abonoBankAccountId, 10);
      }
      await api.post(`/accounts-receivable/${abonoTarget.id}/payments`, body);
      toast.success('Abono registrado como ingreso');
      setShowAbonoModal(false);
      setAbonoTarget(null);
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al registrar abono');
    }
  };

  const openHistoryModal = async (account: AccountReceivable) => {
    setHistoryTarget(account);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setHistoryPayments([]);
    try {
      const res = await api.get(`/accounts-receivable/${account.id}/payments`);
      setHistoryPayments(res.data.payments || []);
    } catch {
      toast.error('Error al cargar abonos');
    } finally {
      setHistoryLoading(false);
    }
  };

  const reloadHistoryAndAccounts = async () => {
    await fetchAccounts();
    if (historyTarget) {
      try {
        const res = await api.get(`/accounts-receivable/${historyTarget.id}/payments`);
        setHistoryPayments(res.data.payments || []);
      } catch {
        /* ignore */
      }
    }
  };

  const openEditPaymentModal = (p: AccountPaymentRow) => {
    setPaymentBeingEdited(p);
    setEditPayAmount(String(p.amount));
    setEditPayDate(formatDateForInput(p.paymentDate));
    setEditPayBankAccountId(
      p.bankAccountId != null && p.bankAccountId !== undefined ? String(p.bankAccountId) : ''
    );
  };

  const submitEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyTarget || !paymentBeingEdited) return;
    const amt = parseFloat(editPayAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Indique un monto válido');
      return;
    }
    if (!editPayDate) {
      toast.error('Seleccione la fecha del ingreso');
      return;
    }
    try {
      await api.put(`/accounts-receivable/${historyTarget.id}/payments/${paymentBeingEdited.id}`, {
        amount: amt,
        paymentDate: editPayDate,
        bankAccountId: editPayBankAccountId ? parseInt(editPayBankAccountId, 10) : null,
      });
      toast.success('Abono actualizado; el ingreso fue sincronizado');
      setPaymentBeingEdited(null);
      await reloadHistoryAndAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al actualizar abono');
    }
  };

  const handleDeletePayment = async (p: AccountPaymentRow) => {
    if (!historyTarget) return;
    if (
      !window.confirm(
        '¿Eliminar este abono? Se eliminará el ingreso vinculado en el módulo de Ingresos y se actualizará el saldo de la cuenta.'
      )
    ) {
      return;
    }
    try {
      await api.delete(`/accounts-receivable/${historyTarget.id}/payments/${p.id}`);
      toast.success('Abono eliminado');
      await reloadHistoryAndAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al eliminar abono');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta cuenta por cobrar?')) {
      return;
    }

    try {
      await api.delete(`/accounts-receivable/${id}`);
      toast.success('Cuenta por cobrar eliminada');
      fetchAccounts();
    } catch {
      toast.error('Error al eliminar cuenta por cobrar');
    }
  };

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      currency: 'DOP',
      dueDate: '',
      category: '',
      notes: '',
    });
    setEditingAccount(null);
  };

  const openEditModal = (account: AccountReceivable) => {
    setEditingAccount(account);
    setFormData({
      description: account.description,
      amount: account.amount.toString(),
      currency: account.currency,
      dueDate: formatDateForInput(account.dueDate),
      category: account.category || '',
      notes: account.notes || '',
    });
    setShowModal(true);
  };

  const closeAllModals = () => {
    setShowModal(false);
    setShowReceiveModal(false);
    setShowAbonoModal(false);
    setShowHistoryModal(false);
    setReceiveTarget(null);
    setAbonoTarget(null);
    setHistoryTarget(null);
    setPaymentBeingEdited(null);
    resetForm();
  };

  const anyModalOpen =
    showModal || showReceiveModal || showAbonoModal || showHistoryModal || paymentBeingEdited !== null;

  useEscapeKey(anyModalOpen, closeAllModals);
  useModalFocusTrap(modalPanelRef, showModal);
  useModalFocusTrap(receiveModalRef, showReceiveModal);
  useModalFocusTrap(abonoModalRef, showAbonoModal);
  useModalFocusTrap(historyModalRef, showHistoryModal);

  const filteredAccounts = accounts.filter((account) =>
    account.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { ordered: orderedFiltered, setOrderByIds: setArOrderByIds } = usePersistedIdOrder<AccountReceivable>({
    module: 'accounts_receivable',
    userId: user?.id,
    sourceItems: filteredAccounts,
  });
  const commitArOrder = useCallback(
    (next: AccountReceivable[]) => {
      setArOrderByIds(next.map((a) => a.id));
    },
    [setArOrderByIds]
  );

  const [listPage, setListPage] = useState(1);
  useEffect(() => {
    setListPage(1);
  }, [searchTerm, statusFilter]);
  const arTotalPages = Math.max(1, Math.ceil(orderedFiltered.length / TABLE_PAGE_SIZE_ACCOUNTS_RECEIVABLE));
  const arPageSafe = Math.min(listPage, arTotalPages);
  useEffect(() => {
    setListPage((p) => Math.min(p, arTotalPages));
  }, [arTotalPages]);
  const pagedAccountsReceivable = useMemo(() => {
    const start = (arPageSafe - 1) * TABLE_PAGE_SIZE_ACCOUNTS_RECEIVABLE;
    return orderedFiltered.slice(start, start + TABLE_PAGE_SIZE_ACCOUNTS_RECEIVABLE);
  }, [orderedFiltered, arPageSafe]);
  const arListStart = (arPageSafe - 1) * TABLE_PAGE_SIZE_ACCOUNTS_RECEIVABLE;
  const listDnd = useListOrderPageDnd(pagedAccountsReceivable, arListStart, orderedFiltered, commitArOrder);

  const receivableSummaryKpis = useMemo(() => {
    let dop = 0;
    let usd = 0;
    for (const a of orderedFiltered) {
      const rem = Math.max(0, a.amount - (a.totalReceived ?? 0));
      if (a.status === 'RECEIVED' || rem <= 0.0001) continue;
      const c = String(a.currency || 'DOP').toUpperCase();
      if (c === 'USD') usd += rem;
      else dop += rem;
    }
    return { count: orderedFiltered.length, dop, usd };
  }, [orderedFiltered]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'RECEIVED':
        return 'text-green-400 bg-green-400/10';
      case 'OVERDUE':
        return 'text-red-400 bg-red-400/10';
      default:
        return 'text-yellow-400 bg-yellow-400/10';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'RECEIVED':
        return 'Cobrada';
      case 'OVERDUE':
        return 'Vencida';
      default:
        return 'Pendiente';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas por Cobrar"
        subtitle="Gestiona tus cuentas por cobrar"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
            <SummaryBarToggleButton visible={summaryBarVisible} onToggle={toggleSummaryBar} />
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto sm:flex-initial text-sm sm:text-base"
            >
              <Plus size={20} />
              Nueva Cuenta por Cobrar
            </button>
          </div>
        }
      />

      {summaryBarVisible && (
        <div className="card-view">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">Pendiente por cobrar (DOP)</p>
              <p className="text-2xl font-bold text-white">
                {receivableSummaryKpis.dop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP
              </p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Pendiente por cobrar (USD)</p>
              <p className="text-2xl font-bold text-white">
                {receivableSummaryKpis.usd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD
              </p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Cantidad de Cuentas</p>
              <p className="text-2xl font-bold text-white">{receivableSummaryKpis.count}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-view">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos los estados</option>
            <option value="PENDING">Pendiente</option>
            <option value="RECEIVED">Cobrada</option>
            <option value="OVERDUE">Vencida</option>
          </select>
        </div>
      </div>

      {/* Accounts List */}
      {orderedFiltered.length === 0 ? (
        <div className="card-view text-center py-12 sm:py-16">
          <p className="text-dark-400">No hay cuentas por cobrar</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 xl:gap-6">
            {pagedAccountsReceivable.map((account) => {
              const totalReceived = account.totalReceived ?? 0;
              const remaining = Math.max(0, account.amount - totalReceived);
              const pct = account.amount > 0 ? Math.min(100, (totalReceived / account.amount) * 100) : 0;
              const canAct = account.status !== 'RECEIVED' && remaining > 0.001;

              return (
                <motion.article
                  key={account.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  onDragOver={listDnd.onDragOver}
                  onDrop={listDnd.onDrop(account.id)}
                  className={[
                    LIST_CARD_SHELL,
                    listCardAccentReceivable(account.status),
                    listDnd.dragId === account.id ? 'opacity-60' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="order-2 min-w-0 flex-1 space-y-2 sm:order-1 sm:pr-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                          Por cobrar
                        </span>
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${getStatusColor(account.status)}`}>
                          {getStatusText(account.status)}
                        </span>
                      </div>
                      <h3 className="text-balance break-words text-lg font-bold leading-snug text-white sm:text-xl">{account.description}</h3>
                      {account.category && (
                        <span className="inline-flex max-w-full truncate rounded-md bg-primary-600/15 px-2 py-0.5 text-xs font-medium text-primary-200 ring-1 ring-primary-500/25">
                          {account.category}
                        </span>
                      )}
                    </div>
                    <div className="order-1 flex w-full shrink-0 flex-wrap items-center justify-end gap-0.5 sm:order-2 sm:w-auto">
                      <ListOrderDragHandle
                        itemId={account.id}
                        onDragStart={listDnd.onDragStart}
                        onDragEnd={listDnd.onDragEnd}
                        disabled={pagedAccountsReceivable.length < 2}
                      />
                      {canAct && (
                        <>
                          <button
                            type="button"
                            onClick={() => openReceiveModal(account)}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-emerald-400 transition-colors hover:bg-emerald-500/15"
                            title="Marcar como cobrada (fecha del ingreso)"
                            aria-label="Marcar como cobrada"
                          >
                            <CheckCircle className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openAbonoModal(account)}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-sky-400 transition-colors hover:bg-sky-500/15"
                            title="Agregar abono"
                            aria-label="Agregar abono"
                          >
                            <Banknote className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => openHistoryModal(account)}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-amber-400 transition-colors hover:bg-amber-500/15"
                        title="Historial de abonos"
                        aria-label="Historial de abonos"
                      >
                        <History className="h-5 w-5" />
                      </button>
                      {account.status !== 'RECEIVED' && (
                        <button type="button" onClick={() => openEditModal(account)} className={listCardBtnEdit} title="Editar" aria-label="Editar">
                          <Edit className="h-5 w-5" />
                        </button>
                      )}
                      <button type="button" onClick={() => handleDelete(account.id)} className={listCardBtnDanger} title="Eliminar" aria-label="Eliminar">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 border-t border-dark-700/80 pt-4">
                    {account.status !== 'RECEIVED' && (
                      <div className="space-y-2 rounded-xl border border-dark-600/50 bg-dark-900/25 px-3 py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                          <span className="text-dark-400">Cobrado</span>
                          <span className="tabular-nums font-semibold text-white">
                            {totalReceived.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {account.currency}
                            <span className="ml-1 text-xs font-normal text-dark-500">({pct.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-dark-700 ring-1 ring-white/5">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-dark-500">
                          Pendiente:{' '}
                          <span className="tabular-nums text-dark-300">
                            {remaining.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {account.currency}
                          </span>
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:gap-3">
                      <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Monto</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                          {account.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                          <span className="text-xs font-normal text-dark-400">{account.currency}</span>
                        </p>
                      </div>
                      <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Vencimiento</p>
                        <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">{formatDateDdMmYyyy(account.dueDate)}</p>
                      </div>
                      {account.receivedDate && (
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3 xs:col-span-2">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Último cobro / cierre</p>
                          <p className="mt-0.5 text-sm font-semibold text-emerald-400 sm:text-base">{formatDateDdMmYyyy(account.receivedDate)}</p>
                        </div>
                      )}
                    </div>
                    {account.notes && (
                      <p className="rounded-xl border border-dark-600/50 bg-dark-900/20 px-3 py-2 text-sm text-dark-300">
                        <span className="text-dark-500">Notas:</span> {account.notes}
                      </p>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </div>
          <TablePagination
            currentPage={arPageSafe}
            totalPages={arTotalPages}
            totalItems={orderedFiltered.length}
            itemsPerPage={TABLE_PAGE_SIZE_ACCOUNTS_RECEIVABLE}
            onPageChange={setListPage}
            itemLabel="cuentas"
            variant="card"
          />
        </div>
      )}

      {/* Modal crear/editar */}
      {showModal && (
        <div className="modal-overlay" onClick={closeAllModals} role="presentation">
          <motion.div
            ref={modalPanelRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="accounts-receivable-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="accounts-receivable-modal-title" className="text-xl font-semibold text-white">
                {editingAccount ? 'Editar Cuenta por Cobrar' : 'Nueva Cuenta por Cobrar'}
              </h2>
              <button onClick={closeAllModals} className="text-dark-400 hover:text-white" type="button">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Descripción *</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Monto *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Moneda *</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="input"
                  >
                    <option value="DOP">DOP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Fecha de Vencimiento *</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="input"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Categoría</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="input"
                >
                  <option value="">
                    {categories.length === 0 ? 'Sin categorías (créalas en Categorías)' : 'Sin categoría'}
                  </option>
                  {formData.category && !categories.some((c) => c.name === formData.category) && (
                    <option value={formData.category}>{formData.category}</option>
                  )}
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="input min-h-[88px]"
                />
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingAccount ? 'Actualizar' : 'Crear'}
                </button>
                <button type="button" onClick={closeAllModals} className="btn-secondary flex-1">
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal marcar cobrada */}
      {showReceiveModal && receiveTarget && (
        <div className="modal-overlay" onClick={() => setShowReceiveModal(false)} role="presentation">
          <motion.div
            ref={receiveModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ar-receive-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="ar-receive-modal-title" className="text-xl font-semibold text-white">
                Marcar como cobrada
              </h2>
              <button type="button" onClick={() => setShowReceiveModal(false)} className="text-dark-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <p className="text-sm text-dark-400 mb-4">
              Se registrará un ingreso por el saldo pendiente (
              {(receiveTarget.amount - (receiveTarget.totalReceived ?? 0)).toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
              {receiveTarget.currency}) en la fecha que elijas.
            </p>
            <form onSubmit={submitReceive} className="space-y-4">
              <div>
                <label className="label">Fecha del ingreso *</label>
                <input type="date" className="input" value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)} required />
              </div>
              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  Confirmar cobro
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowReceiveModal(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal abono */}
      {showAbonoModal && abonoTarget && (
        <div className="modal-overlay" onClick={() => setShowAbonoModal(false)} role="presentation">
          <motion.div
            ref={abonoModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ar-abono-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="ar-abono-modal-title" className="text-xl font-semibold text-white">
                Agregar abono
              </h2>
              <button type="button" onClick={() => setShowAbonoModal(false)} className="text-dark-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <p className="text-sm text-dark-400 mb-4">
              Máximo:{' '}
              {(abonoTarget.amount - (abonoTarget.totalReceived ?? 0)).toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
              {abonoTarget.currency}
            </p>
            <form onSubmit={submitAbono} className="space-y-4">
              <div>
                <label className="label">Monto del abono *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input"
                  value={abonoAmount}
                  onChange={(e) => setAbonoAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Fecha del ingreso *</label>
                <input type="date" className="input" value={abonoDate} onChange={(e) => setAbonoDate(e.target.value)} required />
              </div>
              <div>
                <label className="label">Cuenta destino (opcional)</label>
                <select
                  className="input w-full"
                  value={abonoBankAccountId}
                  onChange={(e) => setAbonoBankAccountId(e.target.value)}
                >
                  <option value="">Sin cuenta — no suma saldo</option>
                  {accountsForArAbono.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  Registrar abono
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowAbonoModal(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Modal historial */}
      {showHistoryModal && historyTarget && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)} role="presentation">
          <motion.div
            ref={historyModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-lg w-full max-h-[85dvh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ar-history-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-dark-700/70 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500">Historial de abonos</p>
                  <h2 id="ar-history-modal-title" className="mt-1 text-lg font-semibold leading-snug text-white sm:text-xl">
                    <span className="line-clamp-3 break-words">{historyTarget.description}</span>
                  </h2>
                  {!historyLoading && historyPayments.length > 0 && (
                    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-dark-400">
                      <span className="tabular-nums font-semibold text-emerald-300">
                        {historyPayments
                          .reduce((acc, row) => acc + row.amount, 0)
                          .toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                        {historyTarget.currency}
                      </span>
                      <span className="text-dark-600" aria-hidden>
                        ·
                      </span>
                      <span>
                        {historyPayments.length} abono{historyPayments.length !== 1 ? 's' : ''}
                      </span>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowHistoryModal(false)}
                  className="shrink-0 rounded-lg p-2 text-dark-400 transition-colors hover:bg-dark-700/60 hover:text-white"
                  aria-label="Cerrar"
                >
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="mt-4">
              {historyLoading ? (
                <p className="py-12 text-center text-dark-400">Cargando…</p>
              ) : historyPayments.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dark-600/60 bg-dark-900/25 px-6 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dark-800/90 text-dark-500 ring-1 ring-white/5">
                    <Banknote className="h-6 w-6" aria-hidden />
                  </div>
                  <p className="max-w-[20rem] text-sm text-dark-400">No hay abonos registrados para esta cuenta.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {historyPayments.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl border border-dark-600/50 bg-gradient-to-br from-dark-800/45 to-dark-900/35 p-3.5 ring-1 ring-white/[0.04]"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dark-700/70 text-emerald-400/90 ring-1 ring-white/5"
                            aria-hidden
                          >
                            <Calendar className="h-[1.1rem] w-[1.1rem]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500">Fecha del ingreso</p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                              {formatDateDdMmYyyy(p.paymentDate)}
                            </p>
                            {(p.bankAccountName || p.bankAccountId != null) && (
                              <p className="mt-1 text-xs text-dark-500">
                                Destino:{' '}
                                {formatBankAccountOptionLabel({
                                  bankName: p.bankAccountName || 'Cuenta',
                                  accountNumber: p.bankAccountNumber || '',
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dark-700/50 pt-3 sm:border-t-0 sm:pt-0 sm:pl-2">
                          <p className="text-left sm:text-right">
                            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500 sm:hidden">Monto</span>
                            <span className="block text-lg font-bold tabular-nums leading-tight text-white sm:text-xl">
                              {p.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                              <span className="text-sm font-normal text-dark-400">{historyTarget.currency}</span>
                            </span>
                          </p>
                          <div className="flex shrink-0 items-center justify-end gap-0.5">
                            <button
                              type="button"
                              className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl p-1.5 ${listCardBtnEdit}`}
                              title="Editar abono"
                              aria-label="Editar abono"
                              onClick={() => openEditPaymentModal(p)}
                            >
                              <Edit className="h-[18px] w-[18px]" />
                            </button>
                            <button
                              type="button"
                              className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl p-1.5 ${listCardBtnDanger}`}
                              title="Eliminar abono"
                              aria-label="Eliminar abono"
                              onClick={() => handleDeletePayment(p)}
                            >
                              <Trash2 className="h-[18px] w-[18px]" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {paymentBeingEdited && historyTarget && (
        <div className="modal-overlay" onClick={() => setPaymentBeingEdited(null)} role="presentation">
          <motion.div
            ref={editPaymentModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ar-edit-payment-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ar-edit-payment-title" className="text-xl font-semibold text-white mb-4">
              Editar abono
            </h2>
            <form onSubmit={submitEditPayment} className="space-y-4">
              <div>
                <label className="label">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input w-full"
                  value={editPayAmount}
                  onChange={(e) => setEditPayAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Fecha del ingreso *</label>
                <input
                  type="date"
                  className="input w-full"
                  value={editPayDate}
                  onChange={(e) => setEditPayDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Cuenta destino (opcional)</label>
                <select
                  className="input w-full"
                  value={editPayBankAccountId}
                  onChange={(e) => setEditPayBankAccountId(e.target.value)}
                >
                  <option value="">Sin cuenta</option>
                  {accountsForArEditPayment.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  Guardar
                </button>
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => setPaymentBeingEdited(null)}
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

export default AccountsReceivable;
