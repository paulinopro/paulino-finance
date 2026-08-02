import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { BankAccount, Income, IncomeFrequency, IncomeNature, IncomeRecurrenceType } from '../types';
import { Plus, Edit, Trash2, History, TrendingUp, Search, X, ArrowUp, ArrowDown, ArrowUpDown, CheckCircle, Circle } from 'lucide-react';
import toast from 'react-hot-toast';
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

const INCOME_FREQUENCY_KEYS: IncomeFrequency[] = [
  'daily',
  'weekly',
  'biweekly',
  'semi_monthly',
  'monthly',
  'quarterly',
  'semi_annual',
  'annual',
];

function incomeFreqToCashFlowKey(k: IncomeFrequency): string {
  const m: Record<IncomeFrequency, string> = {
    daily: 'daily',
    weekly: 'weekly',
    biweekly: 'biweekly',
    semi_monthly: 'semiMonthly',
    monthly: 'monthly',
    quarterly: 'quarterly',
    semi_annual: 'semiAnnual',
    annual: 'annual',
  };
  return m[k];
}

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

function isVariableRecurrentMonthlyIncome(item: Income): boolean {
  return (
    deriveIncomeNature(item) === 'variable' &&
    deriveIncomeRecurrence(item) === 'recurrent' &&
    incomeFrequencyFromApi(item.frequency) === 'monthly'
  );
}

type IncomeListSummary = {
  totalDop: number;
  totalUsd: number;
  totalIncome: number;
  totalPrimary: number;
  totalSecondary: number;
  primaryCurrency?: string;
  secondaryCurrency?: string;
};

const EMPTY_INCOME_SUMMARY: IncomeListSummary = {
  totalDop: 0,
  totalUsd: 0,
  totalIncome: 0,
  totalPrimary: 0,
  totalSecondary: 0,
  primaryCurrency: undefined,
  secondaryCurrency: undefined,
};

const IncomePage: React.FC = () => {
  const { t } = useTranslation();
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
    'income'
  );
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const periodReceiveModalRef = useRef<HTMLDivElement>(null);
  const [income, setIncome] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [historyIncome, setHistoryIncome] = useState<{ id: number; title: string } | null>(null);
  const [periodReceiveIncome, setPeriodReceiveIncome] = useState<Income | null>(null);
  const [periodReceiveAmount, setPeriodReceiveAmount] = useState('');
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterNature, setFilterNature] = useState('');
  const [filterRecurrence, setFilterRecurrence] = useState('');
  const [filterFrequency, setFilterFrequency] = useState('');
  const [summary, setSummary] = useState<IncomeListSummary>(EMPTY_INCOME_SUMMARY);
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
      {
        const raw = response.data.summary as Partial<IncomeListSummary> | undefined;
        setSummary({
          ...EMPTY_INCOME_SUMMARY,
          ...raw,
          totalDop: raw?.totalDop ?? 0,
          totalUsd: raw?.totalUsd ?? 0,
          totalIncome: raw?.totalIncome ?? 0,
          totalPrimary: raw?.totalPrimary ?? 0,
          totalSecondary: raw?.totalSecondary ?? 0,
        });
      }
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      toast.error(t('toast.income.loadError'));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, filterNature, filterRecurrence, filterFrequency, currentPage, itemsPerPage, t]);

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
        toast.success(t('toast.income.updated'));
      } else {
        await api.post('/income', payload);
        toast.success(t('toast.income.created'));
      }

      setShowModal(false);
      resetForm();
      fetchIncome();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.income.saveError'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('confirm.deleteIncome'))) return;
    try {
      await api.delete(`/income/${id}`);
      toast.success(t('toast.income.deleted'));
      fetchIncome();
    } catch (error: any) {
      toast.error(t('toast.income.deleteError'));
    }
  };

  const submitIncomeReceiptStatus = async (id: number, nextReceived: boolean, actualAmount?: number) => {
    try {
      const body: { isReceived: boolean; actualAmount?: number } = { isReceived: nextReceived };
      if (nextReceived && actualAmount != null) {
        body.actualAmount = actualAmount;
      }
      await api.patch(`/income/${id}/receipt-status`, body);
      toast.success(t('toast.generic.statusUpdated'));
      fetchIncome();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.generic.statusUpdateFailed'));
    }
  };

  const handleToggleReceived = async (item: Income) => {
    const nextReceived = !item.isReceived;
    if (nextReceived && isVariableRecurrentMonthlyIncome(item)) {
      setPeriodReceiveIncome(item);
      setPeriodReceiveAmount(String(item.amount));
      return;
    }
    await submitIncomeReceiptStatus(item.id, nextReceived);
  };

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      currency: defaultTransactionCurrency,
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
  useEscapeKey(!!periodReceiveIncome, () => setPeriodReceiveIncome(null));
  useModalFocusTrap(modalPanelRef, showModal);
  useModalFocusTrap(periodReceiveModalRef, !!periodReceiveIncome);

  const accountsForIncome = useMemo(() => {
    const c = formData.currency;
    return bankAccounts.filter((a) =>
      a.isActive && bankAccountSupportsLedgerCurrency(a, c, primaryCurrency, secondaryCurrency)
    );
  }, [bankAccounts, formData.currency, primaryCurrency, secondaryCurrency]);

  const formatIncomeFrequencyCell = useCallback(
    (f?: string | null) => {
      if (!f) return t('common.emptyDash');
      const key = incomeFrequencyFromApi(f);
      if (!key) return t('common.emptyDash');
      return t(`pages.cashFlow.freq.${incomeFreqToCashFlowKey(key as IncomeFrequency)}`);
    },
    [t]
  );

  const labelIncomeTipo = useCallback(
    (item: Income) => t(`pages.income.${deriveIncomeNature(item) === 'fixed' ? 'fixed' : 'variable'}`),
    [t]
  );

  const labelIncomeNaturaleza = useCallback(
    (item: Income) =>
      deriveIncomeRecurrence(item) === 'recurrent' ? t('pages.income.recurrent') : t('pages.income.oneOff'),
    [t]
  );

  const formatIncomeScheduleCell = useCallback(
    (item: Income) => {
      if (deriveIncomeRecurrence(item) === 'non_recurrent') {
        return item.date ? formatDateDdMmYyyy(item.date) : t('common.emptyDash');
      }
      const fq = incomeFrequencyFromApi(item.frequency);
      if (fq === 'monthly') {
        if (item.receiptDay == null) return t('common.emptyDash');
        const today = new Date();
        return formatRecurringDayForPeriod(item.receiptDay, today.getFullYear(), today.getMonth() + 1);
      }
      if (fq === 'semi_monthly') {
        return t('pages.income.scheduleSemiMonthly');
      }
      if (fq === 'annual') {
        return item.date
          ? t('pages.income.scheduleAnnualOnDate', { date: formatDateDdMmYyyy(item.date) })
          : t('common.emptyDash');
      }
      if (item.date) {
        return t('pages.income.scheduleStartOnDate', { date: formatDateDdMmYyyy(item.date) });
      }
      return t('common.emptyDash');
    },
    [t]
  );

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.income.title')}
        subtitle={t('pages.income.subtitle')}
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
              <span>{t('pages.income.addIncome')}</span>
            </button>
          </div>
        }
      />

      {/* Summary */}
      {summaryBarVisible && (
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">
                {t('pages.income.incomeInCurrency', { currency: summary.primaryCurrency ?? primaryCurrency })}
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
                {t('pages.income.incomeInCurrency', { currency: summary.secondaryCurrency ?? secondaryCurrency })}
              </p>
              <p className="text-2xl font-bold text-white">
                {fc(
                  summary.totalSecondary ?? 0,
                  (summary.secondaryCurrency ?? secondaryCurrency) as string
                )}
              </p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.income.totalIncomeCount')}</p>
              <p className="text-2xl font-bold text-white">{summary.totalIncome}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <label className="text-xs text-dark-400 block mb-1">{t('common.actions.search')}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
              <input
                type="text"
                placeholder={t('pages.income.descriptionPlaceholder')}
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
            <label className="text-xs text-dark-400 block mb-1">{t('pages.income.type')}</label>
            <select
              value={filterNature}
              onChange={(e) => setFilterNature(e.target.value)}
              className="input w-full"
            >
              <option value="">{t('pages.income.all')}</option>
              <option value="fixed">{t('pages.income.fixed')}</option>
              <option value="variable">{t('pages.income.variable')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-dark-400 block mb-1">{t('pages.income.nature')}</label>
            <select
              value={filterRecurrence}
              onChange={(e) => setFilterRecurrence(e.target.value)}
              className="input w-full"
            >
              <option value="">{t('pages.income.all')}</option>
              <option value="recurrent">{t('pages.income.recurrent')}</option>
              <option value="non_recurrent">{t('pages.income.oneOff')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-dark-400 block mb-1">{t('pages.income.frequency')}</label>
            <select
              value={filterFrequency}
              onChange={(e) => setFilterFrequency(e.target.value)}
              disabled={filterRecurrence === 'non_recurrent'}
              className="input w-full disabled:opacity-50"
              title={filterRecurrence === 'non_recurrent' ? t('pages.income.filterUniqueTooltip') : undefined}
            >
              <option value="">{t('pages.income.all')}</option>
              {INCOME_FREQUENCY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {t(`pages.cashFlow.freq.${incomeFreqToCashFlowKey(k)}`)}
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
              {t('pages.income.clearFilters')}
            </button>
          </div>
        )}
      </div>

      {income.length === 0 ? (
        <div className="card text-center py-12">
          <TrendingUp className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">{t('pages.income.emptyState')}</p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary"
          >
            {t('pages.income.addFirstIncome')}
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
                        <span>{t('pages.income.description')}</span>
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
                        <span>{t('pages.income.amount')}</span>
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
                        <span>{t('pages.income.type')}</span>
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
                        <span>{t('pages.income.frequency')}</span>
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
                        <span>{t('pages.income.nature')}</span>
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
                        <span>{t('pages.income.colDateDay')}</span>
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
                        <span>{t('pages.income.statusLabel')}</span>
                        {sortBy === 'status' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                      </div>
                    </th>
                    <th className="text-right py-3 px-4 text-dark-400 font-medium">{t('common.actions.actions')}</th>
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
                        aValue = deriveIncomeNature(a);
                        bValue = deriveIncomeNature(b);
                        break;
                      case 'frequency':
                        aValue = incomeFrequencyFromApi(a.frequency) || '';
                        bValue = incomeFrequencyFromApi(b.frequency) || '';
                        break;
                      case 'naturaleza':
                        aValue = deriveIncomeRecurrence(a);
                        bValue = deriveIncomeRecurrence(b);
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
                      <td data-label={t('pages.income.description')} data-stack="hero" className="py-3 px-4 text-white">
                        {item.description}
                      </td>
                      <td data-label={t('pages.income.amount')} className="py-3 px-4">
                        <span className="table-stack-value">
                          {fc(item.amount, item.currency)}
                        </span>
                      </td>
                      <td data-label={t('pages.income.type')} className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{labelIncomeTipo(item)}</span>
                      </td>
                      <td data-label={t('pages.income.frequency')} className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">
                          {deriveIncomeRecurrence(item) === 'recurrent'
                            ? formatIncomeFrequencyCell(item.frequency)
                            : t('common.emptyDash')}
                        </span>
                      </td>
                      <td data-label={t('pages.income.nature')} className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{labelIncomeNaturaleza(item)}</span>
                      </td>
                      <td data-label={t('pages.income.colDateDay')} className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{formatIncomeScheduleCell(item)}</span>
                      </td>
                      <td data-label={t('pages.income.statusLabel')} className="py-3 px-4">
                        <span className="table-stack-value">
                          <button
                            type="button"
                            onClick={() => handleToggleReceived(item)}
                            className="flex items-center gap-2"
                          >
                            {item.isReceived ? (
                              <CheckCircle className="text-green-400" size={20} />
                            ) : (
                              <Circle className="text-dark-400" size={20} />
                            )}
                            <span className={item.isReceived ? 'text-green-400' : 'text-dark-300'}>
                              {item.isReceived ? t('pages.calendarStatuses.RECEIVED') : t('pages.calendarStatuses.PENDING')}
                            </span>
                          </button>
                        </span>
                      </td>
                      <td data-label={t('common.actions.actions')} className="py-3 px-4">
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
                            <button
                              type="button"
                              onClick={() => setHistoryIncome({ id: item.id, title: item.description })}
                              className="p-2 text-dark-300 hover:text-amber-300"
                              title={t('common.actions.history')}
                              aria-label={t('pages.financialItemHistory.historyAria')}
                            >
                              <History size={18} />
                            </button>
                            <button type="button" onClick={() => handleDelete(item.id)} className="p-2 text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
                            <EntityActiveToggle
                              resourcePath="income"
                              entityId={item.id}
                              isActive={item.isActive}
                              entityLabel={item.description}
                              onChanged={fetchIncome}
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
            itemLabel={t('pages.income.itemsLabel')}
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
            aria-labelledby="income-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="income-modal-title" className="text-2xl font-bold text-white mb-6">
              {editingIncome ? t('pages.income.editIncome') : t('pages.income.newIncome')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="label">{t('pages.income.description')}</label><input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input w-full" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">{t('pages.income.amount')}</label><input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="input w-full" required /></div>
                <div>
                  <label className="label">{t('pages.income.currency')}</label>
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
                <label className="label">{t('pages.income.destinationAccountOptional')}</label>
                <select
                  value={formData.bankAccountId}
                  onChange={(e) => setFormData({ ...formData, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">{t('pages.income.unlinkedNoBalance')}</option>
                  {accountsForIncome.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-dark-500 mt-1">{t('pages.income.destinationAccountHint')}</p>
              </div>
              <div>
                <label className="label">{t('pages.income.statusLabel')}</label>
                <select
                  value={formData.isReceived ? 'received' : 'pending'}
                  onChange={(e) =>
                    setFormData({ ...formData, isReceived: e.target.value === 'received' })
                  }
                  className="input w-full"
                >
                  <option value="pending">{t('pages.calendarStatuses.PENDING')}</option>
                  <option value="received">{t('pages.calendarStatuses.RECEIVED')}</option>
                </select>
                <p className="text-xs text-dark-500 mt-1">{t('pages.income.statusSelectHint')}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">{t('pages.income.type')}</label>
                  <select
                    value={formData.nature}
                    onChange={(e) => {
                      const v = e.target.value as IncomeNature;
                      setFormData((prev) => ({ ...prev, nature: v }));
                    }}
                    className="input w-full"
                  >
                    <option value="fixed">{t('pages.income.fixed')}</option>
                    <option value="variable">{t('pages.income.variable')}</option>
                  </select>
                </div>
                <div>
                  <label className="label">{t('pages.income.frequency')}</label>
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
                      <option value="">{t('common.emptyDash')}</option>
                    ) : (
                      <>
                        {INCOME_FREQUENCY_KEYS.map((fk) => (
                          <option key={fk} value={fk}>
                            {t(`pages.cashFlow.freq.${incomeFreqToCashFlowKey(fk)}`)}
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="label">{t('pages.income.nature')}</label>
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
                    <option value="recurrent">{t('pages.income.recurrent')}</option>
                    <option value="non_recurrent">{t('pages.income.oneOff')}</option>
                  </select>
                </div>
              </div>
              {formData.recurrenceType === 'recurrent' && (
                <>
                  {formData.frequency === 'monthly' && (
                    <div>
                      <label className="label">{t('pages.income.receiptDay')}</label>
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
                        <label className="label">{t('pages.income.referenceStartDate')}</label>
                        <input
                          type="date"
                          value={formData.date}
                          onChange={(e) => setFormData({ ...formData, date: e.target.value, receiptDay: '' })}
                          className="input w-full"
                          required
                        />
                        <p className="text-xs text-dark-400 mt-1">
                          {formData.frequency === 'daily' && t('pages.income.refHintDaily')}
                          {formData.frequency === 'weekly' && t('pages.income.refHintWeekly')}
                          {formData.frequency === 'biweekly' && t('pages.income.refHintBiweekly')}
                          {formData.frequency === 'quarterly' && t('pages.income.refHintQuarterly')}
                          {formData.frequency === 'semi_annual' && t('pages.income.refHintSemiAnnual')}
                          {formData.frequency === 'annual' && t('pages.income.refHintAnnual')}
                        </p>
                      </div>
                    )}
                  {formData.frequency === 'semi_monthly' && (
                    <div className="rounded-lg border border-dark-600/80 bg-dark-800/40 px-3 py-2 text-sm text-dark-300">
                      <p>{t('pages.income.semiMonthlyBlurb')}</p>
                      <p className="mt-2 text-xs text-dark-500">{t('pages.income.semiMonthlyNarrow')}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-dark-600/50 mt-2">
                    <div>
                      <label className="label">{t('pages.income.recurrenceStartOptional')}</label>
                      <input
                        type="date"
                        value={formData.recurrenceStartDate}
                        onChange={(e) => setFormData({ ...formData, recurrenceStartDate: e.target.value })}
                        className="input w-full"
                      />
                      <p className="text-xs text-dark-500 mt-1">{t('pages.income.recurrenceStartHint')}</p>
                    </div>
                    <div>
                      <label className="label">{t('pages.income.recurrenceEndOptional')}</label>
                      <input
                        type="date"
                        value={formData.recurrenceEndDate}
                        onChange={(e) => setFormData({ ...formData, recurrenceEndDate: e.target.value })}
                        className="input w-full"
                      />
                      <p className="text-xs text-dark-500 mt-1">{t('pages.income.recurrenceEndHint')}</p>
                    </div>
                  </div>
                </>
              )}
              {formData.recurrenceType === 'non_recurrent' && (
                <div>
                  <label className="label">{t('pages.income.oneOffDate')}</label>
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
                <button type="submit" className="btn-primary flex-1">
                  {editingIncome ? t('pages.income.update') : t('pages.income.create')}
                </button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">{t('common.actions.cancel')}</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {periodReceiveIncome && (
        <div
          className="modal-overlay"
          onClick={() => setPeriodReceiveIncome(null)}
          role="presentation"
        >
          <motion.div
            ref={periodReceiveModalRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="income-period-receive-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="income-period-receive-title" className="text-xl font-bold text-white mb-2">
              {t('pages.income.variablePeriodPay.title')}
            </h2>
            <p className="text-sm text-dark-400 mb-1">
              <span className="text-white/90">{periodReceiveIncome.description}</span>
            </p>
            <p className="text-xs text-dark-500 mb-4">{t('pages.income.variablePeriodPay.hint')}</p>
            <label className="label" htmlFor="income-period-amount">
              {t('pages.income.variablePeriodPay.amountLabel')}
            </label>
            <input
              id="income-period-amount"
              type="number"
              step="0.01"
              min="0"
              value={periodReceiveAmount}
              onChange={(e) => setPeriodReceiveAmount(e.target.value)}
              className="input w-full mb-4"
              autoComplete="off"
            />
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="btn-secondary" onClick={() => setPeriodReceiveIncome(null)}>
                {t('common.actions.cancel')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  const n = parseFloat(periodReceiveAmount.trim().replace(',', '.'));
                  if (Number.isNaN(n) || n <= 0) {
                    toast.error(t('toast.generic.invalidAmount'));
                    return;
                  }
                  await submitIncomeReceiptStatus(periodReceiveIncome.id, true, n);
                  setPeriodReceiveIncome(null);
                }}
              >
                {t('pages.income.variablePeriodPay.confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <FinancialHistoryModal
        key={historyIncome ? `income-history-${historyIncome.id}` : 'income-history-closed'}
        kind="income"
        open={historyIncome != null}
        itemId={historyIncome?.id ?? null}
        itemTitle={historyIncome?.title ?? ''}
        onClose={() => setHistoryIncome(null)}
      />
    </div>
  );
};

export default IncomePage;
