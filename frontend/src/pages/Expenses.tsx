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
import {
  Plus,
  Edit,
  Trash2,
  History,
  TrendingDown,
  CheckCircle,
  Circle,
  Search,
  X,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Car,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ExpenseCategory } from '../types';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { formatDateDdMmYyyy, formatDateForInput, calendarDateToSortableMs, formatRecurringDayForPeriod } from '../utils/dateUtils';
import { bankAccountSupportsLedgerCurrency, formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';
import { useAuth } from '../context/AuthContext';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';
import FinancialHistoryModal from '../components/FinancialHistoryModal';
import SummaryBarToggleButton from '../components/SummaryBarToggleButton';
import EntityActiveToggle from '../components/EntityActiveToggle';
import { usePersistedSummaryBarVisible } from '../hooks/usePersistedSummaryBarVisible';

const EXPENSE_NATURE_LABELS: Record<ExpenseNature, string> = {
  fixed: 'fixed',
  variable: 'variable',
};
const EXPENSE_RECURRENCE_LABELS: Record<ExpenseRecurrenceType, string> = {
  recurrent: 'recurrent',
  non_recurrent: 'oneOff',
};
const EXPENSE_FREQUENCY_LABELS: Record<ExpenseFrequency, string> = {
  daily: 'daily',
  weekly: 'weekly',
  biweekly: 'biweekly',
  semi_monthly: 'semiMonthly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  semi_annual: 'semiAnnual',
  annual: 'annual',
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
  if (recurrenceType === 'non_recurrent') return '-';
  const fq = frequency as ExpenseFrequency;
  return fq ? EXPENSE_FREQUENCY_LABELS[fq] || String(frequency) : '-';
}

function labelExpenseNaturaleza(e: Expense): string {
  return EXPENSE_RECURRENCE_LABELS[deriveFormFromExpense(e).recurrenceType];
}

/** Variable + recurrente mensual: al pasar a pagado se puede indicar monto solo del periodo. */
function isVariableRecurrentMonthlyExpense(e: Expense): boolean {
  const d = deriveFormFromExpense(e);
  return (
    d.nature === 'variable' &&
    d.recurrenceType === 'recurrent' &&
    (d.frequency || 'monthly') === 'monthly'
  );
}

function formatExpenseScheduleDisplay(e: Expense): string {
  const { recurrenceType, frequency } = deriveFormFromExpense(e);
  if (recurrenceType === 'non_recurrent') {
    return e.date ? formatDateDdMmYyyy(e.date) : '-';
  }
  const fq = (frequency || 'monthly') as ExpenseFrequency;
  const today = new Date();
  if (fq === 'monthly') {
    return e.paymentDay != null
      ? formatRecurringDayForPeriod(e.paymentDay, today.getFullYear(), today.getMonth() + 1) : '-';
  }
  if (fq === 'annual') {
    return e.paymentDay != null && e.paymentMonth != null
      ? formatRecurringDayForPeriod(e.paymentDay, today.getFullYear(), e.paymentMonth) : '-';
  }
  if (e.date) return formatDateDdMmYyyy(e.date);
  return '-';
}

type ExpenseListSummary = {
  totalDop: number;
  totalUsd: number;
  totalExpenses: number;
  totalPrimary: number;
  totalSecondary: number;
  primaryCurrency?: string;
  secondaryCurrency?: string;
};

const EMPTY_EXPENSE_SUMMARY: ExpenseListSummary = {
  totalDop: 0,
  totalUsd: 0,
  totalExpenses: 0,
  totalPrimary: 0,
  totalSecondary: 0,
  primaryCurrency: undefined,
  secondaryCurrency: undefined,
};

const Expenses: React.FC = () => {
  const { t } = useTranslation();
  const expenseNatureLabels = useMemo(
    () => ({
      fixed: t('pages.expenses.fixed'),
      variable: t('pages.expenses.variable'),
      recurrent: t('pages.expenses.recurrent'),
      oneOff: t('pages.expenses.oneOff'),
      daily: t('pages.expenses.frequencyDaily'),
      weekly: t('pages.expenses.frequencyWeekly'),
      biweekly: t('pages.expenses.frequencyBiweekly'),
      semiMonthly: t('pages.expenses.frequencySemiMonthly'),
      monthly: t('pages.expenses.frequencyMonthly'),
      quarterly: t('pages.expenses.frequencyQuarterly'),
      semiAnnual: t('pages.expenses.frequencySemiAnnual'),
      annual: t('pages.expenses.frequencyAnnual'),
    }),
    [t]
  );
  const { user } = useAuth();
  const {
    formatCurrency: fc,
    currencySelectLabel,
    defaultTransactionCurrency,
    transactionCurrencyOptions,
    primaryCurrency,
    secondaryCurrency,
  } = useIntlFormatting();
  const { visible: summaryBarVisible, toggle: toggleSummaryBar } = usePersistedSummaryBarVisible(
    user?.id,
    'expenses'
  );
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const periodPayModalRef = useRef<HTMLDivElement>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [historyExpense, setHistoryExpense] = useState<{ id: number; title: string } | null>(null);
  const [periodPayExpense, setPeriodPayExpense] = useState<Expense | null>(null);
  const [periodPayAmount, setPeriodPayAmount] = useState('');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterNature, setFilterNature] = useState('');
  const [filterRecurrence, setFilterRecurrence] = useState('');
  const [filterFrequency, setFilterFrequency] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [summary, setSummary] = useState<ExpenseListSummary>(EMPTY_EXPENSE_SUMMARY);
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
      {
        const raw = response.data.summary as Partial<ExpenseListSummary> | undefined;
        setSummary({
          ...EMPTY_EXPENSE_SUMMARY,
          ...raw,
          totalDop: raw?.totalDop ?? 0,
          totalUsd: raw?.totalUsd ?? 0,
          totalExpenses: raw?.totalExpenses ?? 0,
          totalPrimary: raw?.totalPrimary ?? 0,
          totalSecondary: raw?.totalSecondary ?? 0,
        });
      }
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      toast.error(t('toast.expenses.loadError'));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterNature, filterRecurrence, filterFrequency, categoryFilter, currentPage, itemsPerPage, t]);

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
        toast.success(t('toast.expenses.updated'));
      } else {
        await api.post('/expenses', data);
        toast.success(t('toast.expenses.created'));
      }

      setShowModal(false);
      resetForm();
      fetchExpenses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.expenses.saveError'));
    }
  };

  const submitExpensePaymentStatus = async (id: number, nextPaid: boolean, actualAmount?: number) => {
    try {
      const body: { isPaid: boolean; actualAmount?: number } = { isPaid: nextPaid };
      if (nextPaid && actualAmount != null) {
        body.actualAmount = actualAmount;
      }
      await api.patch(`/expenses/${id}/payment-status`, body);
      toast.success(t('toast.generic.statusUpdated'));
      fetchExpenses();
    } catch (error: any) {
      toast.error(t('toast.generic.statusUpdateFailed'));
    }
  };

  const handleTogglePaid = async (expense: Expense) => {
    const nextPaid = !expense.isPaid;
    if (nextPaid && isVariableRecurrentMonthlyExpense(expense)) {
      setPeriodPayExpense(expense);
      setPeriodPayAmount(String(expense.amount));
      return;
    }
    await submitExpensePaymentStatus(expense.id, nextPaid);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('confirm.deleteExpense'))) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success(t('toast.expenses.deleted'));
      fetchExpenses();
    } catch (error: any) {
      toast.error(t('toast.expenses.deleteError'));
    }
  };

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      currency: defaultTransactionCurrency,
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
  useEscapeKey(!!periodPayExpense, () => setPeriodPayExpense(null));
  useModalFocusTrap(modalPanelRef, showModal);
  useModalFocusTrap(periodPayModalRef, !!periodPayExpense);

  const accountsForExpense = useMemo(() => {
    const c = formData.currency;
    return bankAccounts.filter((a) =>
      a.isActive && bankAccountSupportsLedgerCurrency(a, c, primaryCurrency, secondaryCurrency)
    );
  }, [bankAccounts, formData.currency, primaryCurrency, secondaryCurrency]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.expenses.title')}
        subtitle={t('pages.expenses.subtitle')}
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
              <span>{t('pages.expenses.addExpense')}</span>
            </button>
          </div>
        }
      />

      {/* Summary */}
      {summaryBarVisible && summary && (
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">
                {t('pages.expenses.expensesInCurrency', { currency: summary.primaryCurrency ?? primaryCurrency })}
              </p>
              <p className="text-2xl font-bold text-white">
                {fc(
                  summary.totalPrimary ?? 0,
                  (summary.primaryCurrency ?? primaryCurrency) as string
                )}
              </p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">
                {t('pages.expenses.expensesInCurrency', { currency: summary.secondaryCurrency ?? secondaryCurrency })}
              </p>
              <p className="text-2xl font-bold text-white">
                {fc(
                  summary.totalSecondary ?? 0,
                  (summary.secondaryCurrency ?? secondaryCurrency) as string
                )}
              </p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.expenses.totalExpensesCount')}</p>
              <p className="text-2xl font-bold text-white">{summary.totalExpenses}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="relative sm:col-span-2 xl:col-span-2">
            <label className="text-xs text-dark-400 block mb-1">{t('common.actions.search')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
              <input
                type="text"
                placeholder={t('pages.expenses.descriptionPlaceholder')}
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
            <label className="text-xs text-dark-400 block mb-1">{t('pages.expenses.type')}</label>
            <select
              value={filterNature}
              onChange={(e) => setFilterNature(e.target.value)}
              className="input w-full"
            >
              <option value="">{t('pages.expenses.all')}</option>
              <option value="fixed">{t('pages.expenses.fixed')}</option>
              <option value="variable">{t('pages.expenses.variable')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-dark-400 block mb-1">{t('pages.expenses.nature')}</label>
            <select
              value={filterRecurrence}
              onChange={(e) => setFilterRecurrence(e.target.value)}
              className="input w-full"
            >
              <option value="">{t('pages.expenses.all')}</option>
              <option value="recurrent">{t('pages.expenses.recurrent')}</option>
              <option value="non_recurrent">{t('pages.expenses.oneOff')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-dark-400 block mb-1">{t('pages.expenses.frequency')}</label>
            <select
              value={filterFrequency}
              onChange={(e) => setFilterFrequency(e.target.value)}
              disabled={filterRecurrence === 'non_recurrent'}
              className="input w-full disabled:opacity-50"
              title={filterRecurrence === 'non_recurrent' ? t('pages.expenses.filterUniqueTooltip') : undefined}
            >
              <option value="">{t('pages.expenses.all')}</option>
              {(Object.keys(EXPENSE_FREQUENCY_LABELS) as ExpenseFrequency[]).map((k) => (
                <option key={k} value={k}>
                  {expenseNatureLabels[EXPENSE_FREQUENCY_LABELS[k] as keyof typeof expenseNatureLabels]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-dark-400 block mb-1">{t('pages.expenses.category')}</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="input w-full"
            >
              <option value="">{t('pages.expenses.all')}</option>
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
              {t('pages.expenses.clearFilters')}
            </button>
          </div>
        )}
      </div>

      {expenses.length === 0 ? (
        <div className="card text-center py-12">
          <TrendingDown className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">{t('pages.expenses.emptyState')}</p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary"
          >
            {t('pages.expenses.addFirstExpense')}
          </button>
        </div>
      ) : (
        <>
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
                        <span>{t('pages.expenses.description')}</span>
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
                        <span>{t('pages.expenses.amount')}</span>
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
                        <span>{t('pages.expenses.type')}</span>
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
                        <span>{t('pages.expenses.frequency')}</span>
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
                        <span>{t('pages.expenses.nature')}</span>
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
                        <span>{t('pages.expenses.category')}</span>
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
                        <span>{t('pages.expenses.dateDay')}</span>
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
                        <span>{t('pages.expenses.status')}</span>
                        {sortBy === 'status' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                      </div>
                    </th>
                    <th className="text-right py-3 px-4 text-dark-400 font-medium">{t('pages.expenses.actions')}</th>
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
                      <td data-label={t('pages.expenses.description')} data-stack="hero" className="py-3 px-4 text-white">
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="break-words">{expense.description}</span>
                          {expense.vehicleLabel && (
                            <Link
                              to="/vehicles"
                              className="inline-flex items-center gap-1 text-xs text-amber-400/90 hover:text-amber-300"
                              title={t('pages.expenses.linkVehicles')}
                            >
                              <Car className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {expense.vehicleLabel}
                            </Link>
                          )}
                        </div>
                      </td>
                      <td data-label={t('pages.expenses.amount')} className="py-3 px-4">
                        <span className="table-stack-value">
                          {fc(expense.amount, expense.currency)}
                        </span>
                      </td>
                      <td data-label={t('pages.expenses.type')} className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{expenseNatureLabels[labelExpenseTipo(expense) as keyof typeof expenseNatureLabels]}</span>
                      </td>
                      <td data-label={t('pages.expenses.frequency')} className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">
                          {labelExpenseFrecuencia(expense) === '-'
                            ? '-'
                            : expenseNatureLabels[labelExpenseFrecuencia(expense) as keyof typeof expenseNatureLabels]}
                        </span>
                      </td>
                      <td data-label={t('pages.expenses.nature')} className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{expenseNatureLabels[labelExpenseNaturaleza(expense) as keyof typeof expenseNatureLabels]}</span>
                      </td>
                      <td data-label={t('pages.expenses.category')} className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{expense.category || '-'}</span>
                      </td>
                      <td data-label={t('pages.expenses.dateDay')} className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">
                          {formatExpenseScheduleDisplay(expense)}
                        </span>
                      </td>
                      <td data-label={t('pages.expenses.status')} className="py-3 px-4">
                        <span className="table-stack-value">
                          <button type="button" onClick={() => handleTogglePaid(expense)} className="flex items-center gap-2">
                            {expense.isPaid ? <CheckCircle className="text-green-400" size={20} /> : <Circle className="text-dark-400" size={20} />}
                            <span className={expense.isPaid ? 'text-green-400' : 'text-dark-300'}>{expense.isPaid ? t('pages.expenses.paid') : t('pages.expenses.pending')}</span>
                          </button>
                        </span>
                      </td>
                      <td data-label={t('pages.expenses.actions')} className="py-3 px-4">
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
                            <button
                              type="button"
                              onClick={() => setHistoryExpense({ id: expense.id, title: expense.description })}
                              className="p-2 text-dark-300 hover:text-amber-300"
                              title={t('common.actions.history')}
                              aria-label={t('pages.financialItemHistory.historyAria')}
                            >
                              <History size={18} />
                            </button>
                            <button type="button" onClick={() => handleDelete(expense.id)} className="p-2 text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
                            <EntityActiveToggle
                              resourcePath="expenses"
                              entityId={expense.id}
                              isActive={expense.isActive}
                              entityLabel={expense.description}
                              onChanged={fetchExpenses}
                            />
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
            className="mt-4 sm:mt-5"
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={total}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            itemLabel={t('pages.expenses.itemsLabel')}
            disabled={loading}
            variant="card"
            pageSizeOptions={pageSizeOptions}
            onPageSizeChange={setItemsPerPage}
          />
        </>
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
              {editingExpense ? t('pages.expenses.editExpense') : t('pages.expenses.newExpense')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {editingExpense?.vehicleId != null && editingExpense.vehicleLabel && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100/95">
                  <span className="font-medium">{t('pages.expenses.linkedToVehicle')}:</span>{' '}
                  <Link to="/vehicles" className="text-amber-300 underline hover:text-amber-200">
                    {editingExpense.vehicleLabel}
                  </Link>
                  . {t('pages.expenses.vehicleLinkedHint')}
                </div>
              )}
              <div><label className="label">{t('pages.expenses.description')}</label><input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input w-full" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">{t('pages.expenses.amount')}</label><input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="input w-full" required /></div>
                <div>
                  <label className="label">{t('pages.loans.currency')}</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value, bankAccountId: '' })}
                    className="input w-full"
                  >
                    {transactionCurrencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {currencySelectLabel(code)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">{t('pages.expenses.sourceAccountOptional')}</label>
                <select
                  value={formData.bankAccountId}
                  onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">{t('pages.expenses.unlinkedNoBalanceUpdate')}</option>
                  {accountsForExpense.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-dark-500 mt-1">
                  {t('pages.expenses.accountImpactHint')}
                </p>
              </div>
              <div>
                <label className="label">{t('pages.expenses.status')}</label>
                <select
                  value={formData.isPaid ? 'paid' : 'pending'}
                  onChange={(e) => setFormData({ ...formData, isPaid: e.target.value === 'paid' })}
                  className="input w-full"
                >
                  <option value="pending">{t('pages.expenses.pending')}</option>
                  <option value="paid">{t('pages.expenses.paid')}</option>
                </select>
                <p className="text-xs text-dark-500 mt-1">
                  {t('pages.expenses.paymentStatusHint')}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">{t('pages.expenses.type')}</label>
                  <select
                    value={formData.nature}
                    onChange={(e) => {
                      const v = e.target.value as ExpenseNature;
                      setFormData((prev) => ({ ...prev, nature: v }));
                    }}
                    className="input w-full"
                    disabled={editingExpense?.vehicleId != null}
                    title={editingExpense?.vehicleId != null ? t('pages.expenses.vehicleOneoffTooltip') : undefined}
                  >
                    <option value="fixed">{t('pages.expenses.fixed')}</option>
                    <option value="variable">{t('pages.expenses.variable')}</option>
                  </select>
                </div>
                <div>
                  <label className="label">{t('pages.expenses.frequency')}</label>
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
                        <option value="daily">{t('pages.expenses.frequencyDaily')}</option>
                        <option value="weekly">{t('pages.expenses.frequencyWeekly')}</option>
                        <option value="biweekly">{t('pages.expenses.frequencyBiweekly')}</option>
                        <option value="semi_monthly">{t('pages.expenses.frequencySemiMonthly')}</option>
                        <option value="monthly">{t('pages.expenses.frequencyMonthly')}</option>
                        <option value="quarterly">{t('pages.expenses.frequencyQuarterly')}</option>
                        <option value="semi_annual">{t('pages.expenses.frequencySemiAnnual')}</option>
                        <option value="annual">{t('pages.expenses.frequencyAnnual')}</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="label">{t('pages.expenses.nature')}</label>
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
                    <option value="recurrent">{t('pages.expenses.recurrent')}</option>
                    <option value="non_recurrent">{t('pages.expenses.oneOff')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">{t('pages.expenses.category')}</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">{categories.length === 0 ? t('pages.expenses.noCategories') : t('pages.expenses.selectCategory')}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              {formData.recurrenceType === 'recurrent' && formData.frequency === 'monthly' && (
                <div>
                  <label className="label">{t('pages.expenses.paymentDay')}</label>
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
                  <label className="label">{t('pages.expenses.paymentMonth')}</label>
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
                  <label className="label">{t('pages.loans.date')}</label>
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
                    <label className="label">{t('pages.expenses.referenceStartDate')}</label>
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
                    <label className="label">{t('pages.expenses.recurrenceStartOptional')}</label>
                    <input
                      type="date"
                      value={formData.recurrenceStartDate}
                      onChange={(e) => setFormData({ ...formData, recurrenceStartDate: e.target.value })}
                      className="input w-full"
                    />
                    <p className="text-xs text-dark-500 mt-1">
                      {t('pages.expenses.recurrenceStartHint')}
                    </p>
                  </div>
                  <div>
                    <label className="label">{t('pages.expenses.recurrenceEndOptional')}</label>
                    <input
                      type="date"
                      value={formData.recurrenceEndDate}
                      onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })}
                      className="input w-full"
                    />
                    <p className="text-xs text-dark-500 mt-1">
                      {t('pages.expenses.recurrenceEndHint')}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">{editingExpense ? t('common.actions.edit') : t('common.actions.create')}</button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">{t('common.actions.cancel')}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {periodPayExpense && (
        <div
          className="modal-overlay"
          onClick={() => setPeriodPayExpense(null)}
          role="presentation"
        >
          <motion.div
            ref={periodPayModalRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-period-pay-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="expense-period-pay-title" className="text-xl font-bold text-white mb-2">
              {t('pages.expenses.variablePeriodPay.title')}
            </h2>
            <p className="text-sm text-dark-400 mb-1">
              <span className="text-white/90">{periodPayExpense.description}</span>
            </p>
            <p className="text-xs text-dark-500 mb-4">{t('pages.expenses.variablePeriodPay.hint')}</p>
            <label className="label" htmlFor="expense-period-amount">
              {t('pages.expenses.variablePeriodPay.amountLabel')}
            </label>
            <input
              id="expense-period-amount"
              type="number"
              step="0.01"
              min="0"
              value={periodPayAmount}
              onChange={(e) => setPeriodPayAmount(e.target.value)}
              className="input w-full mb-4"
              autoComplete="off"
            />
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="btn-secondary" onClick={() => setPeriodPayExpense(null)}>
                {t('common.actions.cancel')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  const n = parseFloat(periodPayAmount.trim().replace(',', '.'));
                  if (Number.isNaN(n) || n <= 0) {
                    toast.error(t('toast.generic.invalidAmount'));
                    return;
                  }
                  await submitExpensePaymentStatus(periodPayExpense.id, true, n);
                  setPeriodPayExpense(null);
                }}
              >
                {t('pages.expenses.variablePeriodPay.confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <FinancialHistoryModal
        key={historyExpense ? `expense-history-${historyExpense.id}` : 'expense-history-closed'}
        kind="expense"
        open={historyExpense != null}
        itemId={historyExpense?.id ?? null}
        itemTitle={historyExpense?.title ?? ''}
        onClose={() => setHistoryExpense(null)}
      />
    </div>
  );
};

export default Expenses;
