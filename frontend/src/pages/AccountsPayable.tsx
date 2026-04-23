import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import type { BankAccount, ExpenseCategory } from '../types';
import { formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';
import { Plus, Edit, Trash2, CheckCircle, Search, X, Calendar, Banknote, History } from 'lucide-react';
import toast from 'react-hot-toast';
import { LIST_CARD_SHELL, listCardAccentPayable, listCardBtnEdit, listCardBtnDanger } from '../utils/listCard';
import { formatDateForInput, formatDateDdMmYyyy } from '../utils/dateUtils';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';

interface AccountPayable {
  id: number;
  description: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  category?: string;
  notes?: string;
  paidDate?: string;
  totalPaid?: number;
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

const AccountsPayable: React.FC = () => {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const payModalRef = useRef<HTMLDivElement>(null);
  const abonoModalRef = useRef<HTMLDivElement>(null);
  const historyModalRef = useRef<HTMLDivElement>(null);
  const editPaymentModalRef = useRef<HTMLDivElement>(null);

  const [accounts, setAccounts] = useState<AccountPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountPayable | null>(null);
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

  const [showPayModal, setShowPayModal] = useState(false);
  const [payTarget, setPayTarget] = useState<AccountPayable | null>(null);
  const [payDate, setPayDate] = useState(todayYmd());

  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [abonoTarget, setAbonoTarget] = useState<AccountPayable | null>(null);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoDate, setAbonoDate] = useState(todayYmd());

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<AccountPayable | null>(null);
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

  const accountsForApAbono = useMemo(() => {
    if (!abonoTarget) return [];
    return bankAccounts.filter(
      (a: BankAccount) => a.currencyType === 'DUAL' || a.currencyType === abonoTarget.currency
    );
  }, [bankAccounts, abonoTarget]);

  const accountsForApEditPayment = useMemo(() => {
    if (!historyTarget) return [];
    return bankAccounts.filter(
      (a: BankAccount) => a.currencyType === 'DUAL' || a.currencyType === historyTarget.currency
    );
  }, [bankAccounts, historyTarget]);

  const fetchAccounts = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;

      const response = await api.get('/accounts-payable', { params });
      setAccounts(response.data.accountsPayable);
    } catch {
      toast.error('Error al cargar cuentas por pagar');
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
        await api.put(`/accounts-payable/${editingAccount.id}`, data);
        toast.success('Cuenta por pagar actualizada');
      } else {
        await api.post('/accounts-payable', data);
        toast.success('Cuenta por pagar creada');
      }

      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar cuenta por pagar');
    }
  };

  const openPayModal = (account: AccountPayable) => {
    setPayTarget(account);
    setPayDate(todayYmd());
    setShowPayModal(true);
  };

  const submitPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget || !payDate) {
      toast.error('Seleccione la fecha del gasto');
      return;
    }
    try {
      await api.put(`/accounts-payable/${payTarget.id}/pay`, { paymentDate: payDate });
      toast.success('Cuenta marcada como pagada; gasto registrado en la fecha indicada');
      setShowPayModal(false);
      setPayTarget(null);
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al marcar como pagada');
    }
  };

  const openAbonoModal = (account: AccountPayable) => {
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
      await api.post(`/accounts-payable/${abonoTarget.id}/payments`, body);
      toast.success('Abono registrado como gasto');
      setShowAbonoModal(false);
      setAbonoTarget(null);
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al registrar abono');
    }
  };

  const openHistoryModal = async (account: AccountPayable) => {
    setHistoryTarget(account);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setHistoryPayments([]);
    try {
      const res = await api.get(`/accounts-payable/${account.id}/payments`);
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
        const res = await api.get(`/accounts-payable/${historyTarget.id}/payments`);
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
      toast.error('Seleccione la fecha del gasto');
      return;
    }
    try {
      await api.put(`/accounts-payable/${historyTarget.id}/payments/${paymentBeingEdited.id}`, {
        amount: amt,
        paymentDate: editPayDate,
        bankAccountId: editPayBankAccountId ? parseInt(editPayBankAccountId, 10) : null,
      });
      toast.success('Abono actualizado; el gasto fue sincronizado');
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
        '¿Eliminar este abono? Se eliminará el gasto vinculado en el módulo de Gastos y se actualizará el saldo de la cuenta.'
      )
    ) {
      return;
    }
    try {
      await api.delete(`/accounts-payable/${historyTarget.id}/payments/${p.id}`);
      toast.success('Abono eliminado');
      await reloadHistoryAndAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al eliminar abono');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta cuenta por pagar?')) {
      return;
    }

    try {
      await api.delete(`/accounts-payable/${id}`);
      toast.success('Cuenta por pagar eliminada');
      fetchAccounts();
    } catch {
      toast.error('Error al eliminar cuenta por pagar');
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

  const openEditModal = (account: AccountPayable) => {
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
    setShowPayModal(false);
    setShowAbonoModal(false);
    setShowHistoryModal(false);
    setPayTarget(null);
    setAbonoTarget(null);
    setHistoryTarget(null);
    setPaymentBeingEdited(null);
    resetForm();
  };

  const anyModalOpen =
    showModal || showPayModal || showAbonoModal || showHistoryModal || paymentBeingEdited !== null;

  useEscapeKey(anyModalOpen, closeAllModals);
  useModalFocusTrap(modalPanelRef, showModal);
  useModalFocusTrap(payModalRef, showPayModal);
  useModalFocusTrap(abonoModalRef, showAbonoModal);
  useModalFocusTrap(historyModalRef, showHistoryModal);
  useModalFocusTrap(editPaymentModalRef, paymentBeingEdited !== null);

  const filteredAccounts = accounts.filter((account) =>
    account.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [listPage, setListPage] = useState(1);
  useEffect(() => {
    setListPage(1);
  }, [searchTerm, statusFilter]);
  const apTotalPages = Math.max(1, Math.ceil(filteredAccounts.length / TABLE_PAGE_SIZE));
  const apPageSafe = Math.min(listPage, apTotalPages);
  useEffect(() => {
    setListPage((p) => Math.min(p, apTotalPages));
  }, [apTotalPages]);
  const pagedAccountsPayable = useMemo(() => {
    const start = (apPageSafe - 1) * TABLE_PAGE_SIZE;
    return filteredAccounts.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredAccounts, apPageSafe]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'text-green-400 bg-green-400/10';
      case 'OVERDUE':
        return 'text-red-400 bg-red-400/10';
      default:
        return 'text-yellow-400 bg-yellow-400/10';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'Pagada';
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
        title="Cuentas por Pagar"
        subtitle="Gestiona tus cuentas por pagar"
        actions={
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto text-sm sm:text-base"
          >
            <Plus size={20} />
            Nueva Cuenta por Pagar
          </button>
        }
      />

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
            <option value="PAID">Pagada</option>
            <option value="OVERDUE">Vencida</option>
          </select>
        </div>
      </div>

      {/* Accounts List */}
      {filteredAccounts.length === 0 ? (
        <div className="card-view text-center py-12 sm:py-16">
          <p className="text-dark-400">No hay cuentas por pagar</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 xl:gap-6">
            {pagedAccountsPayable.map((account) => {
              const totalPaid = account.totalPaid ?? 0;
              const remaining = Math.max(0, account.amount - totalPaid);
              const pct = account.amount > 0 ? Math.min(100, (totalPaid / account.amount) * 100) : 0;
              const canAct = account.status !== 'PAID' && remaining > 0.001;

              return (
                <motion.article
                  key={account.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={[LIST_CARD_SHELL, listCardAccentPayable(account.status)].join(' ')}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                    <div className="order-2 min-w-0 flex-1 space-y-2 sm:order-1 sm:pr-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                          Por pagar
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
                      {canAct && (
                        <>
                          <button
                            type="button"
                            onClick={() => openPayModal(account)}
                            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-emerald-400 transition-colors hover:bg-emerald-500/15"
                            title="Marcar como pagada (fecha del gasto)"
                            aria-label="Marcar como pagada"
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
                      {account.status !== 'PAID' && (
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
                    {account.status !== 'PAID' && (
                      <div className="space-y-2 rounded-xl border border-dark-600/50 bg-dark-900/25 px-3 py-2.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                          <span className="text-dark-400">Abonado</span>
                          <span className="tabular-nums font-semibold text-white">
                            {totalPaid.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {account.currency}
                            <span className="ml-1 text-xs font-normal text-dark-500">({pct.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-dark-700 ring-1 ring-white/5">
                          <div
                            className="h-2 rounded-full bg-gradient-to-r from-primary-600 to-primary-400 transition-all"
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
                      {account.paidDate && (
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3 xs:col-span-2">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Último pago / cierre</p>
                          <p className="mt-0.5 text-sm font-semibold text-emerald-400 sm:text-base">{formatDateDdMmYyyy(account.paidDate)}</p>
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
            currentPage={apPageSafe}
            totalPages={apTotalPages}
            totalItems={filteredAccounts.length}
            itemsPerPage={TABLE_PAGE_SIZE}
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
            aria-labelledby="accounts-payable-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="accounts-payable-modal-title" className="text-xl font-semibold text-white">
                {editingAccount ? 'Editar Cuenta por Pagar' : 'Nueva Cuenta por Pagar'}
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

      {/* Modal marcar pagada */}
      {showPayModal && payTarget && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)} role="presentation">
          <motion.div
            ref={payModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ap-pay-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="ap-pay-modal-title" className="text-xl font-semibold text-white">
                Marcar como pagada
              </h2>
              <button type="button" onClick={() => setShowPayModal(false)} className="text-dark-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <p className="text-sm text-dark-400 mb-4">
              Se registrará un gasto por el saldo pendiente (
              {(payTarget.amount - (payTarget.totalPaid ?? 0)).toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
              {payTarget.currency}) en la fecha que elijas.
            </p>
            <form onSubmit={submitPay} className="space-y-4">
              <div>
                <label className="label">Fecha del gasto *</label>
                <input type="date" className="input" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
              </div>
              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  Confirmar pago
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowPayModal(false)}>
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
            aria-labelledby="ap-abono-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="ap-abono-modal-title" className="text-xl font-semibold text-white">
                Agregar abono
              </h2>
              <button type="button" onClick={() => setShowAbonoModal(false)} className="text-dark-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <p className="text-sm text-dark-400 mb-4">
              Máximo:{' '}
              {(abonoTarget.amount - (abonoTarget.totalPaid ?? 0)).toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
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
                <label className="label">Fecha del gasto *</label>
                <input type="date" className="input" value={abonoDate} onChange={(e) => setAbonoDate(e.target.value)} required />
              </div>
              <div>
                <label className="label">Cuenta origen (opcional)</label>
                <select
                  className="input w-full"
                  value={abonoBankAccountId}
                  onChange={(e) => setAbonoBankAccountId(e.target.value)}
                >
                  <option value="">Sin cuenta — no descuenta saldo</option>
                  {accountsForApAbono.map((a: BankAccount) => (
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
            aria-labelledby="ap-history-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-dark-700/70 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500">Historial de abonos</p>
                  <h2 id="ap-history-modal-title" className="mt-1 text-lg font-semibold leading-snug text-white sm:text-xl">
                    <span className="line-clamp-3 break-words">{historyTarget.description}</span>
                  </h2>
                  {!historyLoading && historyPayments.length > 0 && (
                    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-dark-400">
                      <span className="tabular-nums font-semibold text-primary-300">
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
                            className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dark-700/70 text-primary-400 ring-1 ring-white/5"
                            aria-hidden
                          >
                            <Calendar className="h-[1.1rem] w-[1.1rem]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500">Fecha del gasto</p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                              {formatDateDdMmYyyy(p.paymentDate)}
                            </p>
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
            aria-labelledby="ap-edit-payment-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ap-edit-payment-title" className="text-xl font-semibold text-white mb-4">
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
                <label className="label">Fecha del gasto *</label>
                <input
                  type="date"
                  className="input w-full"
                  value={editPayDate}
                  onChange={(e) => setEditPayDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Cuenta origen (opcional)</label>
                <select
                  className="input w-full"
                  value={editPayBankAccountId}
                  onChange={(e) => setEditPayBankAccountId(e.target.value)}
                >
                  <option value="">Sin cuenta</option>
                  {accountsForApEditPayment.map((a: BankAccount) => (
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

export default AccountsPayable;
