import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import {
  BankAccount,
  Expense,
  ExpenseFrequency,
  ExpenseNature,
  ExpenseRecurrenceType,
} from '../types';
import { Plus, Edit, Trash2, TrendingDown, CheckCircle, Circle, Search, X, ArrowUp, ArrowDown, ArrowUpDown, Car } from 'lucide-react';
import toast from 'react-hot-toast';
import { ExpenseCategory } from '../types';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { formatDateDdMmYyyy, formatDateForInput, calendarDateToSortableMs } from '../utils/dateUtils';
import { formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';
import { useAuth } from '../context/AuthContext';
import SummaryBarToggleButton from '../components/SummaryBarToggleButton';
import { usePersistedSummaryBarVisible } from '../hooks/usePersistedSummaryBarVisible';

const EXPENSE_NATURE_LABELS: Record<ExpenseNature, string> = {
  fixed: 'Fijo',
  variable: 'Variable',
};
const EXPENSE_RECURRENCE_LABELS: Record<ExpenseRecurrenceType, string> = {
  recurrent: 'Recurrente',
  non_recurrent: 'Único',
};
const EXPENSE_FREQUENCY_LABELS: Record<ExpenseFrequency, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Cada 2 semanas',
  semi_monthly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semi_annual: 'Semestral',
  annual: 'Anual',
};

const NEEDS_START_DATE_FREQ: ExpenseFrequency[] = [
  'daily',
  'weekly',
  'biweekly',
  'semi_monthly',
  'quarterly',
  'semi_annual',
];

function deriveFormFromExpense(e: Expense): {
  nature: ExpenseNature;
  recurrenceType: ExpenseRecurrenceType;
  frequency: ExpenseFrequency | '';
} {
  const nature: ExpenseNature = e.nature ?? 'variable';
  const recurrenceType: ExpenseRecurrenceType = e.recurrenceType ?? 'non_recurrent';
  let frequency: ExpenseFrequency | '' = (e.frequency as ExpenseFrequency) || '';
  if (recurrenceType === 'non_recurrent') {
    frequency = '';
  } else if (!frequency) {
    frequency = 'monthly';
  }
  return { nature, recurrenceType, frequency };
}

function labelExpenseTipo(e: Expense): string {
  return EXPENSE_NATURE_LABELS[deriveFormFromExpense(e).nature];
}

function labelExpenseFrecuencia(e: Expense): string {
  const { recurrenceType, frequency } = deriveFormFromExpense(e);
  if (recurrenceType === 'non_recurrent') return '—';
  const fq = frequency as ExpenseFrequency;
  return fq ? EXPENSE_FREQUENCY_LABELS[fq] || String(frequency) : '—';
}

function labelExpenseNaturaleza(e: Expense): string {
  return EXPENSE_RECURRENCE_LABELS[deriveFormFromExpense(e).recurrenceType];
}

function formatExpenseScheduleDisplay(e: Expense): string {
  const { recurrenceType, frequency } = deriveFormFromExpense(e);
  if (recurrenceType === 'non_recurrent') {
    return e.date ? formatDateDdMmYyyy(e.date) : '-';
  }
  const fq = (frequency || 'monthly') as ExpenseFrequency;
  if (fq === 'monthly') {
    return e.paymentDay != null ? `Día ${e.paymentDay}` : '-';
  }
  if (fq === 'annual') {
    return e.paymentMonth != null ? `Mes ${e.paymentMonth}` : '-';
  }
  if (e.date) return formatDateDdMmYyyy(e.date);
  return '-';
}

const Expenses: React.FC = () => {
  const { user } = useAuth();
  const { visible: summaryBarVisible, toggle: toggleSummaryBar } = usePersistedSummaryBarVisible(
    user?.id,
    'expenses'
  );
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterNature, setFilterNature] = useState('');
  const [filterRecurrence, setFilterRecurrence] = useState('');
  const [filterFrequency, setFilterFrequency] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [summary, setSummary] = useState({ totalDop: 0, totalUsd: 0, totalExpenses: 0 });
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { pageSize: itemsPerPage, setPageSize: setItemsPerPage, pageSizeOptions } = usePersistedTablePageSize(
    'pf:pageSize:expenses',
    TABLE_PAGE_SIZE
  );
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    currency: 'DOP',
    nature: 'fixed' as ExpenseNature,
    recurrenceType: 'recurrent' as ExpenseRecurrenceType,
    frequency: 'monthly' as ExpenseFrequency | '',
    category: '',
    paymentDay: '',
    paymentMonth: '',
    date: '',
    recurrenceStartDate: '',
    recurrenceEndDate: '',
    bankAccountId: '' as string,
    isPaid: false,
  });

  useEffect(() => {
    fetchCategories();
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterNature, filterRecurrence, filterFrequency, categoryFilter, itemsPerPage]);

  useEffect(() => {
    if (filterRecurrence === 'non_recurrent') {
      setFilterFrequency('');
    }
  }, [filterRecurrence]);

  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page: currentPage,
        limit: itemsPerPage,
      };
      if (searchTerm) params.search = searchTerm;
      if (filterNature) params.nature = filterNature;
      if (filterRecurrence) params.recurrenceType = filterRecurrence;
      if (filterFrequency && filterRecurrence !== 'non_recurrent') params.frequency = filterFrequency;
      if (categoryFilter) params.category = categoryFilter;

      const response = await api.get('/expenses', { params });
      setExpenses(response.data.expenses);
      setSummary(response.data.summary || { totalDop: 0, totalUsd: 0, totalExpenses: 0 });
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      toast.error('Error al cargar gastos');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterNature, filterRecurrence, filterFrequency, categoryFilter, currentPage, itemsPerPage]);

  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      setCategories(response.data.categories);
    } catch (error: any) {
      console.error('Error loading categories:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const vehicleOneoff = editingExpense?.vehicleId != null;
      let nature: ExpenseNature = formData.nature;
      let recurrenceType: ExpenseRecurrenceType = formData.recurrenceType;
      let frequency: ExpenseFrequency | null =
        recurrenceType === 'non_recurrent'
          ? null
          : ((formData.frequency || 'monthly') as ExpenseFrequency);

      if (vehicleOneoff) {
        nature = 'variable';
        recurrenceType = 'non_recurrent';
        frequency = null;
      }

      let dateOut: string | null = null;
      if (recurrenceType === 'non_recurrent') {
        dateOut = formData.date;
      } else if (frequency && NEEDS_START_DATE_FREQ.includes(frequency)) {
        dateOut = formData.date || null;
      }

      const data: Record<string, unknown> = {
        description: formData.description,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        category: formData.category,
        nature,
        recurrenceType,
        frequency,
        paymentDay:
          recurrenceType === 'recurrent' && frequency === 'monthly'
            ? parseInt(formData.paymentDay, 10)
            : null,
        paymentMonth:
          recurrenceType === 'recurrent' && frequency === 'annual'
            ? parseInt(formData.paymentMonth, 10)
            : null,
        date: dateOut,
        isPaid: formData.isPaid,
      };
      if (formData.bankAccountId) {
        data.bankAccountId = parseInt(formData.bankAccountId, 10);
      } else {
        data.bankAccountId = null;
      }

      if (recurrenceType === 'recurrent' && !vehicleOneoff) {
        data.recurrenceStartDate = formData.recurrenceStartDate.trim() || null;
        data.recurrenceEndDate = formData.recurrenceEndDate.trim() || null;
      } else {
        data.recurrenceStartDate = null;
        data.recurrenceEndDate = null;
      }

      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, data);
        toast.success('Gasto actualizado');
      } else {
        await api.post('/expenses', data);
        toast.success('Gasto creado');
      }

      setShowModal(false);
      resetForm();
      fetchExpenses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar gasto');
    }
  };

  const handleTogglePaid = async (id: number, isPaid: boolean) => {
    try {
      await api.patch(`/expenses/${id}/payment-status`, { isPaid: !isPaid });
      toast.success('Estado actualizado');
      fetchExpenses();
    } catch (error: any) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este gasto?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Gasto eliminado');
      fetchExpenses();
    } catch (error: any) {
      toast.error('Error al eliminar gasto');
    }
  };

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      currency: 'DOP',
      nature: 'fixed',
      recurrenceType: 'recurrent',
      frequency: 'monthly',
      category: '',
      paymentDay: '',
      paymentMonth: '',
      date: '',
      recurrenceStartDate: '',
      recurrenceEndDate: '',
      bankAccountId: '',
      isPaid: false,
    });
    setEditingExpense(null);
  };

  useEscapeKey(showModal, () => {
    setShowModal(false);
    resetForm();
  });
  useModalFocusTrap(modalPanelRef, showModal);

  const accountsForExpense = useMemo(() => {
    const c = formData.currency;
    return bankAccounts.filter(
      (a) => a.currencyType === 'DUAL' || a.currencyType === c
    );
  }, [bankAccounts, formData.currency]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gastos"
        subtitle="Gestiona tus gastos"
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
              <span>Agregar Gasto</span>
            </button>
          </div>
        }
      />

      {/* Summary */}
      {summaryBarVisible && summary && (
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">Gastos Totales (DOP)</p>
              <p className="text-2xl font-bold text-white">{summary.totalDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Gastos Totales (USD)</p>
              <p className="text-2xl font-bold text-white">{summary.totalUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Cantidad de Gastos</p>
              <p className="text-2xl font-bold text-white">{summary.totalExpenses}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="relative sm:col-span-2 xl:col-span-2">
            <label className="text-xs text-dark-400 block mb-1">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
              <input
                type="text"
                placeholder="Descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input w-full pl-10"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-dark-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs text-dark-400 block mb-1">Tipo</label>
            <select
              value={filterNature}
              onChange={(e) => setFilterNature(e.target.value)}
              className="input w-full"
            >
              <option value="">Todos</option>
              <option value="fixed">Fijo</option>
              <option value="variable">Variable</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-dark-400 block mb-1">Naturaleza</label>
            <select
              value={filterRecurrence}
              onChange={(e) => setFilterRecurrence(e.target.value)}
              className="input w-full"
            >
              <option value="">Todas</option>
              <option value="recurrent">Recurrente</option>
              <option value="non_recurrent">Único</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-dark-400 block mb-1">Frecuencia</label>
            <select
              value={filterFrequency}
              onChange={(e) => setFilterFrequency(e.target.value)}
              disabled={filterRecurrence === 'non_recurrent'}
              className="input w-full disabled:opacity-50"
              title={filterRecurrence === 'non_recurrent' ? 'No aplica a gastos únicos' : undefined}
            >
              <option value="">Todas</option>
              {(Object.keys(EXPENSE_FREQUENCY_LABELS) as ExpenseFrequency[]).map((k) => (
                <option key={k} value={k}>
                  {EXPENSE_FREQUENCY_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-dark-400 block mb-1">Categoría</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="input w-full"
            >
              <option value="">Todas</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.name}>{cat.name}</option>
              ))}
            </select>
          </div>
        </div>
        {(searchTerm || filterNature || filterRecurrence || filterFrequency || categoryFilter) && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterNature('');
                setFilterRecurrence('');
                setFilterFrequency('');
                setCategoryFilter('');
              }}
              className="text-sm text-accent-400 hover:text-accent-300"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {expenses.length === 0 ? (
        <div className="card text-center py-12">
          <TrendingDown className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">No tienes gastos registrados</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Agregar Primer Gasto</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="table-responsive table-stack">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th
                      className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                      onClick={() => {
                        if (sortBy === 'description') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('description');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <span>Descripción</span>
                        {sortBy === 'description' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                      onClick={() => {
                        if (sortBy === 'amount') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('amount');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <span>Monto</span>
                        {sortBy === 'amount' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                      onClick={() => {
                        if (sortBy === 'type') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('type');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <span>Tipo</span>
                        {sortBy === 'type' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                      onClick={() => {
                        if (sortBy === 'frequency') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('frequency');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <span>Frecuencia</span>
                        {sortBy === 'frequency' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                      onClick={() => {
                        if (sortBy === 'naturaleza') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('naturaleza');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <span>Naturaleza</span>
                        {sortBy === 'naturaleza' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                      onClick={() => {
                        if (sortBy === 'category') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('category');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <span>Categoría</span>
                        {sortBy === 'category' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                      onClick={() => {
                        if (sortBy === 'date') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('date');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <span>Fecha/Día</span>
                        {sortBy === 'date' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                      </div>
                    </th>
                    <th
                      className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                      onClick={() => {
                        if (sortBy === 'status') {
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                        } else {
                          setSortBy('status');
                          setSortOrder('asc');
                        }
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <span>Estado</span>
                        {sortBy === 'status' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                      </div>
                    </th>
                    <th className="text-right py-3 px-4 text-dark-400 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {[...expenses].sort((a, b) => {
                    if (!sortBy) return 0;
                    let aValue: any, bValue: any;

                    switch (sortBy) {
                      case 'description':
                        aValue = a.description.toLowerCase();
                        bValue = b.description.toLowerCase();
                        break;
                      case 'amount':
                        aValue = a.amount;
                        bValue = b.amount;
                        break;
                      case 'type':
                        aValue = labelExpenseTipo(a);
                        bValue = labelExpenseTipo(b);
                        break;
                      case 'frequency':
                        aValue = labelExpenseFrecuencia(a);
                        bValue = labelExpenseFrecuencia(b);
                        break;
                      case 'naturaleza':
                        aValue = labelExpenseNaturaleza(a);
                        bValue = labelExpenseNaturaleza(b);
                        break;
                      case 'category':
                        aValue = (a.category || '').toLowerCase();
                        bValue = (b.category || '').toLowerCase();
                        break;
                      case 'date':
                        aValue = a.date ? calendarDateToSortableMs(a.date) : (a.paymentDay || 0);
                        bValue = b.date ? calendarDateToSortableMs(b.date) : (b.paymentDay || 0);
                        break;
                      case 'status':
                        aValue = a.isPaid ? 1 : 0;
                        bValue = b.isPaid ? 1 : 0;
                        break;
                      default:
                        return 0;
                    }

                    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
                    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
                    return 0;
                  }).map((expense) => (
                    <tr key={expense.id} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                      <td data-label="Descripción" data-stack="hero" className="py-3 px-4 text-white">
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="break-words">{expense.description}</span>
                          {expense.vehicleLabel && (
                            <Link
                              to="/vehicles"
                              className="inline-flex items-center gap-1 text-xs text-amber-400/90 hover:text-amber-300"
                              title="Ver en Vehículos"
                            >
                              <Car className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {expense.vehicleLabel}
                            </Link>
                          )}
                        </div>
                      </td>
                      <td data-label="Monto" className="py-3 px-4">
                        <span className="table-stack-value">
                          {expense.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {expense.currency}
                        </span>
                      </td>
                      <td data-label="Tipo" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{labelExpenseTipo(expense)}</span>
                      </td>
                      <td data-label="Frecuencia" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{labelExpenseFrecuencia(expense)}</span>
                      </td>
                      <td data-label="Naturaleza" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{labelExpenseNaturaleza(expense)}</span>
                      </td>
                      <td data-label="Categoría" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{expense.category || '-'}</span>
                      </td>
                      <td data-label="Fecha / día" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">
                          {formatExpenseScheduleDisplay(expense)}
                        </span>
                      </td>
                      <td data-label="Estado" className="py-3 px-4">
                        <span className="table-stack-value">
                          <button type="button" onClick={() => handleTogglePaid(expense.id, expense.isPaid)} className="flex items-center gap-2">
                            {expense.isPaid ? <CheckCircle className="text-green-400" size={20} /> : <Circle className="text-dark-400" size={20} />}
                            <span className={expense.isPaid ? 'text-green-400' : 'text-dark-300'}>{expense.isPaid ? 'Pagado' : 'Pendiente'}</span>
                          </button>
                        </span>
                      </td>
                      <td data-label="Acciones" className="py-3 px-4">
                        <span className="table-stack-value">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingExpense(expense);
                                const d = deriveFormFromExpense(expense);
                                setFormData({
                                  description: expense.description,
                                  amount: expense.amount.toString(),
                                  currency: expense.currency,
                                  nature: d.nature,
                                  recurrenceType: d.recurrenceType,
                                  frequency: d.frequency,
                                  category: expense.category || '',
                                  paymentDay: expense.paymentDay?.toString() || '',
                                  paymentMonth: expense.paymentMonth?.toString() || '',
                                  date: formatDateForInput(expense.date),
                                  recurrenceStartDate: formatDateForInput(expense.recurrenceStartDate),
                                  recurrenceEndDate: formatDateForInput(expense.recurrenceEndDate),
                                  bankAccountId: expense.bankAccountId != null ? String(expense.bankAccountId) : '',
                                  isPaid: Boolean(expense.isPaid),
                                });
                                setShowModal(true);
                              }}
                              className="p-2 text-primary-400 hover:text-primary-300"
                            >
                              <Edit size={18} />
                            </button>
                            <button type="button" onClick={() => handleDelete(expense.id)} className="p-2 text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
                          </div>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={total}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            itemLabel="gastos"
            disabled={loading}
            variant="card"
            pageSizeOptions={pageSizeOptions}
            onPageSizeChange={setItemsPerPage}
          />
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
            aria-labelledby="expenses-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="expenses-modal-title" className="text-2xl font-bold text-white mb-6">
              {editingExpense ? 'Editar Gasto' : 'Nuevo Gasto'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {editingExpense?.vehicleId != null && editingExpense.vehicleLabel && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/95">
                  <span className="font-medium">Vinculado a vehículo:</span>{' '}
                  <Link to="/vehicles" className="text-amber-300 underline hover:text-amber-200">
                    {editingExpense.vehicleLabel}
                  </Link>
                  . Solo puede ser gasto puntual; los cambios se reflejan en Vehículos.
                </div>
              )}
              <div><label className="label">Descripción</label><input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input w-full" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Monto</label><input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">Moneda</label><select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value, bankAccountId: '' })} className="input w-full"><option value="DOP">DOP</option><option value="USD">USD</option></select></div>
              </div>
              <div>
                <label className="label">Cuenta origen (opcional)</label>
                <select
                  value={formData.bankAccountId}
                  onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Sin vincular — no actualiza saldos</option>
                  {accountsForExpense.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-dark-500 mt-1">
                  Único o anual: descuenta al guardar. Recurrente (p. ej. mensual): descuenta al marcar pagado este mes.
                </p>
              </div>
              <div>
                <label className="label">Estado</label>
                <select
                  value={formData.isPaid ? 'paid' : 'pending'}
                  onChange={(e) => setFormData({ ...formData, isPaid: e.target.value === 'paid' })}
                  className="input w-full"
                >
                  <option value="pending">Pendiente</option>
                  <option value="paid">Pagado</option>
                </select>
                <p className="text-xs text-dark-500 mt-1">
                  «Pagado» con cuenta origen: en gasto único o anual descuenta al guardar; en mensual, marca pago de este
                  periodo. Recurrente no inmediato (p. ej. mensual) sin pagar: no ajusta el saldo hasta el pago.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Tipo</label>
                  <select
                    value={formData.nature}
                    onChange={(e) => {
                      const v = e.target.value as ExpenseNature;
                      setFormData((prev) => ({ ...prev, nature: v }));
                    }}
                    className="input w-full"
                    disabled={editingExpense?.vehicleId != null}
                    title={editingExpense?.vehicleId != null ? 'Gastos de vehículo: solo puntual' : undefined}
                  >
                    <option value="fixed">Fijo</option>
                    <option value="variable">Variable</option>
                  </select>
                </div>
                <div>
                  <label className="label">Frecuencia</label>
                  <select
                    value={formData.recurrenceType === 'non_recurrent' ? '' : formData.frequency}
                    onChange={(e) =>
                      setFormData({ ...formData, frequency: e.target.value as ExpenseFrequency })
                    }
                    className="input w-full"
                    disabled={editingExpense?.vehicleId != null || formData.recurrenceType === 'non_recurrent'}
                  >
                    {formData.recurrenceType === 'non_recurrent' ? (
                      <option value="">—</option>
                    ) : (
                      <>
                        <option value="daily">Diario</option>
                        <option value="weekly">Semanal</option>
                        <option value="biweekly">Cada 2 semanas</option>
                        <option value="semi_monthly">Quincenal</option>
                        <option value="monthly">Mensual</option>
                        <option value="quarterly">Trimestral</option>
                        <option value="semi_annual">Semestral</option>
                        <option value="annual">Anual</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="label">Naturaleza</label>
                  <select
                    value={formData.recurrenceType}
                    onChange={(e) => {
                      const v = e.target.value as ExpenseRecurrenceType;
                      setFormData((prev) => ({
                        ...prev,
                        recurrenceType: v,
                        frequency: v === 'non_recurrent' ? '' : prev.frequency || 'monthly',
                        recurrenceStartDate: v === 'non_recurrent' ? '' : prev.recurrenceStartDate,
                        recurrenceEndDate: v === 'non_recurrent' ? '' : prev.recurrenceEndDate,
                      }));
                    }}
                    className="input w-full"
                    disabled={editingExpense?.vehicleId != null}
                  >
                    <option value="recurrent">Recurrente</option>
                    <option value="non_recurrent">Único</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Categoría</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">{categories.length === 0 ? 'Sin categorías' : 'Seleccionar Categoría'}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              {formData.recurrenceType === 'recurrent' && formData.frequency === 'monthly' && (
                <div>
                  <label className="label">Día de pago</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.paymentDay}
                    onChange={(e) => setFormData({ ...formData, paymentDay: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
              )}
              {formData.recurrenceType === 'recurrent' && formData.frequency === 'annual' && (
                <div>
                  <label className="label">Mes de pago</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={formData.paymentMonth}
                    onChange={(e) => setFormData({ ...formData, paymentMonth: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
              )}
              {formData.recurrenceType === 'non_recurrent' && (
                <div>
                  <label className="label">Fecha</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
              )}
              {formData.recurrenceType === 'recurrent' &&
                formData.frequency &&
                NEEDS_START_DATE_FREQ.includes(formData.frequency as ExpenseFrequency) && (
                  <div>
                    <label className="label">Fecha de inicio / referencia</label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      className="input w-full"
                      required
                    />
                  </div>
                )}
              {formData.recurrenceType === 'recurrent' && editingExpense?.vehicleId == null && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-dark-600/50 mt-2">
                  <div>
                    <label className="label">Inicio de vigencia (opcional)</label>
                    <input
                      type="date"
                      value={formData.recurrenceStartDate}
                      onChange={(e) => setFormData({ ...formData, recurrenceStartDate: e.target.value })}
                      className="input w-full"
                    />
                    <p className="text-xs text-dark-500 mt-1">
                      Primera fecha en que el calendario y las proyecciones incluyen la serie (inclusive).
                    </p>
                  </div>
                  <div>
                    <label className="label">Fin de vigencia (opcional)</label>
                    <input
                      type="date"
                      value={formData.recurrenceEndDate}
                      onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })}
                      className="input w-full"
                    />
                    <p className="text-xs text-dark-500 mt-1">
                      Última fecha en que aplica (inclusive). Vacío si la serie no tiene fin definido.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">{editingExpense ? 'Actualizar' : 'Crear'}</button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">Cancelar</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
