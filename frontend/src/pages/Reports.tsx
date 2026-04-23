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
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import {
  getDateRangeForReportPeriod,
  REPORT_PERIOD_OPTIONS,
  type ReportPeriodKey,
} from '../utils/reportPeriodRange';

type ReportTypeId = 'expenses' | 'loans' | 'cards' | 'accounts' | 'comprehensive';

/** Slug en español para nombres de archivo (sin tildes; alineado con el backend). */
const REPORT_PDF_FILENAME_ES: Record<ReportTypeId, string> = {
  expenses: 'gastos',
  loans: 'prestamos',
  cards: 'tarjetas',
  accounts: 'cuentas',
  comprehensive: 'completo',
};

const REPORT_TYPES: {
  id: ReportTypeId;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  selectedRing: string;
}[] = [
    {
      id: 'expenses',
      title: 'Gastos',
      description: 'Movimientos por estado y categoría',
      icon: Receipt,
      accent: 'text-amber-400',
      selectedRing: 'ring-2 ring-amber-500/50 border-amber-500/40 bg-amber-500/5',
    },
    {
      id: 'loans',
      title: 'Préstamos',
      description: 'Activos, pagados y saldos',
      icon: Landmark,
      accent: 'text-sky-400',
      selectedRing: 'ring-2 ring-sky-500/50 border-sky-500/40 bg-sky-500/5',
    },
    {
      id: 'cards',
      title: 'Tarjetas',
      description: 'Límites, deuda y disponible',
      icon: CreditCard,
      accent: 'text-violet-400',
      selectedRing: 'ring-2 ring-violet-500/50 border-violet-500/40 bg-violet-500/5',
    },
    {
      id: 'accounts',
      title: 'Cuentas',
      description: 'Saldos DOP y USD',
      icon: Building2,
      accent: 'text-emerald-400',
      selectedRing: 'ring-2 ring-emerald-500/50 border-emerald-500/40 bg-emerald-500/5',
    },
    {
      id: 'comprehensive',
      title: 'Completo',
      description: 'Visión global de tu cartera',
      icon: LayoutGrid,
      accent: 'text-primary-400',
      selectedRing: 'ring-2 ring-primary-500/50 border-primary-500/40 bg-primary-500/5',
    },
  ];

const SUMMARY_KEY_META: Record<
  string,
  { label: string; border: string; valueClass?: string }
> = {
  total: { label: 'Registros / total', border: 'border-l-slate-500' },
  paid: { label: 'Pagados', border: 'border-l-emerald-500' },
  pending: { label: 'Pendientes', border: 'border-l-amber-500' },
  active: { label: 'Activos', border: 'border-l-sky-500' },
  totalPaid: { label: 'Total pagado', border: 'border-l-emerald-500' },
  totalPending: { label: 'Total pendiente', border: 'border-l-amber-500' },
  totalActive: { label: 'Total activo', border: 'border-l-sky-500' },
  totalDebt: { label: 'Deuda total', border: 'border-l-rose-500' },
  totalLimit: { label: 'Límite total', border: 'border-l-violet-500' },
  totalBalance: { label: 'Balance total (DOP eq.)', border: 'border-l-primary-500' },
  totalBalanceDop: { label: 'Balance DOP', border: 'border-l-emerald-500' },
  totalBalanceUsd: { label: 'Balance USD', border: 'border-l-blue-500' },
  savings: { label: 'Cuentas de ahorro', border: 'border-l-teal-500' },
  checking: { label: 'Cuentas corrientes', border: 'border-l-cyan-500' },
  totalCardDebt: { label: 'Deuda en tarjetas', border: 'border-l-rose-500', valueClass: 'text-rose-400' },
  totalLoanDebt: { label: 'Deuda en préstamos', border: 'border-l-rose-500', valueClass: 'text-rose-400' },
  netWorth: { label: 'Patrimonio neto', border: 'border-l-emerald-500', valueClass: 'text-emerald-400' },
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

function formatYmdToLong(ymd: string): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('es-DO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

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

function formatSummaryMetric(key: string, value: unknown): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return String(value ?? '');
  if (SUMMARY_COUNT_KEYS.has(key)) {
    return value.toLocaleString('es-DO', { maximumFractionDigits: 0 });
  }
  return value.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' });
}

const Reports: React.FC = () => {
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

  const detailTotalPages = Math.max(1, Math.ceil(detailRows.length / TABLE_PAGE_SIZE));
  const detailPageClamped = Math.min(reportDetailPage, detailTotalPages);
  const detailSlice = useMemo(() => {
    const start = (detailPageClamped - 1) * TABLE_PAGE_SIZE;
    return detailRows.slice(start, start + TABLE_PAGE_SIZE);
  }, [detailRows, detailPageClamped]);

  useEffect(() => {
    setReportDetailPage(1);
  }, [reportType, reportData]);

  useEffect(() => {
    setReportDetailPage((p) => Math.min(p, detailTotalPages));
  }, [detailTotalPages]);

  useEffect(() => {
    setCompPages({ expenses: 1, loans: 1, cards: 1, accounts: 1 });
  }, [reportType, reportData]);

  const compData = reportType === 'comprehensive' && reportData?.data ? reportData.data : null;
  const compExpenseRows = useMemo(() => compData?.expenses ?? [], [compData]);
  const compLoanRows = useMemo(() => compData?.loans ?? [], [compData]);
  const compCardRows = useMemo(() => compData?.cards ?? [], [compData]);
  const compAccountRows = useMemo(() => compData?.accounts ?? [], [compData]);

  const compExpenseTotalPages = Math.max(1, Math.ceil(compExpenseRows.length / TABLE_PAGE_SIZE));
  const compLoanTotalPages = Math.max(1, Math.ceil(compLoanRows.length / TABLE_PAGE_SIZE));
  const compCardTotalPages = Math.max(1, Math.ceil(compCardRows.length / TABLE_PAGE_SIZE));
  const compAccountTotalPages = Math.max(1, Math.ceil(compAccountRows.length / TABLE_PAGE_SIZE));

  const compExpensePageClamped = Math.min(compPages.expenses, compExpenseTotalPages);
  const compLoanPageClamped = Math.min(compPages.loans, compLoanTotalPages);
  const compCardPageClamped = Math.min(compPages.cards, compCardTotalPages);
  const compAccountPageClamped = Math.min(compPages.accounts, compAccountTotalPages);

  const compExpenseSlice = useMemo(
    () =>
      compExpenseRows.slice(
        (compExpensePageClamped - 1) * TABLE_PAGE_SIZE,
        compExpensePageClamped * TABLE_PAGE_SIZE
      ),
    [compExpenseRows, compExpensePageClamped]
  );
  const compLoanSlice = useMemo(
    () =>
      compLoanRows.slice(
        (compLoanPageClamped - 1) * TABLE_PAGE_SIZE,
        compLoanPageClamped * TABLE_PAGE_SIZE
      ),
    [compLoanRows, compLoanPageClamped]
  );
  const compCardSlice = useMemo(
    () =>
      compCardRows.slice(
        (compCardPageClamped - 1) * TABLE_PAGE_SIZE,
        compCardPageClamped * TABLE_PAGE_SIZE
      ),
    [compCardRows, compCardPageClamped]
  );
  const compAccountSlice = useMemo(
    () =>
      compAccountRows.slice(
        (compAccountPageClamped - 1) * TABLE_PAGE_SIZE,
        compAccountPageClamped * TABLE_PAGE_SIZE
      ),
    [compAccountRows, compAccountPageClamped]
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
        toast.error('Indica la fecha desde y la fecha hasta.');
        return false;
      }
      if (customFrom > customTo) {
        toast.error('La fecha desde no puede ser posterior a la fecha hasta.');
        return false;
      }
    }
    return true;
  }, [periodKey, customFrom, customTo]);

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
    const a = formatYmdToLong(fromDate);
    const b = formatYmdToLong(toDate);
    return a === b ? a : `${a} — ${b}`;
  }, [fromDate, toDate]);

  const selectedTypeConfig = useMemo(
    () => REPORT_TYPES.find((r) => r.id === reportType) ?? REPORT_TYPES[0],
    [reportType]
  );

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
        link.download = `reporte-${REPORT_PDF_FILENAME_ES[reportType]}-${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast.success('Reporte PDF descargado exitosamente');
      } else {
        // For JSON, show data
        const response = await api.get(endpoint, { params });
        setReportData(response.data);
        toast.success('Reporte generado exitosamente');
      }
    } catch (error: any) {
      toast.error('Error al generar reporte');
      console.error('Report error:', error);
    } finally {
      setLoading(false);
    }
  };

  const reportResultTitle =
    reportType === 'comprehensive'
      ? 'Reporte completo — visión global'
      : `Reporte de ${selectedTypeConfig.title.toLowerCase()}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reportes"
        subtitle="Elige el tipo de análisis, ajusta el período y genera o exporta en PDF"
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid gap-6 lg:grid-cols-12"
      >
        <div className="lg:col-span-7 space-y-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Tipo de reporte</h2>
          <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
            {REPORT_TYPES.map((rt) => {
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
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Filtros</h2>
            <div>
              <label className="label">Período</label>
              <select
                value={periodKey}
                onChange={(e) => onPeriodChange(e.target.value as ReportPeriodKey)}
                className="input w-full"
              >
                {REPORT_PERIOD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {periodKey === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Fecha desde</label>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <div>
                  <label className="label">Fecha hasta</label>
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
                <label className="label">Estado</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'all' | 'paid' | 'pending')}
                  className="input w-full"
                >
                  <option value="all">Todos</option>
                  <option value="paid">Pagados</option>
                  <option value="pending">
                    {reportType === 'expenses' ? 'Pendientes' : 'Activos (no pagados)'}
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
                    <span>Generando…</span>
                  </>
                ) : (
                  <>
                    <Filter size={20} />
                    <span>Generar reporte</span>
                  </>
                )}
              </button>
              <button
                onClick={() => handleGenerateReport(true)}
                disabled={loading}
                className="btn-secondary w-full flex items-center justify-center gap-2"
              >
                <Download size={20} />
                <span>Exportar PDF</span>
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6 gap-y-2">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-primary-400/90 mb-1">
                Resultado
              </p>
              <h2 className="text-xl sm:text-2xl font-bold text-white break-words">{reportResultTitle}</h2>
              {periodLabel && (
                <p className="mt-2 flex items-start gap-2 text-sm text-dark-300">
                  <CalendarRange className="w-4 h-4 shrink-0 text-primary-400/80 mt-0.5" />
                  <span>Período: {periodLabel}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleGenerateReport(true)}
              className="btn-secondary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto"
            >
              <Download size={18} />
              <span>Exportar PDF</span>
            </button>
          </div>

          {reportData.summary && reportType !== 'comprehensive' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
              {sortSummaryKeys(Object.keys(reportData.summary)).map((key) => {
                const value = (reportData.summary as Record<string, unknown>)[key];
                const meta = SUMMARY_KEY_META[key] ?? {
                  label: key,
                  border: 'border-l-slate-500',
                };
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
                No hay gastos en el período seleccionado.
              </p>
            )}

            {reportType === 'expenses' && reportData.expenses && detailRows.length > 0 && (
              <div className="rounded-xl border border-dark-600/50 overflow-hidden bg-dark-900/15 mb-8">
                <table className="report-data-table">
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th>Monto</th>
                      <th>Categoría</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSlice.map((expense: any) => (
                      <tr key={expense.id} className="max-md:border-0">
                        <td data-label="Descripción" data-stack="hero" className="py-3 px-4 text-white">
                          {expense.description}
                        </td>
                        <td data-label="Monto" className="py-3 px-4">
                          <span className="table-stack-value">
                            {expense.amount.toLocaleString('es-DO', {
                              style: 'currency',
                              currency: expense.currency,
                            })}
                          </span>
                        </td>
                        <td data-label="Categoría" className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">{expense.category || 'N/A'}</span>
                        </td>
                        <td data-label="Estado" className="py-3 px-4">
                          <span className="table-stack-value">
                            <span
                              className={`px-2 py-1 rounded text-xs ${expense.isPaid
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                                }`}
                            >
                              {expense.isPaid ? 'Pagado' : 'Pendiente'}
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
                No hay préstamos en el período seleccionado.
              </p>
            )}

            {reportType === 'loans' && reportData.loans && detailRows.length > 0 && (
              <div className="rounded-xl border border-dark-600/50 overflow-hidden bg-dark-900/15">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-dark-700">
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">Préstamo</th>
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">Banco</th>
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">Monto Total</th>
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">Progreso</th>
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSlice.map((loan: any) => (
                      <tr key={loan.id} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                        <td data-label="Préstamo" className="py-3 px-4">
                          <span className="table-stack-value">{loan.loanName}</span>
                        </td>
                        <td data-label="Banco" className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">{loan.bankName || 'N/A'}</span>
                        </td>
                        <td data-label="Monto total" className="py-3 px-4">
                          <span className="table-stack-value">
                            {loan.totalAmount.toLocaleString('es-DO', {
                              style: 'currency',
                              currency: loan.currency,
                            })}
                          </span>
                        </td>
                        <td data-label="Progreso" className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">{loan.progress?.toFixed(1) || 0}%</span>
                        </td>
                        <td data-label="Estado" className="py-3 px-4">
                          <span className="table-stack-value">
                            <span
                              className={`px-2 py-1 rounded text-xs ${loan.status === 'PAID'
                                ? 'bg-green-500/20 text-green-400'
                                : loan.status === 'ACTIVE'
                                  ? 'bg-blue-500/20 text-blue-400'
                                  : 'bg-red-500/20 text-red-400'
                                }`}
                            >
                              {loan.status === 'PAID' ? 'Pagado' : loan.status === 'ACTIVE' ? 'Activo' : 'En Mora'}
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
                No hay tarjetas que coincidan con el criterio.
              </p>
            )}

            {reportType === 'cards' && reportData.cards && detailRows.length > 0 && (
              <div className="rounded-xl border border-dark-600/50 overflow-hidden bg-dark-900/15">
                <table className="report-data-table report-data-table--card-currency">
                  <thead>
                    <tr>
                      <th>Tarjeta</th>
                      <th>Banco</th>
                      <th>Límite</th>
                      <th>Deuda</th>
                      <th>Disponible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSlice.map((card: any) => (
                      <tr key={card.id} className="max-md:border-0">
                        <td data-label="Tarjeta" className="py-3 px-4">
                          <span className="table-stack-value">{card.cardName}</span>
                        </td>
                        <td data-label="Banco" className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">{card.bankName}</span>
                        </td>
                        <td data-label="Límite" className="py-3 px-4">
                          <span className="table-stack-value">
                            {card.currencyType === 'DOP' && card.creditLimitDop.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                            {card.currencyType === 'USD' && card.creditLimitUsd.toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
                            {card.currencyType === 'DUAL' && `${card.creditLimitDop.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}\u00A0·\u00A0${card.creditLimitUsd.toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}`}
                          </span>
                        </td>
                        <td data-label="Deuda" className="py-3 px-4">
                          <span className="table-stack-value text-red-400">
                            {card.currencyType === 'DOP' && card.currentDebtDop.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                            {card.currencyType === 'USD' && card.currentDebtUsd.toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
                            {card.currencyType === 'DUAL' && `${card.currentDebtDop.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })} / ${card.currentDebtUsd.toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}`}
                          </span>
                        </td>
                        <td data-label="Disponible" className="py-3 px-4">
                          <span className="table-stack-value text-green-400">
                            {card.currencyType === 'DOP' && (card.creditLimitDop - card.currentDebtDop).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                            {card.currencyType === 'USD' && (card.creditLimitUsd - card.currentDebtUsd).toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
                            {card.currencyType === 'DUAL' && `${(card.creditLimitDop - card.currentDebtDop).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}\u00A0·\u00A0${(card.creditLimitUsd - card.currentDebtUsd).toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}`}
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
                No hay cuentas registradas.
              </p>
            )}

            {reportType === 'accounts' && reportData.accounts && detailRows.length > 0 && (
              <div className="rounded-xl border border-dark-600/50 overflow-hidden bg-dark-900/15">
                <table className="report-data-table">
                  <thead>
                    <tr>
                      <th>Banco</th>
                      <th>Tipo</th>
                      <th>Número</th>
                      <th>Balance DOP</th>
                      <th>Balance USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailSlice.map((account: any) => (
                      <tr key={account.id} className="max-md:border-0">
                        <td data-label="Banco" className="py-3 px-4">
                          <span className="table-stack-value">{account.bankName}</span>
                        </td>
                        <td data-label="Tipo" className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">
                            {account.accountType === 'SAVINGS' ? 'Ahorro' : 'Corriente'}
                          </span>
                        </td>
                        <td data-label="Número" className="py-3 px-4">
                          <span className="table-stack-value text-dark-300">{account.accountNumber || 'N/A'}</span>
                        </td>
                        <td data-label="Balance DOP" className="py-3 px-4">
                          <span className="table-stack-value">
                            {(account.currencyType === 'DOP' || account.currencyType === 'DUAL') &&
                              account.balanceDop.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                            {account.currencyType === 'USD' && '-'}
                          </span>
                        </td>
                        <td data-label="Balance USD" className="py-3 px-4">
                          <span className="table-stack-value">
                            {(account.currencyType === 'USD' || account.currencyType === 'DUAL') &&
                              account.balanceUsd.toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
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
                    <h3 className="text-base font-semibold text-white">Resumen general</h3>
                  </div>
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-l-4 border-l-primary-500/70 border-dark-600/50 bg-dark-800/30 pl-4 pr-3 py-3">
                      <p className="text-dark-400 text-xs font-medium mb-1">Balance total</p>
                      <p className="text-white font-bold text-lg">
                        {reportData.summary?.totalBalance?.toLocaleString('es-DO', {
                          style: 'currency',
                          currency: 'DOP',
                        })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-l-4 border-l-rose-500/80 border-dark-600/50 bg-dark-800/30 pl-4 pr-3 py-3">
                      <p className="text-dark-400 text-xs font-medium mb-1">Deuda en tarjetas</p>
                      <p className="text-rose-400 font-bold text-lg">
                        {reportData.summary?.totalCardDebt?.toLocaleString('es-DO', {
                          style: 'currency',
                          currency: 'DOP',
                        })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-l-4 border-l-rose-500/80 border-dark-600/50 bg-dark-800/30 pl-4 pr-3 py-3">
                      <p className="text-dark-400 text-xs font-medium mb-1">Deuda en préstamos</p>
                      <p className="text-rose-400 font-bold text-lg">
                        {reportData.summary?.totalLoanDebt?.toLocaleString('es-DO', {
                          style: 'currency',
                          currency: 'DOP',
                        })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-l-4 border-l-emerald-500/80 border-dark-600/50 bg-dark-800/30 pl-4 pr-3 py-3">
                      <p className="text-dark-400 text-xs font-medium mb-1">Patrimonio neto</p>
                      <p className="text-emerald-400 font-bold text-lg">
                        {(reportData.summary?.netWorth ?? 0).toLocaleString('es-DO', {
                          style: 'currency',
                          currency: 'DOP',
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-600/50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/80 border-b border-dark-600/50">
                    <Receipt className="w-5 h-5 text-amber-400" />
                    <h3 className="text-base font-semibold text-white">Gastos</h3>
                  </div>
                  <div className="table-responsive table-stack -mx-1 px-1 sm:mx-0 sm:px-0">
                    <table className="report-data-table">
                      <thead>
                        <tr>
                          <th>Descripción</th>
                          <th>Monto</th>
                          <th>Categoría</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compExpenseSlice.map((expense: any) => (
                          <tr key={expense.id} className="max-md:border-0">
                            <td data-label="Descripción" data-stack="hero" className="py-3 px-4 text-white">
                              {expense.description}
                            </td>
                            <td data-label="Monto" className="py-3 px-4">
                              <span className="table-stack-value">
                                {Number(expense.amount).toLocaleString('es-DO', {
                                  style: 'currency',
                                  currency: expense.currency || 'DOP',
                                })}
                              </span>
                            </td>
                            <td data-label="Categoría" className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">{expense.category || 'N/A'}</span>
                            </td>
                            <td data-label="Estado" className="py-3 px-4">
                              <span
                                className={`px-2 py-1 rounded text-xs ${expense.isPaid ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                                  }`}
                              >
                                {expense.isPaid ? 'Pagado' : 'Pendiente'}
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
                      itemsPerPage={TABLE_PAGE_SIZE}
                      onPageChange={(p) => setCompPages((s) => ({ ...s, expenses: p }))}
                      itemLabel="gastos"
                      disabled={loading}
                      variant="card"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-600/50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/80 border-b border-dark-600/50">
                    <Landmark className="w-5 h-5 text-sky-400" />
                    <h3 className="text-base font-semibold text-white">Préstamos</h3>
                  </div>
                  <div className="table-responsive table-stack -mx-1 px-1 sm:mx-0 sm:px-0">
                    <table className="report-data-table">
                      <thead>
                        <tr>
                          <th>Préstamo</th>
                          <th>Banco</th>
                          <th>Monto total</th>
                          <th>Progreso</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compLoanSlice.map((loan: any) => (
                          <tr key={loan.id} className="max-md:border-0">
                            <td data-label="Préstamo" className="py-3 px-4">
                              <span className="table-stack-value">{loan.loanName}</span>
                            </td>
                            <td data-label="Banco" className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">{loan.bankName || 'N/A'}</span>
                            </td>
                            <td data-label="Monto total" className="py-3 px-4">
                              <span className="table-stack-value">
                                {Number(loan.totalAmount).toLocaleString('es-DO', {
                                  style: 'currency',
                                  currency: loan.currency || 'DOP',
                                })}
                              </span>
                            </td>
                            <td data-label="Progreso" className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">
                                {(loan.progress ?? 0).toFixed(1)}%
                              </span>
                            </td>
                            <td data-label="Estado" className="py-3 px-4">
                              <span
                                className={`px-2 py-1 rounded text-xs ${loan.status === 'PAID'
                                  ? 'bg-green-500/20 text-green-400'
                                  : loan.status === 'ACTIVE'
                                    ? 'bg-blue-500/20 text-blue-400'
                                    : 'bg-red-500/20 text-red-400'
                                  }`}
                              >
                                {loan.status === 'PAID' ? 'Pagado' : loan.status === 'ACTIVE' ? 'Activo' : 'En mora'}
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
                      itemsPerPage={TABLE_PAGE_SIZE}
                      onPageChange={(p) => setCompPages((s) => ({ ...s, loans: p }))}
                      itemLabel="préstamos"
                      disabled={loading}
                      variant="card"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-600/50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/80 border-b border-dark-600/50">
                    <CreditCard className="w-5 h-5 text-violet-400" />
                    <h3 className="text-base font-semibold text-white">Tarjetas de crédito</h3>
                  </div>
                  <div className="table-responsive table-stack -mx-1 px-1 sm:mx-0 sm:px-0">
                    <table className="report-data-table report-data-table--card-currency">
                      <thead>
                        <tr>
                          <th>Tarjeta</th>
                          <th>Banco</th>
                          <th>Límite</th>
                          <th>Deuda</th>
                          <th>Disponible</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compCardSlice.map((card: any) => (
                          <tr key={card.id} className="max-md:border-0">
                            <td data-label="Tarjeta" className="py-3 px-4">
                              <span className="table-stack-value">{card.cardName}</span>
                            </td>
                            <td data-label="Banco" className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">{card.bankName}</span>
                            </td>
                            <td data-label="Límite" className="py-3 px-4">
                              <span className="table-stack-value">
                                {card.currencyType === 'DOP' &&
                                  Number(card.creditLimitDop).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                                {card.currencyType === 'USD' &&
                                  Number(card.creditLimitUsd).toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
                                {card.currencyType === 'DUAL' &&
                                  `${Number(card.creditLimitDop).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}\u00A0·\u00A0${Number(card.creditLimitUsd).toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}`}
                              </span>
                            </td>
                            <td data-label="Deuda" className="py-3 px-4">
                              <span className="table-stack-value text-red-400">
                                {card.currencyType === 'DOP' &&
                                  Number(card.currentDebtDop).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                                {card.currencyType === 'USD' &&
                                  Number(card.currentDebtUsd).toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
                                {card.currencyType === 'DUAL' &&
                                  `${Number(card.currentDebtDop).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}\u00A0·\u00A0${Number(card.currentDebtUsd).toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}`}
                              </span>
                            </td>
                            <td data-label="Disponible" className="py-3 px-4">
                              <span className="table-stack-value text-green-400">
                                {card.currencyType === 'DOP' &&
                                  (Number(card.creditLimitDop) - Number(card.currentDebtDop)).toLocaleString('es-DO', {
                                    style: 'currency',
                                    currency: 'DOP',
                                  })}
                                {card.currencyType === 'USD' &&
                                  (Number(card.creditLimitUsd) - Number(card.currentDebtUsd)).toLocaleString('es-DO', {
                                    style: 'currency',
                                    currency: 'USD',
                                  })}
                                {card.currencyType === 'DUAL' &&
                                  `${(Number(card.creditLimitDop) - Number(card.currentDebtDop)).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}\u00A0·\u00A0${(Number(card.creditLimitUsd) - Number(card.currentDebtUsd)).toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}`}
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
                      itemsPerPage={TABLE_PAGE_SIZE}
                      onPageChange={(p) => setCompPages((s) => ({ ...s, cards: p }))}
                      itemLabel="tarjetas"
                      disabled={loading}
                      variant="card"
                    />
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-600/50 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 bg-dark-800/80 border-b border-dark-600/50">
                    <Building2 className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-base font-semibold text-white">Cuentas bancarias</h3>
                  </div>
                  <div className="table-responsive table-stack -mx-1 px-1 sm:mx-0 sm:px-0">
                    <table className="report-data-table">
                      <thead>
                        <tr>
                          <th>Banco</th>
                          <th>Tipo</th>
                          <th>Número</th>
                          <th>Balance DOP</th>
                          <th>Balance USD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compAccountSlice.map((account: any) => (
                          <tr key={account.id} className="max-md:border-0">
                            <td data-label="Banco" className="py-3 px-4">
                              <span className="table-stack-value">{account.bankName}</span>
                            </td>
                            <td data-label="Tipo" className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">
                                {account.accountType === 'SAVINGS' ? 'Ahorro' : 'Corriente'}
                              </span>
                            </td>
                            <td data-label="Número" className="py-3 px-4">
                              <span className="table-stack-value text-dark-300">{account.accountNumber || 'N/A'}</span>
                            </td>
                            <td data-label="Balance DOP" className="py-3 px-4">
                              <span className="table-stack-value">
                                {(account.currencyType === 'DOP' || account.currencyType === 'DUAL') &&
                                  Number(account.balanceDop).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                                {account.currencyType === 'USD' && '-'}
                              </span>
                            </td>
                            <td data-label="Balance USD" className="py-3 px-4">
                              <span className="table-stack-value">
                                {(account.currencyType === 'USD' || account.currencyType === 'DUAL') &&
                                  Number(account.balanceUsd).toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
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
                      itemsPerPage={TABLE_PAGE_SIZE}
                      onPageChange={(p) => setCompPages((s) => ({ ...s, accounts: p }))}
                      itemLabel="cuentas"
                      disabled={loading}
                      variant="card"
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
                itemsPerPage={TABLE_PAGE_SIZE}
                onPageChange={setReportDetailPage}
                itemLabel="filas"
                disabled={loading}
                variant="card"
              />
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default Reports;
