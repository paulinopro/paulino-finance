import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { TrendingUp, TrendingDown, AlertTriangle, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { formatChartAxisEsShort, formatChartTooltipEs } from '../utils/dateUtils';
import PageHeader from '../components/PageHeader';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';

interface CashFlowData {
  date: string;
  income: number;
  expenses: number;
  netFlow: number;
  balance: number;
}

interface CashFlowSummary {
  totalIncome: number;
  totalExpenses: number;
  netCashFlow: number;
  finalBalance: number;
  pendingCommitments: number;
  pendingCommitmentsBreakdown?: {
    accountsPayable: number;
    creditCardMinimums: number;
    loanInstallments: number;
  };
  availableBalance: number;
}

/** Saldo disponible: 🟢 holgado · 🟡 ajustado (<10% ingresos) · 🔴 negativo */
function availableBalanceTone(available: number, periodIncome: number): 'green' | 'amber' | 'red' {
  if (available < 0) return 'red';
  if (periodIncome > 0 && available < periodIncome * 0.1) return 'amber';
  return 'green';
}

/** Desglose: únicos por tipo fijo/variable; recurrentes por frecuencia (misma clave que API) */
interface IncomeBreakdown {
  punctual: { fixed: number; variable: number; total: number };
  recurrent: { byFrequency: Record<string, number>; total: number };
  accountsReceivable: number;
  total: number;
}

interface ExpensesBreakdown {
  punctual: { fixed: number; variable: number; total: number };
  recurring: {
    byFrequency: Record<string, number>;
    total: number;
    monthly: number;
    otherFrequencies: number;
    nonAnnual: number;
  };
  annualExpenses: number;
  accountsPayable: number;
  total: number;
}

const CASH_FLOW_FREQUENCY_ORDER: readonly string[] = [
  'daily',
  'weekly',
  'biweekly',
  'semi_monthly',
  'monthly',
  'quarterly',
  'semi_annual',
  'annual',
];

const CASH_FLOW_FREQUENCY_LABELS: Record<string, string> = {
  daily: 'daily',
  weekly: 'weekly',
  biweekly: 'biweekly',
  semi_monthly: 'semiMonthly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  semi_annual: 'semiAnnual',
  annual: 'annual',
};

/** Todas las frecuencias del catálogo en orden fijo; importe 0 si no hubo en el mapa (enteros, moneda principal). */
function orderedFrequencyEntries(map: Record<string, number>): [string, number][] {
  const out: [string, number][] = [];
  const seen = new Set<string>();
  const valueFor = (k: string): number => {
    const n = Number(map[k]);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n);
  };
  for (const k of CASH_FLOW_FREQUENCY_ORDER) {
    out.push([k, valueFor(k)]);
    seen.add(k);
  }
  for (const k of Object.keys(map)) {
    if (!seen.has(k)) {
      out.push([k, valueFor(k)]);
      seen.add(k);
    }
  }
  return out;
}

function labelCashFlowFrequency(key: string, t: (key: string) => string): string {
  const mapped = CASH_FLOW_FREQUENCY_LABELS[key];
  return mapped ? t(`pages.cashFlow.freq.${mapped}`) : key;
}

const CashFlow: React.FC = () => {
  const { t } = useTranslation();
  const { formatCurrency: fc, formatYmdShortLocalized: fy, localeTag, primaryCurrency } = useIntlFormatting();
  const [cashFlowData, setCashFlowData] = useState<CashFlowData[]>([]);
  const [summary, setSummary] = useState<CashFlowSummary | null>(null);
  const [incomeBreakdown, setIncomeBreakdown] = useState<IncomeBreakdown | null>(null);
  const [expensesBreakdown, setExpensesBreakdown] = useState<ExpensesBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportStartDate, setReportStartDate] = useState<string | null>(null);
  const [reportEndDate, setReportEndDate] = useState<string | null>(null);

  const fetchCashFlow = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = { period };
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      const response = await api.get('/cash-flow', { params });
      const payload = response.data.data;
      setCashFlowData(payload.dailyData);
      const s = payload.summary;
      setSummary({
        totalIncome: s.totalIncome,
        totalExpenses: s.totalExpenses,
        netCashFlow: s.netCashFlow,
        finalBalance: s.finalBalance,
        pendingCommitments: s.pendingCommitments ?? 0,
        pendingCommitmentsBreakdown: s.pendingCommitmentsBreakdown,
        availableBalance: s.availableBalance ?? s.netCashFlow,
      });
      const ib = payload.incomeBreakdown;
      if (ib && ib.punctual && ib.recurrent) {
        const r = ib.recurrent;
        const byFrequency = (r.byFrequency ?? {}) as Record<string, number>;
        const recurrentTotal =
          typeof r.total === 'number' ? r.total : Object.values(byFrequency).reduce((a, b) => a + b, 0);
        setIncomeBreakdown({
          punctual: ib.punctual,
          recurrent: { byFrequency, total: recurrentTotal },
          accountsReceivable: ib.accountsReceivable ?? 0,
          total: ib.total ?? 0,
        });
      } else {
        setIncomeBreakdown(null);
      }
      const eb = payload.expensesBreakdown;
      if (eb && eb.punctual && eb.recurring) {
        const rec = eb.recurring as ExpensesBreakdown['recurring'];
        setExpensesBreakdown({
          ...eb,
          recurring: {
            ...rec,
            byFrequency: rec.byFrequency ?? {},
          },
        } as ExpensesBreakdown);
      } else {
        setExpensesBreakdown(null);
      }
      setReportStartDate(payload.startDate ?? null);
      setReportEndDate(payload.endDate ?? null);
    } catch (error: any) {
      toast.error(t('toast.cashFlow.loadError'));
    } finally {
      setLoading(false);
    }
  }, [period, startDate, endDate, t]);

  useEffect(() => {
    fetchCashFlow();
    // Solo al cambiar el periodo; rango personalizado se aplica con «Aplicar»
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchCashFlow también depende de fechas; no recargar al editar fechas en modo personalizado

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      setStartDate('');
      setEndDate('');
    }
  };

  const pctOf = (part: number, total: number) =>
    total > 0 ? ((part / total) * 100).toFixed(1) : '0.0';

  const incomeRecurrentFreqRows = useMemo(
    () => (incomeBreakdown ? orderedFrequencyEntries(incomeBreakdown.recurrent.byFrequency) : []),
    [incomeBreakdown]
  );
  const expensesRecurringFreqRows = useMemo(
    () => (expensesBreakdown ? orderedFrequencyEntries(expensesBreakdown.recurring.byFrequency) : []),
    [expensesBreakdown]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const reportDayCount = cashFlowData.length;
  const periodAnalyzedLine =
    reportStartDate && reportEndDate
      ? t('pages.cashFlow.periodAnalyzed', {
          count: reportDayCount,
          from: fy(reportStartDate),
          to: fy(reportEndDate),
        })
      : null;

  const saldoDisponibleTone = summary
    ? availableBalanceTone(summary.availableBalance, summary.totalIncome)
    : 'green';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.cashFlow.title')}
        subtitle={
          <>
            <p className="text-dark-400 text-sm sm:text-base leading-snug">
              {t('pages.cashFlow.subtitleLine')}
            </p>
            {periodAnalyzedLine ? (
              <p className="text-dark-500 text-[0.8125rem] sm:text-sm leading-snug">{periodAnalyzedLine}</p>
            ) : null}
          </>
        }
        actions={
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value)}
              className="input w-full sm:w-auto sm:min-w-[10rem]"
            >
              <option value="month">{t('pages.cashFlow.periodMonth')}</option>
              <option value="year">{t('pages.cashFlow.periodYear')}</option>
              <option value="custom">{t('pages.cashFlow.periodCustom')}</option>
            </select>
            {period === 'custom' && (
              <div className="flex flex-col xs:flex-row xs:items-center gap-2 w-full sm:w-auto">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="input flex-1 min-w-0"
                />
                <span className="text-dark-400 text-center xs:px-1">{t('pages.cashFlow.dateRangeSeparator')}</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="input flex-1 min-w-0"
                />
                <button type="button" onClick={fetchCashFlow} className="btn-primary w-full xs:w-auto shrink-0">
                  {t('common.actions.apply')}
                </button>
              </div>
            )}
          </div>
        }
      />

      {/* Summary Cards */}
      {summary && (
        <div className="metrics-cq">
        <div className="metrics-summary-strip">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">{t('pages.cashFlow.income')}</p>
                <p className="text-2xl font-bold text-green-400">
                  {fc(summary.totalIncome, primaryCurrency)}
                </p>
              </div>
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">{t('pages.cashFlow.expenses')}</p>
                <p className="text-2xl font-bold text-red-400">
                  {fc(summary.totalExpenses, primaryCurrency)}
                </p>
              </div>
              <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-dark-400 text-sm mb-1">{t('pages.cashFlow.pendingCommitments')}</p>
                <p className="text-2xl font-bold text-amber-400">
                  {fc(summary.pendingCommitments, primaryCurrency)}
                </p>
                <p className="text-xs text-dark-400 mt-1 leading-snug">
                  {t('pages.cashFlow.pendingCommitmentsFormula')}
                </p>
              </div>
              <div className="w-12 h-12 bg-amber-600 shrink-0 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-dark-400 text-sm mb-1">{t('pages.cashFlow.availableBalance')}</p>
                <p
                  className={`text-2xl font-bold ${saldoDisponibleTone === 'red'
                    ? 'text-red-400'
                    : saldoDisponibleTone === 'amber'
                      ? 'text-amber-400'
                      : 'text-green-400'
                    }`}
                >
                  {fc(summary.availableBalance, primaryCurrency)}
                </p>
                <p className="text-xs text-dark-400 mt-1 leading-snug">
                  {t('pages.cashFlow.availableBalanceFormula')}
                </p>
              </div>
              <div
                className={`w-12 h-12 shrink-0 rounded-lg flex items-center justify-center ${saldoDisponibleTone === 'red'
                  ? 'bg-red-600'
                  : saldoDisponibleTone === 'amber'
                    ? 'bg-amber-600'
                    : 'bg-emerald-600'
                  }`}
              >
                <Wallet className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>
        </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
        {/* Income vs Expenses */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="card min-w-0"
        >
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">{t('pages.cashFlow.incomeVsExpenses')}</h2>
          <div className="chart-box h-[240px] sm:h-[280px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashFlowData}>
                <defs>
                  <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  tickFormatter={(value) => formatChartAxisEsShort(String(value), localeTag)}
                />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelFormatter={(value) => formatChartTooltipEs(String(value), localeTag)}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#10b981"
                  fillOpacity={1}
                  fill="url(#colorIncome)"
                  name={t('pages.cashFlow.income')}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#ef4444"
                  fillOpacity={1}
                  fill="url(#colorExpenses)"
                  name={t('pages.cashFlow.expenses')}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Net Flow */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card min-w-0"
        >
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">{t('pages.cashFlow.dailyNetFlow')}</h2>
          <div className="chart-box h-[240px] sm:h-[280px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  stroke="#94a3b8"
                  tickFormatter={(value) => formatChartAxisEsShort(String(value), localeTag)}
                />
                <YAxis stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelFormatter={(value) => formatChartTooltipEs(String(value), localeTag)}
                />
                <Line
                  type="monotone"
                  dataKey="netFlow"
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                  name={t('pages.cashFlow.netFlow')}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Balance Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="card min-w-0"
      >
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">{t('pages.cashFlow.accumulatedBalance')}</h2>
        <div className="chart-box h-[280px] sm:h-[340px] md:h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cashFlowData}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                tickFormatter={(value) => formatChartAxisEsShort(String(value), localeTag)}
              />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelFormatter={(value) => formatChartTooltipEs(String(value), localeTag)}
              />
              <Area
                type="monotone"
                dataKey="balance"
                stroke="#0ea5e9"
                fillOpacity={1}
                fill="url(#colorBalance)"
                name={t('pages.cashFlow.balance')}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Breakdowns at the end */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income Breakdown */}
        {incomeBreakdown && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="card"
          >
            <h2 className="text-xl font-semibold text-white mb-2">{t('pages.cashFlow.incomeBreakdownTitle')}</h2>
            <p className="text-dark-500 text-xs mb-4">
              {t('pages.cashFlow.incomeBreakdownHint', { currency: primaryCurrency })}
            </p>
            <div className="space-y-4">
              <div className="rounded-lg border border-dark-600 overflow-hidden">
                <div className="px-3 py-2 bg-dark-750 border-b border-dark-600">
                  <p className="text-white text-sm font-medium">{t('pages.cashFlow.oneOffIncome')}</p>
                  <p className="text-dark-500 text-xs">{t('pages.cashFlow.oneOffNature')}</p>
                </div>
                <div className="divide-y divide-dark-700">
                  <div className="flex items-center justify-between p-3 bg-dark-700/50">
                    <span className="text-dark-300 text-sm">{t('pages.cashFlow.fixedType')}</span>
                    <span className="text-white font-medium">
                      {fc(incomeBreakdown.punctual.fixed, primaryCurrency)}{' '}
                      <span className="text-dark-500 text-xs">({pctOf(incomeBreakdown.punctual.fixed, incomeBreakdown.total)}%)</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-dark-700/50">
                    <span className="text-dark-300 text-sm">{t('pages.cashFlow.variableType')}</span>
                    <span className="text-white font-medium">
                      {fc(incomeBreakdown.punctual.variable, primaryCurrency)}{' '}
                      <span className="text-dark-500 text-xs">({pctOf(incomeBreakdown.punctual.variable, incomeBreakdown.total)}%)</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-dark-800">
                    <span className="text-dark-400 text-xs">{t('pages.cashFlow.oneOffSubtotal')}</span>
                    <span className="text-dark-200 text-sm font-semibold">
                      {fc(incomeBreakdown.punctual.total, primaryCurrency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-dark-600 overflow-hidden">
                <div className="px-3 py-2 bg-dark-750 border-b border-dark-600">
                  <p className="text-white text-sm font-medium">{t('pages.cashFlow.recurrentIncome')}</p>
                  <p className="text-dark-500 text-xs">
                    {t('pages.cashFlow.allFrequencies')}
                  </p>
                </div>
                <div className="divide-y divide-dark-700">
                  {incomeRecurrentFreqRows.map(([fk, amt]) => (
                    <div key={fk} className="flex items-center justify-between p-3 bg-dark-700/50">
                      <span className="text-dark-300 text-sm">{labelCashFlowFrequency(fk, t)}</span>
                      <span className={amt === 0 ? 'text-dark-500 text-sm' : 'text-white font-medium'}>
                        {fc(amt, primaryCurrency)}{' '}
                        <span className="text-dark-500 text-xs">({pctOf(amt, incomeBreakdown.total)}%)</span>
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2 bg-dark-800">
                    <span className="text-dark-400 text-xs">{t('pages.cashFlow.recurrentSubtotal')}</span>
                    <span className="text-dark-200 text-sm font-semibold">
                      {fc(incomeBreakdown.recurrent.total, primaryCurrency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                <div>
                  <p className="text-dark-400 text-sm">{t('pages.cashFlow.accountsReceivableReceived')}</p>
                  <p className="text-lg font-semibold text-white">
                    {fc(incomeBreakdown.accountsReceivable, primaryCurrency)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-dark-400">{pctOf(incomeBreakdown.accountsReceivable, incomeBreakdown.total)}%</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-primary-600/20 border border-primary-600 rounded-lg">
                <div>
                  <p className="text-primary-400 text-sm font-medium">{t('pages.cashFlow.totalIncome')}</p>
                  <p className="text-2xl font-bold text-green-400">
                    {fc(incomeBreakdown.total, primaryCurrency)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-primary-400">100%</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Expenses Breakdown */}
        {expensesBreakdown && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="card"
          >
            <h2 className="text-xl font-semibold text-white mb-2">{t('pages.cashFlow.expensesBreakdownTitle')}</h2>
            <p className="text-dark-500 text-xs mb-4">
              {t('pages.cashFlow.expensesBreakdownHint')}
            </p>
            <div className="space-y-4">
              <div className="rounded-lg border border-dark-600 overflow-hidden">
                <div className="px-3 py-2 bg-dark-750 border-b border-dark-600">
                  <p className="text-white text-sm font-medium">{t('pages.cashFlow.oneOffExpenses')}</p>
                  <p className="text-dark-500 text-xs">{t('pages.cashFlow.oneOffNature')}</p>
                </div>
                <div className="divide-y divide-dark-700">
                  <div className="flex items-center justify-between p-3 bg-dark-700/50">
                    <span className="text-dark-300 text-sm">{t('pages.cashFlow.fixedType')}</span>
                    <span className="text-white font-medium">
                      {fc(expensesBreakdown.punctual.fixed, primaryCurrency)}{' '}
                      <span className="text-dark-500 text-xs">({pctOf(expensesBreakdown.punctual.fixed, expensesBreakdown.total)}%)</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-dark-700/50">
                    <span className="text-dark-300 text-sm">{t('pages.cashFlow.variableType')}</span>
                    <span className="text-white font-medium">
                      {fc(expensesBreakdown.punctual.variable, primaryCurrency)}{' '}
                      <span className="text-dark-500 text-xs">({pctOf(expensesBreakdown.punctual.variable, expensesBreakdown.total)}%)</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-dark-800">
                    <span className="text-dark-400 text-xs">{t('pages.cashFlow.oneOffSubtotal')}</span>
                    <span className="text-dark-200 text-sm font-semibold">
                      {fc(expensesBreakdown.punctual.total, primaryCurrency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-dark-600 overflow-hidden">
                <div className="px-3 py-2 bg-dark-750 border-b border-dark-600">
                  <p className="text-white text-sm font-medium">{t('pages.cashFlow.recurrentExpenses')}</p>
                  <p className="text-dark-500 text-xs">
                    {t('pages.cashFlow.allFrequencies')}
                  </p>
                </div>
                <div className="divide-y divide-dark-700">
                  {expensesRecurringFreqRows.map(([fk, amt]) => (
                    <div key={fk} className="flex items-center justify-between p-3 bg-dark-700/50">
                      <span className="text-dark-300 text-sm">{labelCashFlowFrequency(fk, t)}</span>
                      <span className={amt === 0 ? 'text-dark-500 text-sm' : 'text-white font-medium'}>
                        {fc(amt, primaryCurrency)}{' '}
                        <span className="text-dark-500 text-xs">({pctOf(amt, expensesBreakdown.total)}%)</span>
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2 bg-dark-800">
                    <span className="text-dark-400 text-xs">{t('pages.cashFlow.recurrentSubtotal')}</span>
                    <span className="text-dark-200 text-sm font-semibold">
                      {fc(expensesBreakdown.recurring.total, primaryCurrency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                <div>
                  <p className="text-dark-400 text-sm">{t('pages.cashFlow.accountsPayablePaid')}</p>
                  <p className="text-lg font-semibold text-white">
                    {fc(expensesBreakdown.accountsPayable, primaryCurrency)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-dark-400">{pctOf(expensesBreakdown.accountsPayable, expensesBreakdown.total)}%</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-600/20 border border-red-600 rounded-lg">
                <div>
                  <p className="text-red-400 text-sm font-medium">{t('pages.cashFlow.totalExpenses')}</p>
                  <p className="text-2xl font-bold text-red-400">
                    {fc(expensesBreakdown.total, primaryCurrency)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-red-400">100%</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default CashFlow;
