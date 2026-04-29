import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { BankAccount } from '../types';
import { Plus, Edit, Trash2, Search, X, Target, CheckCircle, Calendar, Banknote, History, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { TABLE_PAGE_SIZE_GOALS } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { LIST_CARD_SHELL, listCardBtnEdit, listCardBtnDanger } from '../utils/listCard';
import { formatDateForInput, formatDateDdMmYyyy, formatCalendarDateLongEs } from '../utils/dateUtils';
import { formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';
import { useAuth } from '../context/AuthContext';
import { usePersistedIdOrder } from '../hooks/usePersistedIdOrder';
import { useListOrderPageDnd } from '../hooks/useListOrderPageDnd';
import ListOrderDragHandle from '../components/ListOrderDragHandle';
import SummaryBarToggleButton from '../components/SummaryBarToggleButton';
import { usePersistedSummaryBarVisible } from '../hooks/usePersistedSummaryBarVisible';

interface FinancialGoal {
  id: number;
  name: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  progress: number;
  remaining: number;
  bankAccountId?: number | null;
  bankAccountName?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GoalMovement {
  id: number;
  goalId: number;
  amount: number;
  note?: string;
  movementDate?: string;
  bankAccountId?: number | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  sourceBankAccountId?: number | null;
  sourceBankAccountName?: string | null;
  sourceBankAccountNumber?: string | null;
  createdAt: string;
  updatedAt: string;
}

function accountMatchesGoalCurrency(acc: BankAccount, goalCurrency: string): boolean {
  if (acc.currencyType === 'DUAL') return goalCurrency === 'DOP' || goalCurrency === 'USD';
  return acc.currencyType === goalCurrency;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function goalListAccent(goal: FinancialGoal): string {
  if (goal.status === 'COMPLETED') return 'border-l-emerald-500';
  if (goal.status === 'CANCELLED') return 'border-l-dark-500';
  const p = Math.min(100, goal.progress);
  if (p >= 80) return 'border-l-emerald-500';
  if (p >= 40) return 'border-l-amber-500';
  return 'border-l-primary-500';
}

/** Número del % (sin símbolo): evita 100.0 y un decimal si aplica. */
function formatGoalProgressPercentValue(progress: number): string {
  const p = Math.min(100, Math.max(0, progress));
  if (p >= 99.95) return '100';
  if (p > 0 && p < 10 && p !== Math.round(p)) return p.toFixed(1);
  return String(Math.round(p));
}

function goalProgressPercentTextClass(progress: number): string {
  if (progress >= 100) return 'text-emerald-400';
  if (progress >= 50) return 'text-sky-300';
  if (progress > 0) return 'text-amber-200';
  return 'text-dark-400';
}

function goalProgressBarColor(progress: number): string {
  if (progress >= 100) return '#10b981';
  if (progress >= 50) return '#3b82f6';
  if (progress > 0) return '#f59e0b';
  return '#475569';
}

/** Misma regla que `canAct` en cuentas por pagar/cobrar: activa y con saldo pendiente. */
function goalCanAddAbono(goal: FinancialGoal): boolean {
  return goal.status === 'ACTIVE' && goal.remaining > 0.001;
}

const FinancialGoals: React.FC = () => {
  const { user } = useAuth();
  const { pageSize: goalsPageSize, setPageSize: setGoalsPageSize, pageSizeOptions: goalsPageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:financialGoals', TABLE_PAGE_SIZE_GOALS);
  const { visible: summaryBarVisible, toggle: toggleSummaryBar } = usePersistedSummaryBarVisible(
    user?.id,
    'financial_goals'
  );
  const goalModalRef = useRef<HTMLDivElement>(null);
  const abonoModalRef = useRef<HTMLDivElement>(null);
  const historyModalRef = useRef<HTMLDivElement>(null);
  const editMovementModalRef = useRef<HTMLDivElement>(null);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAbonoModal, setShowAbonoModal] = useState(false);
  const [abonoTarget, setAbonoTarget] = useState<FinancialGoal | null>(null);
  const [abonoAmount, setAbonoAmount] = useState('');
  const [abonoDate, setAbonoDate] = useState(todayYmd());
  const [abonoSourceBankAccountId, setAbonoSourceBankAccountId] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyGoal, setHistoryGoal] = useState<FinancialGoal | null>(null);
  const [historyMovements, setHistoryMovements] = useState<GoalMovement[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [movementBeingEdited, setMovementBeingEdited] = useState<GoalMovement | null>(null);
  const [editMovAmount, setEditMovAmount] = useState('');
  const [editMovDate, setEditMovDate] = useState('');
  const [editMovSourceBankAccountId, setEditMovSourceBankAccountId] = useState('');
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    targetAmount: '',
    currency: 'DOP',
    targetDate: '',
    bankAccountId: '',
  });

  const fetchGoals = useCallback(async () => {
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;

      const response = await api.get('/financial-goals', { params });
      setGoals(response.data.goals);
    } catch (error: any) {
      toast.error('Error al cargar metas financieras');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

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

  const accountsForGoalCurrency = useMemo(
    () => bankAccounts.filter((a) => accountMatchesGoalCurrency(a, formData.currency)),
    [bankAccounts, formData.currency]
  );

  const accountsForAbonoSource = useMemo(() => {
    if (!abonoTarget) return [];
    return bankAccounts.filter(
      (a) =>
        accountMatchesGoalCurrency(a, abonoTarget.currency) &&
        (abonoTarget.bankAccountId == null || a.id !== abonoTarget.bankAccountId)
    );
  }, [bankAccounts, abonoTarget]);

  const accountsForEditMovementSource = useMemo(() => {
    if (!historyGoal || !movementBeingEdited) return [];
    const g = goals.find((x) => x.id === historyGoal.id) ?? historyGoal;
    return bankAccounts.filter(
      (a) =>
        accountMatchesGoalCurrency(a, g.currency) &&
        (g.bankAccountId == null || a.id !== g.bankAccountId)
    );
  }, [bankAccounts, historyGoal, movementBeingEdited, goals]);

  useEffect(() => {
    if (!formData.bankAccountId || bankAccounts.length === 0) return;
    const id = parseInt(formData.bankAccountId, 10);
    if (Number.isNaN(id)) return;
    const acc = bankAccounts.find((a) => a.id === id);
    if (!acc || !accountMatchesGoalCurrency(acc, formData.currency)) {
      setFormData((f) => ({ ...f, bankAccountId: '' }));
    }
  }, [formData.currency, bankAccounts, formData.bankAccountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data: Record<string, unknown> = {
        name: formData.name,
        description: formData.description,
        targetAmount: parseFloat(formData.targetAmount),
        currency: formData.currency,
        targetDate: formData.targetDate || null,
      };
      if (formData.bankAccountId) {
        data.bankAccountId = parseInt(formData.bankAccountId, 10);
      } else {
        data.bankAccountId = null;
      }

      if (editingGoal) {
        await api.put(`/financial-goals/${editingGoal.id}`, data);
        toast.success('Meta financiera actualizada');
      } else {
        await api.post('/financial-goals', data);
        toast.success('Meta financiera creada');
      }

      setShowModal(false);
      resetForm();
      fetchGoals();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar meta financiera');
    }
  };

  const openAbonoModal = (goal: FinancialGoal) => {
    const latest = goals.find((g) => g.id === goal.id) ?? goal;
    setAbonoTarget(latest);
    setAbonoAmount('');
    setAbonoDate(todayYmd());
    setAbonoSourceBankAccountId('');
    setShowAbonoModal(true);
  };

  const openAbonoModalFromHistory = () => {
    if (!historyGoal) return;
    const latest = goals.find((g) => g.id === historyGoal.id) ?? historyGoal;
    if (!goalCanAddAbono(latest)) {
      toast.error('No hay saldo pendiente para abonar en esta meta.');
      return;
    }
    setShowHistoryModal(false);
    openAbonoModal(latest);
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
      const body: Record<string, unknown> = { amount: amt, movementDate: abonoDate };
      if (abonoSourceBankAccountId) {
        body.sourceBankAccountId = parseInt(abonoSourceBankAccountId, 10);
      }
      await api.post(`/financial-goals/${abonoTarget.id}/movements`, body);
      const gid = abonoTarget.id;
      toast.success('Abono registrado');
      setShowAbonoModal(false);
      setAbonoTarget(null);
      await fetchGoals();
      await reloadHistoryIfOpen(gid);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al registrar abono');
    }
  };

  const reloadHistoryIfOpen = async (goalId: number) => {
    if (historyGoal?.id === goalId) {
      setHistoryLoading(true);
      try {
        const response = await api.get(`/financial-goals/${goalId}/movements`);
        setHistoryMovements(response.data.movements || []);
      } catch {
        toast.error('Error al actualizar historial');
      } finally {
        setHistoryLoading(false);
      }
    }
  };

  const openHistoryModal = async (goal: FinancialGoal) => {
    setHistoryGoal(goal);
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setHistoryMovements([]);
    try {
      const response = await api.get(`/financial-goals/${goal.id}/movements`);
      setHistoryMovements(response.data.movements || []);
    } catch {
      toast.error('Error al cargar historial de abonos');
    } finally {
      setHistoryLoading(false);
    }
  };

  const openEditMovementModal = (m: GoalMovement) => {
    setMovementBeingEdited(m);
    setEditMovAmount(String(m.amount));
    setEditMovDate(formatDateForInput(m.movementDate || m.createdAt));
    setEditMovSourceBankAccountId(
      m.sourceBankAccountId != null && m.sourceBankAccountId !== undefined ? String(m.sourceBankAccountId) : ''
    );
  };

  const submitEditMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!historyGoal || !movementBeingEdited) return;
    const amt = parseFloat(editMovAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Indique un monto válido');
      return;
    }
    if (!editMovDate) {
      toast.error('Seleccione la fecha del abono');
      return;
    }
    try {
      await api.put(`/financial-goals/${historyGoal.id}/movements/${movementBeingEdited.id}`, {
        amount: amt,
        movementDate: editMovDate,
        sourceBankAccountId: editMovSourceBankAccountId ? parseInt(editMovSourceBankAccountId, 10) : null,
      });
      toast.success('Abono actualizado');
      setMovementBeingEdited(null);
      await fetchGoals();
      await reloadHistoryIfOpen(historyGoal.id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al actualizar abono');
    }
  };

  const handleDeleteMovement = async (m: GoalMovement) => {
    if (!historyGoal) return;
    if (!window.confirm('¿Eliminar este abono? Se actualizará el progreso de la meta.')) {
      return;
    }
    try {
      await api.delete(`/financial-goals/${historyGoal.id}/movements/${m.id}`);
      toast.success('Abono eliminado');
      await fetchGoals();
      await reloadHistoryIfOpen(historyGoal.id);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al eliminar abono');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta meta financiera?')) {
      return;
    }

    try {
      await api.delete(`/financial-goals/${id}`);
      toast.success('Meta financiera eliminada');
      fetchGoals();
    } catch (error: any) {
      toast.error('Error al eliminar meta financiera');
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await api.put(`/financial-goals/${id}`, { status });
      toast.success('Estado actualizado');
      fetchGoals();
    } catch (error: any) {
      toast.error('Error al actualizar estado');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      targetAmount: '',
      currency: 'DOP',
      targetDate: '',
      bankAccountId: '',
    });
    setEditingGoal(null);
  };

  const openEditModal = (goal: FinancialGoal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      description: goal.description || '',
      targetAmount: goal.targetAmount.toString(),
      currency: goal.currency,
      targetDate: goal.targetDate ? formatDateForInput(goal.targetDate) : '',
      bankAccountId:
        goal.bankAccountId != null && goal.bankAccountId !== undefined ? String(goal.bankAccountId) : '',
    });
    setShowModal(true);
  };

  const closeAllModals = () => {
    setShowModal(false);
    setShowAbonoModal(false);
    setShowHistoryModal(false);
    setAbonoTarget(null);
    setHistoryGoal(null);
    setMovementBeingEdited(null);
    resetForm();
  };

  const anyModalOpen =
    showModal || showAbonoModal || showHistoryModal || movementBeingEdited !== null;

  useEscapeKey(anyModalOpen, closeAllModals);
  useModalFocusTrap(goalModalRef, showModal && !showAbonoModal && !showHistoryModal && !movementBeingEdited);
  useModalFocusTrap(abonoModalRef, showAbonoModal && !movementBeingEdited);
  useModalFocusTrap(historyModalRef, showHistoryModal && !!historyGoal && !movementBeingEdited);
  useModalFocusTrap(editMovementModalRef, movementBeingEdited !== null);

  const filteredGoals = goals.filter((goal) =>
    goal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    goal.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { ordered: orderedFiltered, setOrderByIds: setGoalOrderByIds } = usePersistedIdOrder<FinancialGoal>({
    module: 'financial_goals',
    userId: user?.id,
    sourceItems: filteredGoals,
  });
  const commitGoalOrder = useCallback(
    (next: FinancialGoal[]) => {
      setGoalOrderByIds(next.map((g) => g.id));
    },
    [setGoalOrderByIds]
  );

  const historyGoalResolved = useMemo(() => {
    if (!historyGoal) return null;
    return goals.find((g) => g.id === historyGoal.id) ?? historyGoal;
  }, [goals, historyGoal]);

  const [goalsListPage, setGoalsListPage] = useState(1);
  useEffect(() => {
    setGoalsListPage(1);
  }, [searchTerm, statusFilter, goalsPageSize]);
  const goalsMainTotalPages = Math.max(1, Math.ceil(orderedFiltered.length / goalsPageSize));
  const goalsMainPageSafe = Math.min(goalsListPage, goalsMainTotalPages);
  useEffect(() => {
    setGoalsListPage((p) => Math.min(p, goalsMainTotalPages));
  }, [goalsMainTotalPages]);
  const pagedGoals = useMemo(() => {
    const start = (goalsMainPageSafe - 1) * goalsPageSize;
    return orderedFiltered.slice(start, start + goalsPageSize);
  }, [orderedFiltered, goalsMainPageSafe, goalsPageSize]);
  const goalListStart = (goalsMainPageSafe - 1) * goalsPageSize;
  const listDnd = useListOrderPageDnd(pagedGoals, goalListStart, orderedFiltered, commitGoalOrder);

  const goalsSummaryKpis = useMemo(() => {
    let active = 0;
    let dop = 0;
    let usd = 0;
    for (const g of orderedFiltered) {
      if (g.status === 'ACTIVE') active += 1;
      const c = String(g.currency || 'DOP').toUpperCase();
      if (c === 'USD') usd += g.targetAmount;
      else dop += g.targetAmount;
    }
    return { count: orderedFiltered.length, active, dop, usd };
  }, [orderedFiltered]);

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
        title="Metas Financieras"
        subtitle="Establece y rastrea tus metas financieras"
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
              Nueva Meta
            </button>
          </div>
        }
      />

      {summaryBarVisible && (
        <div className="card-view">
          <div className="metrics-cq">
            <div className="metrics-summary-strip">
            <div>
              <p className="text-dark-400 text-sm mb-1">Objetivo total (DOP)</p>
              <p className="text-2xl font-bold text-white">
                {goalsSummaryKpis.dop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP
              </p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Objetivo total (USD)</p>
              <p className="text-2xl font-bold text-white">
                {goalsSummaryKpis.usd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD
              </p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Activas</p>
              <p className="text-2xl font-bold text-white">{goalsSummaryKpis.active}</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Cantidad de Metas</p>
              <p className="text-2xl font-bold text-white">{goalsSummaryKpis.count}</p>
            </div>
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
            <option value="ACTIVE">Activa</option>
            <option value="COMPLETED">Completada</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </div>
      </div>

      {/* Goals List */}
      {orderedFiltered.length === 0 ? (
        <div className="card-view text-center py-12 sm:py-16">
          <p className="text-dark-400">No hay metas financieras</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5 xl:gap-6">
            {pagedGoals.map((goal) => {
              const canAbono = goalCanAddAbono(goal);
              return (
                <motion.article
                  key={goal.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  onDragOver={listDnd.onDragOver}
                  onDrop={listDnd.onDrop(goal.id)}
                  className={[
                    LIST_CARD_SHELL,
                    goalListAccent(goal),
                    listDnd.dragId === goal.id ? 'opacity-60' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between xl:gap-3">
                    <div className="order-2 min-w-[min(100%,12rem)] flex-1 space-y-2 xl:order-1 xl:pr-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                          <Target className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                          Meta
                        </span>
                        <span className="text-xs text-dark-500 sm:text-sm">
                          {goal.status === 'ACTIVE' && 'Activa'}
                          {goal.status === 'COMPLETED' && 'Completada'}
                          {goal.status === 'CANCELLED' && 'Cancelada'}
                        </span>
                        {goal.status === 'COMPLETED' && <CheckCircle className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />}
                      </div>
                      <h3 className="break-words text-lg font-bold leading-snug text-white sm:text-xl">{goal.name}</h3>
                      {goal.description && <p className="text-sm text-dark-400">{goal.description}</p>}
                      {goal.targetDate && (
                        <p className="inline-flex items-center gap-1.5 text-xs text-dark-500">
                          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Objetivo: {formatCalendarDateLongEs(goal.targetDate)}
                        </p>
                      )}
                    </div>
                    <div className="order-1 flex w-full shrink-0 flex-wrap items-center justify-end gap-0.5 xl:order-2 xl:w-auto">
                      <ListOrderDragHandle
                        itemId={goal.id}
                        onDragStart={listDnd.onDragStart}
                        onDragEnd={listDnd.onDragEnd}
                        disabled={pagedGoals.length < 2}
                      />
                      {canAbono && (
                        <button
                          type="button"
                          onClick={() => openAbonoModal(goal)}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-sky-400 transition-colors hover:bg-sky-500/15"
                          title="Agregar abono"
                          aria-label="Agregar abono"
                        >
                          <Banknote className="h-5 w-5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openHistoryModal(goal)}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-amber-400 transition-colors hover:bg-amber-500/15"
                        title="Historial de abonos"
                        aria-label="Historial de abonos"
                      >
                        <History className="h-5 w-5" />
                      </button>
                      {goal.status === 'ACTIVE' && (
                        <button type="button" onClick={() => openEditModal(goal)} className={listCardBtnEdit} title="Editar" aria-label="Editar meta">
                          <Edit className="h-5 w-5" />
                        </button>
                      )}
                      <button type="button" onClick={() => handleDelete(goal.id)} className={listCardBtnDanger} title="Eliminar" aria-label="Eliminar meta">
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-3 border-t border-dark-700/80 pt-4">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <span className="shrink-0 text-[0.65rem] font-medium uppercase tracking-wide text-dark-500">
                        Progreso
                      </span>
                      <div
                        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-dark-700/85"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(Math.min(100, Math.max(0, goal.progress)))}
                        aria-label={`Progreso ${formatGoalProgressPercentValue(goal.progress)} por ciento`}
                      >
                        <div
                          className="h-full rounded-full transition-[width] duration-300 ease-out"
                          style={{
                            width: `${Math.min(100, Math.max(0, goal.progress))}%`,
                            backgroundColor: goalProgressBarColor(goal.progress),
                          }}
                        />
                      </div>
                      <span
                        className={`shrink-0 text-sm font-bold tabular-nums sm:text-base ${goalProgressPercentTextClass(goal.progress)}`}
                      >
                        {formatGoalProgressPercentValue(goal.progress)}%
                      </span>
                    </div>

                    <div className="metrics-cq w-full max-w-md sm:max-w-none">
                      <div className="metrics-row-3">
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Meta</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                          {goal.targetAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                          <span className="text-xs font-normal text-dark-400">{goal.currency}</span>
                        </p>
                      </div>
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Actual</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-emerald-400 sm:text-base">
                          {goal.currentAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                          <span className="text-xs font-normal text-dark-400">{goal.currency}</span>
                        </p>
                      </div>
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Restante</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-primary-400 sm:text-base">
                          {goal.remaining.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                          <span className="text-xs font-normal text-dark-400">{goal.currency}</span>
                        </p>
                      </div>
                    </div>
                  </div>

                    <div>
                      <label className="mb-1 block text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Estado</label>
                      <select
                        value={goal.status}
                        onChange={(e) => handleStatusChange(goal.id, e.target.value)}
                        className="input w-full text-sm"
                      >
                        <option value="ACTIVE">Activa</option>
                        <option value="COMPLETED">Completada</option>
                        <option value="CANCELLED">Cancelada</option>
                      </select>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
          <TablePagination
            className="mt-4 sm:mt-5"
            currentPage={goalsMainPageSafe}
            totalPages={goalsMainTotalPages}
            totalItems={orderedFiltered.length}
            itemsPerPage={goalsPageSize}
            onPageChange={setGoalsListPage}
            itemLabel="metas"
            variant="card"
            pageSizeOptions={goalsPageSizeOptions}
            onPageSizeChange={setGoalsPageSize}
          />
        </>
      )}

      {/* Modal Meta */}
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
            ref={goalModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="financial-goal-form-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="financial-goal-form-title" className="text-xl font-semibold text-white">
                {editingGoal ? 'Editar Meta Financiera' : 'Nueva Meta Financiera'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-dark-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Nombre *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Descripción</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Monto Objetivo *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.targetAmount}
                    onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Moneda *</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="DOP">DOP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Fecha Objetivo</label>
                <input
                  type="date"
                  value={formData.targetDate}
                  onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  Cuenta para el ahorro (opcional)
                </label>
                <select
                  value={formData.bankAccountId}
                  onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">Sin vincular — no actualiza saldos</option>
                  {accountsForGoalCurrency.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-dark-500">
                  Si eliges una cuenta, cada abono incrementará el saldo de esa cuenta en la moneda de la meta.
                </p>
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingGoal ? 'Actualizar' : 'Crear'}
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
            aria-labelledby="fg-abono-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="fg-abono-modal-title" className="text-xl font-semibold text-white">
                Agregar abono
              </h2>
              <button type="button" onClick={() => setShowAbonoModal(false)} className="text-dark-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <p className="text-sm text-dark-400 mb-4">
              Máximo:{' '}
              {abonoTarget.remaining.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
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
                <label className="label">Fecha del abono *</label>
                <input type="date" className="input" value={abonoDate} onChange={(e) => setAbonoDate(e.target.value)} required />
              </div>
              <div>
                <label className="label">Cuenta origen (opcional)</label>
                <select
                  className="input w-full"
                  value={abonoSourceBankAccountId}
                  onChange={(e) => setAbonoSourceBankAccountId(e.target.value)}
                >
                  <option value="">Sin origen — solo progreso de la meta</option>
                  {accountsForAbonoSource.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-dark-500 mt-1">
                  Si eliges origen, el monto se descuenta de esa cuenta hacia la cuenta de la meta (si la meta tiene cuenta).
                </p>
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

      {/* Modal historial de abonos */}
      {showHistoryModal && historyGoal && historyGoalResolved && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)} role="presentation">
          <motion.div
            ref={historyModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-lg w-full max-h-[85dvh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="financial-goals-history-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-dark-700/70 pb-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500">Historial de abonos</p>
                  <h2 id="financial-goals-history-title" className="mt-1 text-lg font-semibold leading-snug text-white sm:text-xl">
                    <span className="line-clamp-3 break-words">{historyGoalResolved.name}</span>
                  </h2>
                  {!historyLoading && historyMovements.length > 0 && (
                    <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-dark-400">
                      <span className="tabular-nums font-semibold text-primary-300">
                        {historyMovements
                          .reduce((acc, row) => acc + row.amount, 0)
                          .toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                        {historyGoalResolved.currency}
                      </span>
                      <span className="text-dark-600" aria-hidden>
                        ·
                      </span>
                      <span>
                        {historyMovements.length} abono{historyMovements.length !== 1 ? 's' : ''}
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

            {goalCanAddAbono(historyGoalResolved) && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={openAbonoModalFromHistory}
                  className="btn-primary inline-flex w-full min-h-[44px] items-center justify-center gap-2 sm:w-auto"
                >
                  <Banknote className="h-5 w-5 shrink-0" aria-hidden />
                  Agregar abono
                </button>
              </div>
            )}

            <div className="mt-4">
              {historyLoading ? (
                <p className="py-12 text-center text-dark-400">Cargando…</p>
              ) : historyMovements.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-dark-600/60 bg-dark-900/25 px-6 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-dark-800/90 text-dark-500 ring-1 ring-white/5">
                    <Banknote className="h-6 w-6" aria-hidden />
                  </div>
                  <p className="max-w-[20rem] text-sm text-dark-400">No hay abonos registrados para esta meta.</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {historyMovements.map((movement) => (
                    <li
                      key={movement.id}
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
                            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500">Fecha del abono</p>
                            <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                              {formatDateDdMmYyyy(movement.movementDate || movement.createdAt)}
                            </p>
                            {movement.note && (
                              <p className="mt-1 text-xs leading-snug text-dark-400">Nota: {movement.note}</p>
                            )}
                            {(movement.bankAccountName || movement.bankAccountId != null) && (
                              <p className="mt-1 inline-flex items-center gap-1 text-xs text-dark-500">
                                <Wallet className="h-3 w-3 shrink-0" aria-hidden />
                                Destino:{' '}
                                {formatBankAccountOptionLabel({
                                  bankName: movement.bankAccountName || 'Cuenta',
                                  accountNumber: movement.bankAccountNumber || '',
                                })}
                              </p>
                            )}
                            {(movement.sourceBankAccountName || movement.sourceBankAccountId != null) && (
                              <p className="mt-1 inline-flex items-center gap-1 text-xs text-dark-500">
                                <Wallet className="h-3 w-3 shrink-0" aria-hidden />
                                Origen:{' '}
                                {formatBankAccountOptionLabel({
                                  bankName: movement.sourceBankAccountName || 'Cuenta',
                                  accountNumber: movement.sourceBankAccountNumber || '',
                                })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dark-700/50 pt-3 sm:border-t-0 sm:pt-0 sm:pl-2">
                          <p className="text-left sm:text-right">
                            <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500 sm:hidden">Monto</span>
                            <span className="block text-lg font-bold tabular-nums leading-tight text-white sm:text-xl">
                              {movement.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                              <span className="text-sm font-normal text-dark-400">{historyGoalResolved.currency}</span>
                            </span>
                          </p>
                          <div className="flex shrink-0 items-center justify-end gap-0.5">
                            {(historyGoalResolved.status === 'ACTIVE' || historyGoalResolved.status === 'COMPLETED') && (
                              <button
                                type="button"
                                className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl p-1.5 ${listCardBtnEdit}`}
                                title="Editar abono"
                                aria-label="Editar abono"
                                onClick={() => openEditMovementModal(movement)}
                              >
                                <Edit className="h-[18px] w-[18px]" />
                              </button>
                            )}
                            <button
                              type="button"
                              className={`inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl p-1.5 ${listCardBtnDanger}`}
                              title="Eliminar abono"
                              aria-label="Eliminar abono"
                              onClick={() => handleDeleteMovement(movement)}
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

      {movementBeingEdited && historyGoal && (
        <div className="modal-overlay" onClick={() => setMovementBeingEdited(null)} role="presentation">
          <motion.div
            ref={editMovementModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fg-edit-movement-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="fg-edit-movement-title" className="text-xl font-semibold text-white mb-4">
              Editar abono
            </h2>
            <form onSubmit={submitEditMovement} className="space-y-4">
              <div>
                <label className="label">Monto *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="input w-full"
                  value={editMovAmount}
                  onChange={(e) => setEditMovAmount(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Fecha del abono *</label>
                <input
                  type="date"
                  className="input w-full"
                  value={editMovDate}
                  onChange={(e) => setEditMovDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="label">Cuenta origen (opcional)</label>
                <select
                  className="input w-full"
                  value={editMovSourceBankAccountId}
                  onChange={(e) => setEditMovSourceBankAccountId(e.target.value)}
                >
                  <option value="">Sin origen</option>
                  {accountsForEditMovementSource.map((a) => (
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
                <button type="button" className="btn-secondary flex-1" onClick={() => setMovementBeingEdited(null)}>
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

export default FinancialGoals;
