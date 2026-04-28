import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { BankAccount, Income, IncomeFrequency, IncomeNature, IncomeRecurrenceType } from '../types';
import { Plus, Edit, Trash2, TrendingUp, Search, X, ArrowUp, ArrowDown, ArrowUpDown, CheckCircle, Circle } from 'lucide-react';
import toast from 'react-hot-toast';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { formatDateDdMmYyyy, formatDateForInput, calendarDateToSortableMs } from '../utils/dateUtils';
import { formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';
import { useAuth } from '../context/AuthContext';
import SummaryBarToggleButton from '../components/SummaryBarToggleButton';
import { usePersistedSummaryBarVisible } from '../hooks/usePersistedSummaryBarVisible';

const INCOME_FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  biweekly: 'Cada 2 semanas',
  semi_monthly: 'Quincenal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semi_annual: 'Semestral',
  annual: 'Anual',
};

const NEEDS_START_DATE_INCOME: IncomeFrequency[] = [
  'daily',
  'weekly',
  'biweekly',
  'quarterly',
  'semi_annual',
  'annual',
];

function deriveIncomeNature(item: Income): IncomeNature {
  return item.nature ?? 'variable';
}

function deriveIncomeRecurrence(item: Income): IncomeRecurrenceType {
  return item.recurrenceType ?? 'non_recurrent';
}

/** Normaliza respuesta API (minúsculas o legacy en mayúsculas) a valor de formulario */
function incomeFrequencyFromApi(f?: string | null): IncomeFrequency | '' {
  if (!f) return '';
  const low = String(f).trim().toLowerCase();
  const allowed: IncomeFrequency[] = [
    'daily',
    'weekly',
    'biweekly',
    'semi_monthly',
    'monthly',
    'quarterly',
    'semi_annual',
    'annual',
  ];
  if (allowed.includes(low as IncomeFrequency)) return low as IncomeFrequency;
  const legacy: Record<string, IncomeFrequency> = {
    DAILY: 'daily',
    WEEKLY: 'weekly',
    BIWEEKLY: 'biweekly',
    SEMI_MONTHLY: 'semi_monthly',
    MONTHLY: 'monthly',
    QUARTERLY: 'quarterly',
    SEMI_ANNUAL: 'semi_annual',
    ANNUAL: 'annual',
  };
  return legacy[f] ?? legacy[String(f).toUpperCase()] ?? 'monthly';
}

function formatIncomeFrequencyCell(f?: string | null): string {
  if (!f) return '-';
  const key = incomeFrequencyFromApi(f);
  return key ? INCOME_FREQUENCY_LABELS[key] ?? String(f) : '-';
}

function labelIncomeTipo(item: Income): string {
  return deriveIncomeNature(item) === 'fixed' ? 'Fijo' : 'Variable';
}

function labelIncomeNaturaleza(item: Income): string {
  return deriveIncomeRecurrence(item) === 'recurrent' ? 'Recurrente' : 'Único';
}

function formatIncomeScheduleCell(item: Income): string {
  if (deriveIncomeRecurrence(item) === 'non_recurrent') {
    return item.date ? formatDateDdMmYyyy(item.date) : '-';
  }
  const fq = incomeFrequencyFromApi(item.frequency);
  if (fq === 'monthly') {
    return item.receiptDay != null ? `Día ${item.receiptDay}` : '-';
  }
  if (fq === 'semi_monthly') {
    return 'Días 15 y 30 (o último del mes)';
  }
  if (fq === 'annual') {
    return item.date ? `Anual: ${formatDateDdMmYyyy(item.date)}` : '-';
  }
  if (item.date) {
    return `Inicio: ${formatDateDdMmYyyy(item.date)}`;
  }
  return '-';
}

const IncomePage: React.FC = () => {
  const { user } = useAuth();
  const { visible: summaryBarVisible, toggle: toggleSummaryBar } = usePersistedSummaryBarVisible(
    user?.id,
    'income'
  );
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [income, setIncome] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterNature, setFilterNature] = useState('');
  const [filterRecurrence, setFilterRecurrence] = useState('');
  const [filterFrequency, setFilterFrequency] = useState('');
  const [summary, setSummary] = useState({ totalDop: 0, totalUsd: 0, totalIncome: 0 });
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { pageSize: itemsPerPage, setPageSize: setItemsPerPage, pageSizeOptions } = usePersistedTablePageSize(
    'pf:pageSize:income',
    TABLE_PAGE_SIZE
  );
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    currency: 'DOP',
    nature: 'fixed' as IncomeNature,
    recurrenceType: 'recurrent' as IncomeRecurrenceType,
    frequency: 'monthly' as IncomeFrequency | '',
    receiptDay: '',
    date: '',
    recurrenceStartDate: '',
    recurrenceEndDate: '',
    bankAccountId: '',
    isReceived: false,
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterNature, filterRecurrence, filterFrequency, itemsPerPage]);

  useEffect(() => {
    if (filterRecurrence === 'non_recurrent') {
      setFilterFrequency('');
    }
  }, [filterRecurrence]);

  const fetchIncome = useCallback(async () => {
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

      const response = await api.get('/income', { params });
      setIncome(
        (response.data.income || []).map((row: Income) => ({
          ...row,
          isReceived: row.isReceived ?? false,
        }))
      );
      setSummary(response.data.summary || { totalDop: 0, totalUsd: 0, totalIncome: 0 });
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      toast.error('Error al cargar ingresos');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterNature, filterRecurrence, filterFrequency, currentPage, itemsPerPage]);

  useEffect(() => {
    fetchIncome();
  }, [fetchIncome]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const nature = formData.nature;
      const recurrenceType = formData.recurrenceType;
      const payload: Record<string, unknown> = {
        description: formData.description,
        amount: parseFloat(formData.amount),
        currency: formData.currency,
        nature,
        recurrenceType,
        isReceived: formData.isReceived,
      };
      if (formData.bankAccountId) {
        payload.bankAccountId = parseInt(formData.bankAccountId, 10);
      } else {
        payload.bankAccountId = null;
      }

      if (recurrenceType === 'non_recurrent') {
        payload.frequency = null;
        payload.receiptDay = null;
        payload.date = formData.date;
        payload.recurrenceStartDate = null;
        payload.recurrenceEndDate = null;
      } else {
        const fq = (formData.frequency || 'monthly') as IncomeFrequency;
        payload.frequency = fq;
        if (fq === 'monthly') {
          payload.receiptDay = parseInt(formData.receiptDay, 10);
          payload.date = null;
        } else if (fq === 'semi_monthly') {
          payload.receiptDay = null;
          payload.date = null;
        } else {
          payload.receiptDay = null;
          payload.date = formData.date || null;
        }
        payload.recurrenceStartDate = formData.recurrenceStartDate.trim() || null;
        payload.recurrenceEndDate = formData.recurrenceEndDate.trim() || null;
      }

      if (editingIncome) {
        await api.put(`/income/${editingIncome.id}`, payload);
        toast.success('Ingreso actualizado');
      } else {
        await api.post('/income', payload);
        toast.success('Ingreso creado');
      }

      setShowModal(false);
      resetForm();
      fetchIncome();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar ingreso');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este ingreso?')) return;
    try {
      await api.delete(`/income/${id}`);
      toast.success('Ingreso eliminado');
      fetchIncome();
    } catch (error: any) {
      toast.error('Error al eliminar ingreso');
    }
  };

  const handleToggleReceived = async (id: number, isReceived: boolean) => {
    try {
      await api.patch(`/income/${id}/receipt-status`, { isReceived: !isReceived });
      toast.success('Estado actualizado');
      fetchIncome();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al actualizar estado');
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
      receiptDay: '',
      date: '',
      recurrenceStartDate: '',
      recurrenceEndDate: '',
      bankAccountId: '',
      isReceived: false,
    });
    setEditingIncome(null);
  };

  useEscapeKey(showModal, () => {
    setShowModal(false);
    resetForm();
  });
  useModalFocusTrap(modalPanelRef, showModal);

  const accountsForIncome = useMemo(() => {
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
        title="Ingresos"
        subtitle="Gestiona tus ingresos"
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
              <span>Agregar Ingreso</span>
            </button>
          </div>
        }
      />

      {/* Summary */}
      {summaryBarVisible && (
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">Ingresos Totales (DOP)</p>
              <p className="text-2xl font-bold text-white">{summary.totalDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Ingresos Totales (USD)</p>
              <p className="text-2xl font-bold text-white">{summary.totalUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Cantidad de Ingresos</p>
              <p className="text-2xl font-bold text-white">{summary.totalIncome}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
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
              title={filterRecurrence === 'non_recurrent' ? 'No aplica a ingresos únicos' : undefined}
            >
              <option value="">Todas</option>
              {(Object.keys(INCOME_FREQUENCY_LABELS) as IncomeFrequency[]).map((k) => (
                <option key={k} value={k}>
                  {INCOME_FREQUENCY_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {(searchTerm || filterNature || filterRecurrence || filterFrequency) && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setFilterNature('');
                setFilterRecurrence('');
                setFilterFrequency('');
              }}
              className="text-sm text-accent-400 hover:text-accent-300"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {income.length === 0 ? (
        <div className="card text-center py-12">
          <TrendingUp className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">No tienes ingresos registrados</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Agregar Primer Ingreso</button>
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
                  {[...income].sort((a, b) => {
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
                        aValue = labelIncomeTipo(a);
                        bValue = labelIncomeTipo(b);
                        break;
                      case 'frequency':
                        aValue = incomeFrequencyFromApi(a.frequency) || '';
                        bValue = incomeFrequencyFromApi(b.frequency) || '';
                        break;
                      case 'naturaleza':
                        aValue = labelIncomeNaturaleza(a);
                        bValue = labelIncomeNaturaleza(b);
                        break;
                      case 'date':
                        aValue = a.date ? calendarDateToSortableMs(a.date) : (a.receiptDay || 0);
                        bValue = b.date ? calendarDateToSortableMs(b.date) : (b.receiptDay || 0);
                        break;
                      case 'status':
                        aValue = a.isReceived ? 1 : 0;
                        bValue = b.isReceived ? 1 : 0;
                        break;
                      default:
                        return 0;
                    }

                    if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
                    if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
                    return 0;
                  }).map((item) => (
                    <tr key={item.id} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                      <td data-label="Descripción" data-stack="hero" className="py-3 px-4 text-white">
                        {item.description}
                      </td>
                      <td data-label="Monto" className="py-3 px-4">
                        <span className="table-stack-value">
                          {item.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {item.currency}
                        </span>
                      </td>
                      <td data-label="Tipo" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{labelIncomeTipo(item)}</span>
                      </td>
                      <td data-label="Frecuencia" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">
                          {deriveIncomeRecurrence(item) === 'recurrent'
                            ? formatIncomeFrequencyCell(item.frequency)
                            : '—'}
                        </span>
                      </td>
                      <td data-label="Naturaleza" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{labelIncomeNaturaleza(item)}</span>
                      </td>
                      <td data-label="Fecha / día" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{formatIncomeScheduleCell(item)}</span>
                      </td>
                      <td data-label="Estado" className="py-3 px-4">
                        <span className="table-stack-value">
                          <button
                            type="button"
                            onClick={() => handleToggleReceived(item.id, item.isReceived)}
                            className="flex items-center gap-2"
                          >
                            {item.isReceived ? (
                              <CheckCircle className="text-green-400" size={20} />
                            ) : (
                              <Circle className="text-dark-400" size={20} />
                            )}
                            <span className={item.isReceived ? 'text-green-400' : 'text-dark-300'}>
                              {item.isReceived ? 'Recibido' : 'Pendiente'}
                            </span>
                          </button>
                        </span>
                      </td>
                      <td data-label="Acciones" className="py-3 px-4">
                        <span className="table-stack-value">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingIncome(item);
                                const nat = deriveIncomeNature(item);
                                const rec = deriveIncomeRecurrence(item);
                                const fq = incomeFrequencyFromApi(item.frequency) || 'monthly';
                                setFormData({
                                  description: item.description,
                                  amount: item.amount.toString(),
                                  currency: item.currency,
                                  nature: nat,
                                  recurrenceType: rec,
                                  frequency: rec === 'recurrent' ? fq : '',
                                  receiptDay: item.receiptDay?.toString() || '',
                                  date: formatDateForInput(item.date),
                                  recurrenceStartDate: formatDateForInput(item.recurrenceStartDate),
                                  recurrenceEndDate: formatDateForInput(item.recurrenceEndDate),
                                  bankAccountId: item.bankAccountId != null ? String(item.bankAccountId) : '',
                                  isReceived: item.isReceived ?? false,
                                });
                                setShowModal(true);
                              }}
                              className="p-2 text-primary-400 hover:text-primary-300"
                            >
                              <Edit size={18} />
                            </button>
                            <button type="button" onClick={() => handleDelete(item.id)} className="p-2 text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
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
            itemLabel="ingresos"
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
            aria-labelledby="income-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="income-modal-title" className="text-2xl font-bold text-white mb-6">
              {editingIncome ? 'Editar Ingreso' : 'Nuevo Ingreso'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="label">Descripción</label><input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input w-full" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Monto</label><input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">Moneda</label><select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value, bankAccountId: '' })} className="input w-full"><option value="DOP">DOP</option><option value="USD">USD</option></select></div>
              </div>
              <div>
                <label className="label">Cuenta destino (opcional)</label>
                <select
                  value={formData.bankAccountId}
                  onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Sin vincular — no actualiza saldos</option>
                  {accountsForIncome.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-dark-500 mt-1">
                  Si hay cuenta vinculada, el saldo aumenta al marcar el ingreso como «Recibido» (en la tabla o aquí).
                </p>
              </div>
              <div>
                <label className="label">Estado</label>
                <select
                  value={formData.isReceived ? 'received' : 'pending'}
                  onChange={(e) =>
                    setFormData({ ...formData, isReceived: e.target.value === 'received' })
                  }
                  className="input w-full"
                >
                  <option value="pending">Pendiente</option>
                  <option value="received">Recibido</option>
                </select>
                <p className="text-xs text-dark-500 mt-1">
                  «Recibido» con cuenta destino actualiza el saldo al guardar (ingreso nuevo) o al editar.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Tipo</label>
                  <select
                    value={formData.nature}
                    onChange={(e) => {
                      const v = e.target.value as IncomeNature;
                      setFormData((prev) => ({ ...prev, nature: v }));
                    }}
                    className="input w-full"
                  >
                    <option value="fixed">Fijo</option>
                    <option value="variable">Variable</option>
                  </select>
                </div>
                <div>
                  <label className="label">Frecuencia</label>
                  <select
                    value={formData.recurrenceType === 'non_recurrent' ? '' : formData.frequency}
                    onChange={(e) => {
                      const v = e.target.value as IncomeFrequency;
                      setFormData((prev) => ({
                        ...prev,
                        frequency: v,
                        receiptDay: v === 'monthly' ? prev.receiptDay : '',
                        date: v === 'monthly' || v === 'semi_monthly' ? '' : prev.date,
                      }));
                    }}
                    className="input w-full"
                    disabled={formData.recurrenceType === 'non_recurrent'}
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
                      const v = e.target.value as IncomeRecurrenceType;
                      setFormData((prev) => ({
                        ...prev,
                        recurrenceType: v,
                        frequency: v === 'non_recurrent' ? '' : prev.frequency || 'monthly',
                        receiptDay: v === 'non_recurrent' ? '' : prev.receiptDay,
                        recurrenceStartDate: v === 'non_recurrent' ? '' : prev.recurrenceStartDate,
                        recurrenceEndDate: v === 'non_recurrent' ? '' : prev.recurrenceEndDate,
                      }));
                    }}
                    className="input w-full"
                  >
                    <option value="recurrent">Recurrente</option>
                    <option value="non_recurrent">Único</option>
                  </select>
                </div>
              </div>
              {formData.recurrenceType === 'recurrent' && (
                <>
                  {formData.frequency === 'monthly' && (
                    <div>
                      <label className="label">Día de recepción</label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={formData.receiptDay}
                        onChange={(e) => setFormData({ ...formData, receiptDay: e.target.value, date: '' })}
                        className="input w-full"
                        required
                      />
                    </div>
                  )}
                  {formData.frequency &&
                    NEEDS_START_DATE_INCOME.includes(formData.frequency as IncomeFrequency) && (
                      <div>
                        <label className="label">Fecha de inicio / referencia</label>
                        <input
                          type="date"
                          value={formData.date}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value, receiptDay: '' })}
                          className="input w-full"
                          required
                        />
                        <p className="text-xs text-dark-400 mt-1">
                          {formData.frequency === 'daily' && 'Cada día a partir de esta fecha.'}
                          {formData.frequency === 'weekly' && 'Cada 7 días a partir de esta fecha.'}
                          {formData.frequency === 'biweekly' && 'Cada 14 días a partir de esta fecha.'}
                          {formData.frequency === 'quarterly' && 'Cada 3 meses a partir de esta fecha.'}
                          {formData.frequency === 'semi_annual' && 'Cada 6 meses a partir de esta fecha.'}
                          {formData.frequency === 'annual' && 'Se repetirá cada año en la misma fecha calendario.'}
                        </p>
                      </div>
                    )}
                  {formData.frequency === 'semi_monthly' && (
                    <div className="rounded-lg border border-dark-600/80 bg-dark-800/40 px-3 py-2 text-sm text-dark-300">
                      <p>
                        Se consideran dos pagos por mes: día <strong className="text-white">15</strong> y día{' '}
                        <strong className="text-white">30</strong> (o el último día del mes si es menor).
                      </p>
                      <p className="mt-2 text-xs text-dark-500">
                        Puede acotar la vigencia de la serie con los campos siguientes (opcional).
                      </p>
                    </div>
                  )}
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
                </>
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
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">{editingIncome ? 'Actualizar' : 'Crear'}</button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">Cancelar</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default IncomePage;
