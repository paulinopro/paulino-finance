import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import toast from 'react-hot-toast';
import {
  Building2,
  CalendarRange,
  CreditCard,
  Download,
  Filter,
  Landmark,
  LayoutGrid,
  Receipt,
} from 'lucide-react';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';
import { getDateRangeForReportPeriod, type ReportPeriodKey } from '../utils/reportPeriodRange';

type ReportTypeId = 'expenses' | 'loans' | 'cards' | 'accounts' | 'comprehensive';

const REPORT_PERIOD_KEYS: ReportPeriodKey[] = [
  'today',
  'yesterday',
  'this_week',
  'this_month',
  'last_month',
  'last_7_days',
  'last_30_days',
  'this_year',
  'custom',
];

/** Bordes y estilo de valor para tarjetas del resumen (claves alineadas con la API). */
const SUMMARY_META_STYLE: Record<string, { border: string; valueClass?: string }> = {
  total: { border: 'border-l-slate-500' },
  paid: { border: 'border-l-emerald-500' },
  pending: { border: 'border-l-amber-500' },
  active: { border: 'border-l-sky-500' },
  totalPaid: { border: 'border-l-emerald-500' },
  totalPending: { border: 'border-l-amber-500' },
  totalActive: { border: 'border-l-sky-500' },
  totalDebt: { border: 'border-l-rose-500' },
  totalLimit: { border: 'border-l-violet-500' },
  totalBalance: { border: 'border-l-primary-500' },
  totalBalanceDop: { border: 'border-l-emerald-500' },
  totalBalanceUsd: { border: 'border-l-blue-500' },
  savings: { border: 'border-l-teal-500' },
  checking: { border: 'border-l-cyan-500' },
  totalCardDebt: { border: 'border-l-rose-500', valueClass: 'text-rose-400' },
  totalLoanDebt: { border: 'border-l-rose-500', valueClass: 'text-rose-400' },
  netWorth: { border: 'border-l-emerald-500', valueClass: 'text-emerald-400' },
};

const SUMMARY_KEY_PRIORITY = [
  'totalBalance',
  'netWorth',
  'totalCardDebt',
  'totalLoanDebt',
  'total',
  'paid',
  'pending',
  'active',
  'totalPaid',
  'totalPending',
  'totalActive',
  'totalDebt',
  'totalLimit',
  'totalBalanceDop',
  'totalBalanceUsd',
  'savings',
  'checking',
];

function sortSummaryKeys(keys: string[]): string[] {
  const order = new Map(SUMMARY_KEY_PRIORITY.map((k, i) => [k, i]));
  return [...keys].sort((a, b) => {
    const oa = order.get(a) ?? 999;
    const ob = order.get(b) ?? 999;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  });
}

/** Claves del resumen que son conteos (no montos en DOP). */
const SUMMARY_COUNT_KEYS = new Set([
  'total',
  'paid',
  'pending',
  'active',
  'savings',
  'checking',
]);

const Reports: React.FC = () => {
  const { t } = useTranslation();
  const { formatCurrency: fc, formatInt: fi, formatYmdShortLocalized, primaryCurrency, secondaryCurrency } =
    useIntlFormatting();

  const formatSummaryMetric = useCallback(
    (key: string, value: unknown): string => {
      if (typeof value !== 'number' || Number.isNaN(value)) return String(value ?? '');
      if (SUMMARY_COUNT_KEYS.has(key)) return fi(value);
      if (key === 'totalBalanceUsd') return fc(value, secondaryCurrency);
      return fc(value, primaryCurrency);
    },
    [fc, fi, primaryCurrency, secondaryCurrency]
  );

  const reportTypes = useMemo(
    () =>
      [
        {
          id: 'expenses' as const,
          title: t('reports.types.expenses.title'),
          description: t('reports.types.expenses.description'),
          icon: Receipt,
          accent: 'text-amber-400',
          selectedRing: 'ring-2 ring-amber-500/50 border-amber-500/40 bg-amber-500/5',
        },
        {
          id: 'loans' as const,
          title: t('reports.types.loans.title'),
          description: t('reports.types.loans.description'),
          icon: Landmark,
          accent: 'text-sky-400',
          selectedRing: 'ring-2 ring-sky-500/50 border-sky-500/40 bg-sky-500/5',
        },
        {
          id: 'cards' as const,
          title: t('reports.types.cards.title'),
          description: t('reports.types.cards.description'),
          icon: CreditCard,
          accent: 'text-violet-400',
          selectedRing: 'ring-2 ring-violet-500/50 border-violet-500/40 bg-violet-500/5',
        },
        {
          id: 'accounts' as const,
          title: t('reports.types.accounts.title'),
          description: t('reports.types.accounts.description'),
          icon: Building2,
          accent: 'text-emerald-400',
          selectedRing: 'ring-2 ring-emerald-500/50 border-emerald-500/40 bg-emerald-500/5',
        },
        {
          id: 'comprehensive' as const,
          title: t('reports.types.comprehensive.title'),
          description: t('reports.types.comprehensive.description'),
          icon: LayoutGrid,
          accent: 'text-primary-400',
          selectedRing: 'ring-2 ring-primary-500/50 border-primary-500/40 bg-primary-500/5',
        },
      ] as const,
    [t]
  );

  const periodOptions = useMemo(
    () =>
      REPORT_PERIOD_KEYS.map((value) => ({
        value,
        label: t(`reports.periodPreset.${value}`),
      })),
    [t]
  );

  const getSummaryMeta = useCallback(
    (key: string) => {
      const style = SUMMARY_META_STYLE[key] ?? { border: 'border-l-slate-500' };
      return {
        ...style,
        label: t(`reports.summary.${key}`, { defaultValue: key }),
      };
    },
    [t]
  );

  const loanStatusLabel = useCallback(
    (status: string) =>
      status === 'PAID'
        ? t('reports.loanStatus.paid')
        : status === 'ACTIVE'
          ? t('reports.loanStatus.active')
          : t('reports.loanStatus.delinquent'),
    [t]
  );

  const { pageSize: reportTablePageSize, setPageSize: setReportTablePageSize, pageSizeOptions: reportTablePageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:reports', TABLE_PAGE_SIZE);
  const [reportType, setReportType] = useState<ReportTypeId>('expenses');
  const [periodKey, setPeriodKey] = useState<ReportPeriodKey>('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [status, setStatus] = useState<'all' | 'paid' | 'pending'>('all');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [reportDetailPage, setReportDetailPage] = useState(1);
  const [compPages, setCompPages] = useState({ expenses: 1, loans: 1, cards: 1, accounts: 1 });

  const detailRows = useMemo(() => {
    if (!reportData) return [];
    if (reportType === 'expenses') return reportData.expenses || [];
    if (reportType === 'loans') return reportData.loans || [];
    if (reportType === 'cards') return reportData.cards || [];
    if (reportType === 'accounts') return reportData.accounts || [];
    return [];
  }, [reportData, reportType]);

  const detailTotalPages = Math.max(1, Math.ceil(detailRows.length / reportTablePageSize));
  const detailPageClamped = Math.min(reportDetailPage, detailTotalPages);
  const detailSlice = useMemo(() => {
    const start = (detailPageClamped - 1) * reportTablePageSize;
    return detailRows.slice(start, start + reportTablePageSize);
  }, [detailRows, detailPageClamped, reportTablePageSize]);

  useEffect(() => {
    setReportDetailPage(1);
  }, [reportType, reportData]);

  useEffect(() => {
    setReportDetailPage((p) => Math.min(p, detailTotalPages));
  }, [detailTotalPages]);

  useEffect(() => {
    setCompPages({ expenses: 1, loans: 1, cards: 1, accounts: 1 });
  }, [reportType, reportData]);

  useEffect(() => {
    setReportDetailPage(1);
    setCompPages({ expenses: 1, loans: 1, cards: 1, accounts: 1 });
  }, [reportTablePageSize]);

  const compData = reportType === 'comprehensive' && reportData?.data ? reportData.data : null;
  const compExpenseRows = useMemo(() => compData?.expenses ?? [], [compData]);
  const compLoanRows = useMemo(() => compData?.loans ?? [], [compData]);
  const compCardRows = useMemo(() => compData?.cards ?? [], [compData]);
  const compAccountRows = useMemo(() => compData?.accounts ?? [], [compData]);

  const compExpenseTotalPages = Math.max(1, Math.ceil(compExpenseRows.length / reportTablePageSize));
  const compLoanTotalPages = Math.max(1, Math.ceil(compLoanRows.length / reportTablePageSize));
  const compCardTotalPages = Math.max(1, Math.ceil(compCardRows.length / reportTablePageSize));
  const compAccountTotalPages = Math.max(1, Math.ceil(compAccountRows.length / reportTablePageSize));

  const compExpensePageClamped = Math.min(compPages.expenses, compExpenseTotalPages);
  const compLoanPageClamped = Math.min(compPages.loans, compLoanTotalPages);
  const compCardPageClamped = Math.min(compPages.cards, compCardTotalPages);
  const compAccountPageClamped = Math.min(compPages.accounts, compAccountTotalPages);

  const compExpenseSlice = useMemo(
    () =>
      compExpenseRows.slice(
        (compExpensePageClamped - 1) * reportTablePageSize,
        compExpensePageClamped * reportTablePageSize
      ),
    [compExpenseRows, compExpensePageClamped, reportTablePageSize]
  );
  const compLoanSlice = useMemo(
    () =>
      compLoanRows.slice(
        (compLoanPageClamped - 1) * reportTablePageSize,
        compLoanPageClamped * reportTablePageSize
      ),
    [compLoanRows, compLoanPageClamped, reportTablePageSize]
  );
  const compCardSlice = useMemo(
    () =>
      compCardRows.slice(
        (compCardPageClamped - 1) * reportTablePageSize,
        compCardPageClamped * reportTablePageSize
      ),
    [compCardRows, compCardPageClamped, reportTablePageSize]
  );
  const compAccountSlice = useMemo(
    () =>
      compAccountRows.slice(
        (compAccountPageClamped - 1) * reportTablePageSize,
        compAccountPageClamped * reportTablePageSize
      ),
    [compAccountRows, compAccountPageClamped, reportTablePageSize]
  );

  const { fromDate, toDate } = useMemo(() => {
    if (periodKey === 'custom') {
      return { fromDate: customFrom, toDate: customTo };
    }
    const { from, to } = getDateRangeForReportPeriod(periodKey);
    return { fromDate: from, toDate: to };
  }, [periodKey, customFrom, customTo]);

  const validateDatesForRequest = useCallback((): boolean => {
    if (periodKey === 'custom') {
      if (!customFrom || !customTo) {
        toast.error(t('toast.reports.needDateRange'));
        return false;
      }
      if (customFrom > customTo) {
        toast.error(t('toast.reports.dateRangeInvalid'));
        return false;
      }
    }
    return true;
  }, [periodKey, customFrom, customTo, t]);

  const onPeriodChange = (next: ReportPeriodKey) => {
    setPeriodKey(next);
    if (next === 'custom' && !customFrom && !customTo) {
      const { from, to } = getDateRangeForReportPeriod('this_month');
      setCustomFrom(from);
      setCustomTo(to);
    }
  };

  const periodLabel = useMemo(() => {
    if (!fromDate || !toDate) return '';
    const a = formatYmdShortLocalized(fromDate);
    const b = formatYmdShortLocalized(toDate);
    return a === b ? a : `${a} — ${b}`;
  }, [fromDate, toDate, formatYmdShortLocalized]);

  const selectedTypeConfig = useMemo(
    () => reportTypes.find((r) => r.id === reportType) ?? reportTypes[0],
    [reportType, reportTypes]
  );

  const reportResultTitle =
    reportType === 'comprehensive'
      ? t('reports.reportResultTitle.comprehensive')
      : t('reports.reportResultTitle.typed', { type: selectedTypeConfig.title });

  const handleGenerateReport = async (exportPDF: boolean = false) => {
    if (!validateDatesForRequest()) return;
    setLoading(true);
    try {
      const params: any = {};
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (status !== 'all' && reportType === 'expenses') {
        params.status = status;
      }
      if (status !== 'all' && reportType === 'loans') {
        params.status = status === 'paid' ? 'paid' : 'active';
      }
      if (exportPDF) {
        params.format = 'pdf';
      }

      let endpoint = '';
      switch (reportType) {
        case 'expenses':
          endpoint = '/reports/expenses';
          break;
        case 'loans':
          endpoint = '/reports/loans';
          break;
        case 'cards':
          endpoint = '/reports/cards';
          break;
        case 'accounts':
          endpoint = '/reports/accounts';
          break;
        case 'comprehensive':
          endpoint = '/reports/comprehensive';
          break;
      }

      if (exportPDF) {
        // For PDF, download directly
        const response = await api.get(endpoint, {
          params,
          responseType: 'blob',
        });

        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${t('reports.pdfFilenamePrefix')}-${t(`reports.pdfSlug.${reportType}`)}-${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast.success(t('toast.reports.pdfDownloaded'));
      } else {
        // For JSON, show data
        const response = await api.get(endpoint, { params });
        setReportData(response.data);
        toast.success(t('toast.reports.generated'));
      }
    } catch (error: any) {
      toast.error(t('toast.reports.generateError'));
      console.error('Report error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={t('pages.reports.title')}
        subtitle={t('pages.reports.subtitle')}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-6 lg:grid-cols-12"
      >
        <div className="lg:col-span-7 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            {t('reports.ui.reportTypeSection')}
          </h2>
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
            {reportTypes.map((rt) => {
              const Icon = rt.icon;
              const active = reportType === rt.id;
              return (
                <button
                  key={rt.id}
                  type="button"
                  onClick={() => {
                    setReportType(rt.id);
                    setReportData(null);
                  }}
                  className={`relative flex text-left gap-3 rounded-xl border p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 ${active
                    ? rt.selectedRing
                    : 'border-dark-600/80 bg-dark-800/40 hover:border-dark-500 hover:bg-dark-800/60'
                    }`}
                >
                  <div
                    className={`shrink-0 w-10 h-10 rounded-lg flex items-center justify-center bg-dark-700/80 ${rt.accent}`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm">{rt.title}</p>
                    <p className="text-xs text-dark-400 leading-snug mt-0.5">{rt.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-dark-600/60 bg-dark-800/30 p-5 space-y-5 h-full">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
              {t('reports.ui.filtersSection')}
            </h2>
            <div>
              <label className="label">{t('reports.ui.periodLabel')}</label>
              <select
                value={periodKey}
                onChange={(e) => onPeriodChange(e.target.value as ReportPeriodKey)}
                className="input w-full"
              >
                {periodOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {periodKey === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('reports.ui.dateFrom')}</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label">{t('reports.ui.dateTo')}</label>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="input w-full"
                  />
                </div>
              </div>
            )}

            {(reportType === 'expenses' || reportType === 'loans') && (
              <div>
                <label className="label">{t('reports.ui.statusLabel')}</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'all' | 'paid' | 'pending')}
                  className="input w-full"
                >
                  <option value="all">{t('reports.statusFilter.all')}</option>
                  <option value="paid">{t('reports.statusFilter.paid')}</option>
                  <option value="pending">
                    {reportType === 'expenses'
                      ? t('reports.ui.statusPendingExpenses')
                      : t('reports.ui.statusPendingLoans')}
                  </option>
                </select>
              </div>
            )}

            <div className="flex flex-col gap-3 pt-1">
              <button
                onClick={() => handleGenerateReport(false)}
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
                    <span>{t('reports.ui.loading')}</span>
                  </>
                ) : (
                  <>
                    <Filter size={20} />
                    <span>{t('reports.actions.generate')}</span>
                  </>
                )}
              </button>
              <button
                onClick={() => handleGenerateReport(true)}
                disabled={loading}
                className="btn-secondary w-full flex items-center justify-center gap-2"
              >
                <Download size={20} />
                <span>{t('reports.actions.exportPdf')}</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Resultados */}
      {reportData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card overflow-hidden border-t-4 border-t-primary-500/35 shadow-lg shadow-dark-900/20"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-6 gap-y-2">
            <div className="min-w-[min(100%,12rem)]">
              <p className="text-xs font-medium uppercase tracking-wider text-primary-400/90 mb-1">
                {t('reports.ui.resultSection')}
              </p>
              <h2 className="text-xl sm:text-2xl font-bold text-white break-words">{reportResultTitle}</h2>
              {periodLabel && (
                <p className="mt-2 flex items-start gap-2 text-sm text-dark-300">
                  <CalendarRange className="w-4 h-4 shrink-0 text-primary-400/80 mt-0.5" />
                  <span>{t('reports.ui.periodLine', { range: periodLabel })}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleGenerateReport(true)}
              className="btn-secondary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto"
            >
              <Download size={18} />
              <span>{t('reports.actions.exportPdf')}</span>
            </button>
          </div>

          {reportData.summary && reportType !== 'comprehensive' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
              {sortSummaryKeys(Object.keys(reportData.summary)).map((key) => {
                const value = (reportData.summary as Record<string, unknown>)[key];
                const meta = getSummaryMeta(key);
                return (
                  <div
                    key={key}
                    className={`rounded-xl border border-dark-600/50 bg-dark-800/40 pl-4 pr-3 py-3 border-l-4 ${meta.border}`}
                  >
                    <p className="text-dark-400 text-xs font-medium mb-1">{meta.label}</p>
                    <p
                      className={`font-bold text-lg tabular-nums ${meta.valueClass ?? 'text-white'
                        }`}
                    >
                      {formatSummaryMetric(key, value)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="table-responsive table-stack -mx-1 px-1 sm:mx-0 sm:px-0">
            {reportType === 'expenses' && reportData.expenses && detailRows.length === 0 && (
              <p className="text-center text-dark-400 py-10 rounded-xl border border-dashed border-dark-600/60">
                {t('reports.tables.expenses.emptyPeriod')}
              </p>
            )}

            {reportType === 'expenses' && reportData.expenses && detailRows.length > 0 && (
              <div className="rounded-xl border border-dark-600/50 overflow-hidden bg-dark-900/15 mb-8">
                <table className="report-data-table">
                  <thead>
                    <tr>
                      <th>{t('reports.tables.common.description')}</th>
                      <th>{t('reports.tables.common.amount')}</th>
                      <th>{t('reports.tables.common.category')}</th>
                      <th>{t('reports.tables.common.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSlice.map((expense: any) => (
                      <tr key={expense.id} className="max-md:border-0">
                        <td
                          data-label={t('reports.tables.common.description')}
                          data-stack="hero"
                          className="py-3 px-4 text-white"
                        >
                          {expense.description}
                        </td>
                        <td data-label={t('reports.tables.common.amount')} className="py-3 px-4">
                          <span className="table-stack-value">
                            {fc(expense.amount, expense.currency || primaryCurrency)}
                          </span>
                        </td>
                        <td data-label={t('reports.tables.common.category')} className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">
                            {expense.category || t('reports.tables.common.na')}
                          </span>
                        </td>
                        <td data-label={t('reports.tables.common.status')} className="py-3 px-4">
                          <span className="table-stack-value">
                            <span
                              className={`px-2 py-1 rounded text-xs ${expense.isPaid
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                                }`}
                            >
                              {expense.isPaid
                                ? t('reports.expenseStatus.paid')
                                : t('reports.expenseStatus.pending')}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'loans' && reportData.loans && detailRows.length === 0 && (
              <p className="text-center text-dark-400 py-10 rounded-xl border border-dashed border-dark-600/60">
                {t('reports.tables.loans.emptyPeriod')}
              </p>
            )}

            {reportType === 'loans' && reportData.loans && detailRows.length > 0 && (
              <div className="rounded-xl border border-dark-600/50 overflow-hidden bg-dark-900/15">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-700">
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">
                        {t('reports.tables.common.loan')}
                      </th>
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">
                        {t('reports.tables.common.bank')}
                      </th>
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">
                        {t('reports.tables.common.totalAmount')}
                      </th>
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">
                        {t('reports.tables.common.progress')}
                      </th>
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">
                        {t('reports.tables.common.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSlice.map((loan: any) => (
                      <tr key={loan.id} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                        <td data-label={t('reports.tables.common.loan')} className="py-3 px-4">
                          <span className="table-stack-value">{loan.loanName}</span>
                        </td>
                        <td data-label={t('reports.tables.common.bank')} className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">
                            {loan.bankName || t('reports.tables.common.na')}
                          </span>
                        </td>
                        <td data-label={t('reports.tables.common.totalAmount')} className="py-3 px-4">
                          <span className="table-stack-value">
                            {fc(loan.totalAmount, loan.currency)}
                          </span>
                        </td>
                        <td data-label={t('reports.tables.common.progress')} className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">{loan.progress?.toFixed(1) || 0}%</span>
                        </td>
                        <td data-label={t('reports.tables.common.status')} className="py-3 px-4">
                          <span className="table-stack-value">
                            <span
                              className={`px-2 py-1 rounded text-xs ${loan.status === 'PAID'
                                ? 'bg-green-500/20 text-green-400'
                                : loan.status === 'ACTIVE'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-red-500/20 text-red-400'
                                }`}
                            >
                              {loanStatusLabel(loan.status)}
                            </span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'cards' && reportData.cards && detailRows.length === 0 && (
              <p className="text-center text-dark-400 py-10 rounded-xl border border-dashed border-dark-600/60">
                {t('reports.tables.cards.empty')}
              </p>
            )}

            {reportType === 'cards' && reportData.cards && detailRows.length > 0 && (
              <div className="rounded-xl border border-dark-600/50 overflow-hidden bg-dark-900/15">
                <table className="report-data-table report-data-table--card-currency">
                  <thead>
                    <tr>
                      <th>{t('reports.tables.common.card')}</th>
                      <th>{t('reports.tables.common.bank')}</th>
                      <th>{t('reports.tables.common.limit')}</th>
                      <th>{t('reports.tables.common.debt')}</th>
                      <th>{t('reports.tables.common.available')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSlice.map((card: any) => (
                      <tr key={card.id} className="max-md:border-0">
                        <td data-label={t('reports.tables.common.card')} className="py-3 px-4">
                          <span className="table-stack-value">{card.cardName}</span>
                        </td>
                        <td data-label={t('reports.tables.common.bank')} className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">{card.bankName}</span>
                        </td>
                        <td data-label={t('reports.tables.common.limit')} className="py-3 px-4">
                          <span className="table-stack-value">
                            {card.currencyType === 'DOP' && fc(card.creditLimitDop, primaryCurrency)}
                            {card.currencyType === 'USD' && fc(card.creditLimitUsd, secondaryCurrency)}
                            {card.currencyType === 'DUAL' && `${fc(card.creditLimitDop, primaryCurrency)}\u00A0·\u00A0${fc(card.creditLimitUsd, secondaryCurrency)}`}
                          </span>
                        </td>
                        <td data-label={t('reports.tables.common.debt')} className="py-3 px-4">
                          <span className="table-stack-value text-red-400">
                            {card.currencyType === 'DOP' && fc(card.currentDebtDop, primaryCurrency)}
                            {card.currencyType === 'USD' && fc(card.currentDebtUsd, secondaryCurrency)}
                            {card.currencyType === 'DUAL' && `${fc(card.currentDebtDop, primaryCurrency)} / ${fc(card.currentDebtUsd, secondaryCurrency)}`}
                          </span>
                        </td>
                        <td data-label={t('reports.tables.common.available')} className="py-3 px-4">
                          <span className="table-stack-value text-green-400">
                            {card.currencyType === 'DOP' && fc(card.creditLimitDop - card.currentDebtDop, primaryCurrency)}
                            {card.currencyType === 'USD' && fc(card.creditLimitUsd - card.currentDebtUsd, secondaryCurrency)}
                            {card.currencyType === 'DUAL' && `${fc(card.creditLimitDop - card.currentDebtDop, primaryCurrency)}\u00A0·\u00A0${fc(card.creditLimitUsd - card.currentDebtUsd, secondaryCurrency)}`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'accounts' && reportData.accounts && detailRows.length === 0 && (
              <p className="text-center text-dark-400 py-10 rounded-xl border border-dashed border-dark-600/60">
                {t('reports.tables.accounts.empty')}
              </p>
            )}

            {reportType === 'accounts' && reportData.accounts && detailRows.length > 0 && (
              <div className="rounded-xl border border-dark-600/50 overflow-hidden bg-dark-900/15">
                <table className="report-data-table">
                  <thead>
                    <tr>
                      <th>{t('reports.tables.common.bank')}</th>
                      <th>{t('reports.tables.common.type')}</th>
                      <th>{t('reports.tables.common.number')}</th>
                      <th>{t('reports.tables.common.balanceDop')}</th>
                      <th>{t('reports.tables.common.balanceUsd')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSlice.map((account: any) => (
                      <tr key={account.id} className="max-md:border-0">
                        <td data-label={t('reports.tables.common.bank')} className="py-3 px-4">
                          <span className="table-stack-value">{account.bankName}</span>
                        </td>
                        <td data-label={t('reports.tables.common.type')} className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">
                            {account.accountType === 'SAVINGS'
                              ? t('reports.accountType.savings')
                              : t('reports.accountType.checking')}
                          </span>
                        </td>
                        <td data-label={t('reports.tables.common.number')} className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">
                            {account.accountNumber || t('reports.tables.common.na')}
                          </span>
                        </td>
                        <td data-label={t('reports.tables.common.balanceDop')} className="py-3 px-4">
                          <span className="table-stack-value">
                            {(account.currencyType === 'DOP' || account.currencyType === 'DUAL') &&
                              fc(account.balanceDop, primaryCurrency)}
                            {account.currencyType === 'USD' && '-'}
                          </span>
                        </td>
                        <td data-label={t('reports.tables.common.balanceUsd')} className="py-3 px-4">
                          <span className="table-stack-value">
                            {(account.currencyType === 'USD' || account.currencyType === 'DUAL') &&
                              fc(account.balanceUsd, secondaryCurrency)}
                            {account.currencyType === 'DOP' && '-'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {reportType === 'comprehensive' && reportData.data && (
              <div className="space-y-8">
                <div className="rounded-2xl border border-dark-600/50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/80 border-b border-dark-600/50">
                    <LayoutGrid className="w-5 h-5 text-primary-400" />
                    <h3 className="text-base font-semibold text-white">{t('reports.comprehensive.overviewTitle')}</h3>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-l-4 border-l-primary-500/70 border-dark-600/50 bg-dark-800/30 pl-4 pr-3 py-3">
                      <p className="text-dark-400 text-xs font-medium mb-1">{t('reports.comprehensive.balanceTotal')}</p>
                      <p className="text-white font-bold text-lg">
                        {fc(reportData.summary?.totalBalance ?? 0, primaryCurrency)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-l-4 border-l-rose-500/80 border-dark-600/50 bg-dark-800/30 pl-4 pr-3 py-3">
                      <p className="text-dark-400 text-xs font-medium mb-1">{t('reports.summary.totalCardDebt')}</p>
                      <p className="text-rose-400 font-bold text-lg">
                        {fc(reportData.summary?.totalCardDebt ?? 0, primaryCurrency)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-l-4 border-l-rose-500/80 border-dark-600/50 bg-dark-800/30 pl-4 pr-3 py-3">
                      <p className="text-dark-400 text-xs font-medium mb-1">{t('reports.summary.totalLoanDebt')}</p>
                      <p className="text-rose-400 font-bold text-lg">
                        {fc(reportData.summary?.totalLoanDebt ?? 0, primaryCurrency)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-l-4 border-l-emerald-500/80 border-dark-600/50 bg-dark-800/30 pl-4 pr-3 py-3">
                      <p className="text-dark-400 text-xs font-medium mb-1">{t('reports.summary.netWorth')}</p>
                      <p className="text-emerald-400 font-bold text-lg">
                        {fc(reportData.summary?.netWorth ?? 0, primaryCurrency)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-600/50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/80 border-b border-dark-600/50">
                    <Receipt className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-semibold text-white">{t('reports.comprehensive.expensesSection')}</h3>
                  </div>
                  <div className="table-responsive table-stack -mx-1 px-1 sm:mx-0 sm:px-0">
                    <table className="report-data-table">
                      <thead>
                        <tr>
                          <th>{t('reports.tables.common.description')}</th>
                          <th>{t('reports.tables.common.amount')}</th>
                          <th>{t('reports.tables.common.category')}</th>
                          <th>{t('reports.tables.common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compExpenseSlice.map((expense: any) => (
                          <tr key={expense.id} className="max-md:border-0">
                            <td
                              data-label={t('reports.tables.common.description')}
                              data-stack="hero"
                              className="py-3 px-4 text-white"
                            >
                              {expense.description}
                            </td>
                            <td data-label={t('reports.tables.common.amount')} className="py-3 px-4">
                              <span className="table-stack-value">
                                {fc(Number(expense.amount), expense.currency || primaryCurrency)}
                              </span>
                            </td>
                            <td data-label={t('reports.tables.common.category')} className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">
                                {expense.category || t('reports.tables.common.na')}
                              </span>
                            </td>
                            <td data-label={t('reports.tables.common.status')} className="py-3 px-4">
                              <span
                                className={`px-2 py-1 rounded text-xs ${expense.isPaid ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                                  }`}
                              >
                                {expense.isPaid
                                  ? t('reports.expenseStatus.paid')
                                  : t('reports.expenseStatus.pending')}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-3 py-3">
                    <TablePagination
                      currentPage={compExpensePageClamped}
                      totalPages={compExpenseTotalPages}
                      totalItems={compExpenseRows.length}
                      itemsPerPage={reportTablePageSize}
                      onPageChange={(p) => setCompPages((s) => ({ ...s, expenses: p }))}
                      itemLabel={t('reports.pagination.expenses')}
                      disabled={loading}
                      variant="card"
                      pageSizeOptions={reportTablePageSizeOptions}
                      onPageSizeChange={setReportTablePageSize}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-600/50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/80 border-b border-dark-600/50">
                    <Landmark className="w-5 h-5 text-sky-400" />
                    <h3 className="text-base font-semibold text-white">{t('reports.comprehensive.loansSection')}</h3>
                  </div>
                  <div className="table-responsive table-stack -mx-1 px-1 sm:mx-0 sm:px-0">
                    <table className="report-data-table">
                      <thead>
                        <tr>
                          <th>{t('reports.tables.common.loan')}</th>
                          <th>{t('reports.tables.common.bank')}</th>
                          <th>{t('reports.tables.common.totalAmount')}</th>
                          <th>{t('reports.tables.common.progress')}</th>
                          <th>{t('reports.tables.common.status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compLoanSlice.map((loan: any) => (
                          <tr key={loan.id} className="max-md:border-0">
                            <td data-label={t('reports.tables.common.loan')} className="py-3 px-4">
                              <span className="table-stack-value">{loan.loanName}</span>
                            </td>
                            <td data-label={t('reports.tables.common.bank')} className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">
                                {loan.bankName || t('reports.tables.common.na')}
                              </span>
                            </td>
                            <td data-label={t('reports.tables.common.totalAmount')} className="py-3 px-4">
                              <span className="table-stack-value">
                                {fc(Number(loan.totalAmount), loan.currency)}
                              </span>
                            </td>
                            <td data-label={t('reports.tables.common.progress')} className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">
                                {(loan.progress ?? 0).toFixed(1)}%
                              </span>
                            </td>
                            <td data-label={t('reports.tables.common.status')} className="py-3 px-4">
                              <span
                                className={`px-2 py-1 rounded text-xs ${loan.status === 'PAID'
                                  ? 'bg-green-500/20 text-green-400'
                                  : loan.status === 'ACTIVE'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-red-500/20 text-red-400'
                                  }`}
                              >
                                {loanStatusLabel(loan.status)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-2 pb-3">
                    <TablePagination
                      currentPage={compLoanPageClamped}
                      totalPages={compLoanTotalPages}
                      totalItems={compLoanRows.length}
                      itemsPerPage={reportTablePageSize}
                      onPageChange={(p) => setCompPages((s) => ({ ...s, loans: p }))}
                      itemLabel={t('reports.pagination.loans')}
                      disabled={loading}
                      variant="card"
                      pageSizeOptions={reportTablePageSizeOptions}
                      onPageSizeChange={setReportTablePageSize}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-600/50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/80 border-b border-dark-600/50">
                    <CreditCard className="w-5 h-5 text-violet-400" />
                    <h3 className="text-base font-semibold text-white">{t('reports.comprehensive.cardsSection')}</h3>
                  </div>
                  <div className="table-responsive table-stack -mx-1 px-1 sm:mx-0 sm:px-0">
                    <table className="report-data-table report-data-table--card-currency">
                      <thead>
                        <tr>
                          <th>{t('reports.tables.common.card')}</th>
                          <th>{t('reports.tables.common.bank')}</th>
                          <th>{t('reports.tables.common.limit')}</th>
                          <th>{t('reports.tables.common.debt')}</th>
                          <th>{t('reports.tables.common.available')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compCardSlice.map((card: any) => (
                          <tr key={card.id} className="max-md:border-0">
                            <td data-label={t('reports.tables.common.card')} className="py-3 px-4">
                              <span className="table-stack-value">{card.cardName}</span>
                            </td>
                            <td data-label={t('reports.tables.common.bank')} className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">{card.bankName}</span>
                            </td>
                            <td data-label={t('reports.tables.common.limit')} className="py-3 px-4">
                              <span className="table-stack-value">
                                {card.currencyType === 'DOP' && fc(Number(card.creditLimitDop), primaryCurrency)}
                                {card.currencyType === 'USD' && fc(Number(card.creditLimitUsd), secondaryCurrency)}
                                {card.currencyType === 'DUAL' &&
                                  `${fc(Number(card.creditLimitDop), primaryCurrency)}\u00A0·\u00A0${fc(Number(card.creditLimitUsd), secondaryCurrency)}`}
                              </span>
                            </td>
                            <td data-label={t('reports.tables.common.debt')} className="py-3 px-4">
                              <span className="table-stack-value text-red-400">
                                {card.currencyType === 'DOP' && fc(Number(card.currentDebtDop), primaryCurrency)}
                                {card.currencyType === 'USD' && fc(Number(card.currentDebtUsd), secondaryCurrency)}
                                {card.currencyType === 'DUAL' &&
                                  `${fc(Number(card.currentDebtDop), primaryCurrency)}\u00A0·\u00A0${fc(Number(card.currentDebtUsd), secondaryCurrency)}`}
                              </span>
                            </td>
                            <td data-label={t('reports.tables.common.available')} className="py-3 px-4">
                              <span className="table-stack-value text-green-400">
                                {card.currencyType === 'DOP' &&
                                  fc(Number(card.creditLimitDop) - Number(card.currentDebtDop), primaryCurrency)}
                                {card.currencyType === 'USD' &&
                                  fc(Number(card.creditLimitUsd) - Number(card.currentDebtUsd), secondaryCurrency)}
                                {card.currencyType === 'DUAL' &&
                                  `${fc(Number(card.creditLimitDop) - Number(card.currentDebtDop), primaryCurrency)}\u00A0·\u00A0${fc(Number(card.creditLimitUsd) - Number(card.currentDebtUsd), secondaryCurrency)}`}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-2 pb-3">
                    <TablePagination
                      currentPage={compCardPageClamped}
                      totalPages={compCardTotalPages}
                      totalItems={compCardRows.length}
                      itemsPerPage={reportTablePageSize}
                      onPageChange={(p) => setCompPages((s) => ({ ...s, cards: p }))}
                      itemLabel={t('reports.pagination.cards')}
                      disabled={loading}
                      variant="card"
                      pageSizeOptions={reportTablePageSizeOptions}
                      onPageSizeChange={setReportTablePageSize}
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-600/50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/80 border-b border-dark-600/50">
                    <Building2 className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-base font-semibold text-white">{t('reports.comprehensive.accountsSection')}</h3>
                  </div>
                  <div className="table-responsive table-stack -mx-1 px-1 sm:mx-0 sm:px-0">
                    <table className="report-data-table">
                      <thead>
                        <tr>
                          <th>{t('reports.tables.common.bank')}</th>
                          <th>{t('reports.tables.common.type')}</th>
                          <th>{t('reports.tables.common.number')}</th>
                          <th>{t('reports.tables.common.balanceDop')}</th>
                          <th>{t('reports.tables.common.balanceUsd')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compAccountSlice.map((account: any) => (
                          <tr key={account.id} className="max-md:border-0">
                            <td data-label={t('reports.tables.common.bank')} className="py-3 px-4">
                              <span className="table-stack-value">{account.bankName}</span>
                            </td>
                            <td data-label={t('reports.tables.common.type')} className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">
                                {account.accountType === 'SAVINGS'
                                  ? t('reports.accountType.savings')
                                  : t('reports.accountType.checking')}
                              </span>
                            </td>
                            <td data-label={t('reports.tables.common.number')} className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">
                                {account.accountNumber || t('reports.tables.common.na')}
                              </span>
                            </td>
                            <td data-label={t('reports.tables.common.balanceDop')} className="py-3 px-4">
                              <span className="table-stack-value">
                                {(account.currencyType === 'DOP' || account.currencyType === 'DUAL') &&
                                  fc(Number(account.balanceDop), primaryCurrency)}
                                {account.currencyType === 'USD' && '-'}
                              </span>
                            </td>
                            <td data-label={t('reports.tables.common.balanceUsd')} className="py-3 px-4">
                              <span className="table-stack-value">
                                {(account.currencyType === 'USD' || account.currencyType === 'DUAL') &&
                                  fc(Number(account.balanceUsd), secondaryCurrency)}
                                {account.currencyType === 'DOP' && '-'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-2 pb-3">
                    <TablePagination
                      currentPage={compAccountPageClamped}
                      totalPages={compAccountTotalPages}
                      totalItems={compAccountRows.length}
                      itemsPerPage={reportTablePageSize}
                      onPageChange={(p) => setCompPages((s) => ({ ...s, accounts: p }))}
                      itemLabel={t('reports.pagination.accounts')}
                      disabled={loading}
                      variant="card"
                      pageSizeOptions={reportTablePageSizeOptions}
                      onPageSizeChange={setReportTablePageSize}
                    />
                  </div>
                </div>
              </div>
            )}

            {reportType !== 'comprehensive' && (
              <TablePagination
                currentPage={detailPageClamped}
                totalPages={detailTotalPages}
                totalItems={detailRows.length}
                itemsPerPage={reportTablePageSize}
                onPageChange={setReportDetailPage}
                itemLabel={t('reports.pagination.rows')}
                disabled={loading}
                variant="card"
                pageSizeOptions={reportTablePageSizeOptions}
                onPageSizeChange={setReportTablePageSize}
              />
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default Reports;
