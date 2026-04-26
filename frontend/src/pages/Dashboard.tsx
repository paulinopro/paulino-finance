import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import {
  DashboardSummary,
  DashboardStats,
  DailyHealthData,
  WeeklyHealthData,
  MonthlyHealthData,
  AnnualHealthData,
} from '../types';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  AlertCircle,
  Heart,
  DollarSign,
  PiggyBank,
  FileText,
  Receipt,
  Target,
  Car,
  Calendar,
  Landmark,
  Banknote,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { todayYmdLocal } from '../utils/dateUtils';
import { CATEGORY_CHART_COLORS } from '../constants/chartColors';
import PageHeader from '../components/PageHeader';

type TabType = 'day' | 'week' | 'month' | 'year';

const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('month');
  const [healthData, setHealthData] = useState<DailyHealthData | WeeklyHealthData | MonthlyHealthData | AnnualHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [summaryRes, statsRes] = await Promise.all([
        api.get('/dashboard/summary'),
        api.get('/dashboard/stats'),
      ]);

      setSummary(summaryRes.data.summary);
      setStats(statsRes.data.stats);
    } catch (error: any) {
      toast.error('Error al cargar datos del dashboard');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHealthData = useCallback(async () => {
    try {
      setHealthLoading(true);
      let response;
      const today = new Date();

      switch (activeTab) {
        case 'day':
          response = await api.get('/dashboard/daily-health', {
            params: { date: todayYmdLocal() },
          });
          break;
        case 'week':
          response = await api.get('/dashboard/weekly-health');
          break;
        case 'month':
          response = await api.get('/dashboard/monthly-health', {
            params: { month: today.getMonth() + 1, year: today.getFullYear() },
          });
          break;
        case 'year':
          response = await api.get('/dashboard/annual-health', {
            params: { year: today.getFullYear() },
          });
          break;
      }

      setHealthData(response.data.data);
    } catch (error: any) {
      toast.error(`Error al cargar datos de salud financiera`);
      console.error(error);
    } finally {
      setHealthLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchHealthData();
  }, [fetchHealthData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const getHealthStatus = (score: number) => {
    if (score >= 80) return { text: 'Excelente', color: 'text-green-400' };
    if (score >= 70) return { text: 'Buena', color: 'text-green-400' };
    if (score >= 50) return { text: 'Regular', color: 'text-yellow-400' };
    return { text: 'Necesita Mejora', color: 'text-red-400' };
  };

  const renderHealthContent = () => {
    if (healthLoading || !healthData) {
      return (
        <div className="flex h-44 items-center justify-center rounded-2xl border border-dark-600/40 bg-dark-800/50">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-primary-500" />
        </div>
      );
    }

    const healthStatus = getHealthStatus(healthData.healthScore);
    const scoreRounded = Math.min(100, Math.max(0, Math.round(healthData.healthScore)));
    const scoreRingColor =
      healthData.healthScore >= 70 ? '#10b981' : healthData.healthScore >= 50 ? '#f59e0b' : '#ef4444';
    const ringR = 26;
    const ringC = 2 * Math.PI * ringR;
    const ringDash = (scoreRounded / 100) * ringC;

    const healthExpensesData = Object.entries(healthData.expenses.byCategory).map(([name, value]) => ({
      name,
      value: Math.round(value),
    }));
    const healthExpensesSorted = [...healthExpensesData].sort((a, b) => b.value - a.value);
    const healthExpensesTotal = healthExpensesSorted.reduce((sum, d) => sum + d.value, 0);

    const healthIncomeVsExpensesData = [
      {
        name: 'Ingresos',
        value: Math.round(healthData.income.total),
      },
      {
        name: 'Gastos',
        value: Math.round(healthData.expenses.total),
      },
    ];

    const savingsRate = healthData.savings.rate;
    const debtRatio = healthData.ratios.debtToIncome;
    const expenseRatio = healthData.ratios.expenseToIncome;

    return (
      <>
        {/* Salud: puntuación, ratios y KPIs en un solo bloque compacto */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-panel !p-4 sm:!p-5"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 sm:h-[4.75rem] sm:w-[4.75rem]">
                <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90" role="img" aria-label={`Puntuación ${scoreRounded} de 100`}>
                  <circle cx="32" cy="32" r={ringR} fill="none" stroke="#334155" strokeOpacity={0.95} strokeWidth="5" />
                  <circle
                    cx="32"
                    cy="32"
                    r={ringR}
                    fill="none"
                    stroke={scoreRingColor}
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray={`${ringDash} ${ringC}`}
                    className="transition-[stroke-dasharray] duration-500"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
                  <span className="text-xl font-bold tabular-nums text-white sm:text-2xl">{scoreRounded}</span>
                  <span className="mt-0.5 text-[0.65rem] font-medium text-dark-500">/100</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold text-white sm:text-lg">Salud Financiera</h2>
                  <Heart className="h-4 w-4 shrink-0 text-rose-400/90" aria-hidden />
                </div>
                <p className={`mt-0.5 text-sm font-semibold sm:text-base ${healthStatus.color}`}>{healthStatus.text}</p>
              </div>
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:max-w-2xl">
              <div className="rounded-lg border border-dark-600/35 bg-dark-900/40 px-3 py-2 ring-1 ring-white/5">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide text-dark-500">Ahorro</span>
                  <span
                    className={`shrink-0 text-xs font-semibold tabular-nums ${savingsRate >= 20 ? 'text-green-400' : savingsRate >= 10 ? 'text-yellow-400' : 'text-red-400'
                      }`}
                  >
                    {savingsRate.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-dark-700/90 ring-1 ring-white/5">
                  <div
                    className={`h-1.5 rounded-full ${savingsRate >= 20 ? 'bg-green-500' : savingsRate >= 10 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                    style={{ width: `${Math.min(100, Math.max(0, savingsRate))}%` }}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-dark-600/35 bg-dark-900/40 px-3 py-2 ring-1 ring-white/5">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide text-dark-500">Deuda / ingreso</span>
                  <span
                    className={`shrink-0 text-xs font-semibold tabular-nums ${debtRatio <= 20 ? 'text-green-400' : debtRatio <= 40 ? 'text-yellow-400' : 'text-red-400'
                      }`}
                  >
                    {debtRatio.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-dark-700/90 ring-1 ring-white/5">
                  <div
                    className={`h-1.5 rounded-full ${debtRatio <= 20 ? 'bg-green-500' : debtRatio <= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                    style={{ width: `${Math.min(100, Math.max(0, debtRatio))}%` }}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-dark-600/35 bg-dark-900/40 px-3 py-2 ring-1 ring-white/5">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[0.65rem] font-medium uppercase tracking-wide text-dark-500">Gasto / ingreso</span>
                  <span
                    className={`shrink-0 text-xs font-semibold tabular-nums ${expenseRatio <= 70 ? 'text-green-400' : expenseRatio <= 90 ? 'text-yellow-400' : 'text-red-400'
                      }`}
                  >
                    {expenseRatio.toFixed(1)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-dark-700/90 ring-1 ring-white/5">
                  <div
                    className={`h-1.5 rounded-full ${expenseRatio <= 70 ? 'bg-green-500' : expenseRatio <= 90 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                    style={{ width: `${Math.min(100, Math.max(0, expenseRatio))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-dark-600/30 pt-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="dashboard-stat-widget !p-3 sm:!p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="dashboard-stat-label !mb-0.5">Ingresos</p>
                  <p className="truncate text-lg font-bold tabular-nums text-white sm:text-xl">
                    ${healthData.income.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-0.5 text-[0.65rem] text-dark-500">DOP</p>
                  {healthData.income.change !== 0 && (
                    <div
                      className={`mt-1 flex items-center gap-0.5 text-[0.7rem] ${healthData.income.change >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                    >
                      {healthData.income.change >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                      <span>{Math.abs(healthData.income.change).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                <div className="dashboard-icon-tile !h-10 !w-10 shrink-0 from-emerald-600 to-green-700">
                  <DollarSign className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>

            <div className="dashboard-stat-widget !p-3 sm:!p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="dashboard-stat-label !mb-0.5">Gastos</p>
                  <p className="truncate text-lg font-bold tabular-nums text-red-400 sm:text-xl">
                    ${healthData.expenses.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-0.5 text-[0.65rem] text-dark-500">DOP</p>
                  {healthData.expenses.change !== 0 && (
                    <div
                      className={`mt-1 flex items-center gap-0.5 text-[0.7rem] ${healthData.expenses.change <= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                    >
                      {healthData.expenses.change <= 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                      <span>{Math.abs(healthData.expenses.change).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
                <div className="dashboard-icon-tile !h-10 !w-10 shrink-0 from-rose-600 to-red-700">
                  <CreditCard className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>

            <div className="dashboard-stat-widget !p-3 sm:!p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="dashboard-stat-label !mb-0.5">Ahorro neto</p>
                  <p
                    className={`truncate text-lg font-bold tabular-nums sm:text-xl ${healthData.savings.amount >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                  >
                    ${healthData.savings.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-0.5 text-[0.65rem] text-dark-500">DOP · tasa {savingsRate.toFixed(1)}%</p>
                </div>
                <div className="dashboard-icon-tile !h-10 !w-10 shrink-0 from-sky-600 to-blue-700">
                  <PiggyBank className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>

            <div className="dashboard-stat-widget !p-3 sm:!p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="dashboard-stat-label !mb-0.5">Deudas</p>
                  <p className="truncate text-lg font-bold tabular-nums text-orange-400 sm:text-xl">
                    ${healthData.debts.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="mt-0.5 text-[0.65rem] text-dark-500">DOP · saldos actuales</p>
                </div>
                <div className="dashboard-icon-tile !h-10 !w-10 shrink-0 from-amber-600 to-orange-700">
                  <AlertCircle className="h-5 w-5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Charts */}
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
          {/* Expenses by Category */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="dashboard-panel !p-4 sm:!p-5"
          >
            <h2 className="dashboard-panel-title !mb-3">Gastos por Categoría</h2>
            {healthExpensesSorted.length > 0 ? (
              <div className="flex min-h-0 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-5">
                <div className="chart-box mx-auto h-[200px] w-full max-w-[280px] shrink-0 sm:h-[220px] lg:mx-0 lg:h-[240px] lg:max-w-[min(100%,320px)]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={healthExpensesSorted}
                        cx="50%"
                        cy="50%"
                        innerRadius="48%"
                        outerRadius="78%"
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        stroke="#0f172a"
                        strokeWidth={2}
                      >
                        {healthExpensesSorted.map((_, index) => (
                          <Cell key={`cat-cell-${index}`} fill={CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const p = payload[0].payload as { name: string; value: number };
                          const pct =
                            healthExpensesTotal > 0 ? ((p.value / healthExpensesTotal) * 100).toFixed(1) : '0';
                          return (
                            <div className="rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 shadow-lg">
                              <p className="font-medium text-white">{p.name}</p>
                              <p className="text-sm tabular-nums text-dark-300">
                                ${p.value.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP
                                <span className="text-dark-500"> · {pct}%</span>
                              </p>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-dark-600/40 bg-dark-900/45 p-2.5 ring-1 ring-white/5 sm:p-3 lg:max-h-[240px]">
                  <p className="mb-2 text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500">Distribución</p>
                  <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 sm:gap-x-3">
                    {healthExpensesSorted.map((row, index) => {
                      const pct =
                        healthExpensesTotal > 0 ? (row.value / healthExpensesTotal) * 100 : 0;
                      const fill = CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length];
                      return (
                        <li key={row.name} className="flex min-w-0 items-start gap-2.5">
                          <span
                            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/10"
                            style={{ backgroundColor: fill }}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-white" title={row.name}>
                              {row.name}
                            </p>
                            <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                              <span className="tabular-nums text-xs text-dark-400">
                                ${row.value.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP
                              </span>
                              <span className="shrink-0 tabular-nums text-xs font-semibold text-primary-300">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-dark-400">
                No hay datos de gastos disponibles
              </div>
            )}
          </motion.div>

          {/* Income vs Expenses */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className="dashboard-panel !p-4 sm:!p-5"
          >
            <h2 className="dashboard-panel-title !mb-3">Ingresos vs Gastos</h2>
            {healthIncomeVsExpensesData.length > 0 ? (
              <div className="chart-box h-[180px] sm:h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={healthIncomeVsExpensesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="name" stroke="#94a3b8" />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    />
                    <Bar dataKey="value" fill="#0ea5e9" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-dark-400">
                No hay datos disponibles
              </div>
            )}
          </motion.div>
        </div>

        {/* Annual Chart - Only for year tab */}
        {activeTab === 'year' && 'monthlyData' in healthData && healthData.monthlyData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="dashboard-panel !p-4 sm:!p-5"
          >
            <h2 className="dashboard-panel-title !mb-3">Tendencias Mensuales</h2>
            <div className="chart-box h-[240px] sm:h-[300px] lg:h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={healthData.monthlyData.map((d) => ({
                  month: d.monthName,
                  Ingresos: Math.round(d.income),
                  Gastos: Math.round(d.expenses),
                  Ahorros: Math.round(d.savings),
                }))}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="month" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="Ingresos" stroke="#10b981" fillOpacity={1} fill="url(#colorIncome)" />
                  <Area type="monotone" dataKey="Gastos" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpenses)" />
                  <Area type="monotone" dataKey="Ahorros" stroke="#0ea5e9" fillOpacity={1} fill="url(#colorSavings)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}
      </>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="Resumen"
        subtitle="Resumen de tu situación financiera"
        actions={
          <div className="w-full lg:w-auto -mx-1 px-1 overflow-x-auto overscroll-x-contain pb-1">
            <div className="flex gap-1 bg-dark-800 rounded-lg p-1 min-w-max sm:min-w-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveTab('day')}
                className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 sm:py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 ${activeTab === 'day'
                    ? 'bg-primary-600 text-white'
                    : 'text-dark-400 hover:text-white hover:bg-dark-700'
                  }`}
              >
                Día
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('week')}
                className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 sm:py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 ${activeTab === 'week'
                    ? 'bg-primary-600 text-white'
                    : 'text-dark-400 hover:text-white hover:bg-dark-700'
                  }`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('month')}
                className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 sm:py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 ${activeTab === 'month'
                    ? 'bg-primary-600 text-white'
                    : 'text-dark-400 hover:text-white hover:bg-dark-700'
                  }`}
              >
                Mes
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('year')}
                className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 sm:py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 ${activeTab === 'year'
                    ? 'bg-primary-600 text-white'
                    : 'text-dark-400 hover:text-white hover:bg-dark-700'
                  }`}
              >
                Año
              </button>
            </div>
          </div>
        }
      />

      {/* Summary Cards - Always visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="dashboard-stat-widget"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="dashboard-stat-label">Activos Totales</p>
              <p className="dashboard-stat-value text-white">
                ${summary?.assets.dopUnified.toLocaleString('es-DO', { minimumFractionDigits: 2 }) || '0.00'}
              </p>
              <p className="mt-1 text-xs text-dark-400">DOP equivalente</p>
              {summary?.assets.byKind && (
                <p className="mt-2 text-[0.7rem] text-dark-500 leading-snug max-w-[14rem]">
                  🏦 Banco{' '}
                  {summary.assets.byKind.bank.dopUnified.toLocaleString('es-DO', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}{' '}
                  · 💵 Efectivo{' '}
                  {summary.assets.byKind.cash.dopUnified.toLocaleString('es-DO', {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </p>
              )}
            </div>
            <div className="dashboard-icon-tile from-primary-600 to-primary-800">
              <Wallet className="h-6 w-6 text-white" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="dashboard-stat-widget"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="dashboard-stat-label">Deudas Totales</p>
              <p className="dashboard-stat-value text-red-400">
                ${summary?.debts.dopUnified.toLocaleString('es-DO', { minimumFractionDigits: 2 }) || '0.00'}
              </p>
              <p className="mt-1 text-xs text-dark-400">DOP</p>
            </div>
            <div className="dashboard-icon-tile from-rose-600 to-red-700">
              <CreditCard className="h-6 w-6 text-white" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="dashboard-stat-widget"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="dashboard-stat-label">Patrimonio Neto</p>
              <p
                className={`dashboard-stat-value ${(summary?.netWorth.dopUnified || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
              >
                ${summary?.netWorth.dopUnified.toLocaleString('es-DO', { minimumFractionDigits: 2 }) || '0.00'}
              </p>
              <p className="mt-1 text-xs text-dark-400">DOP</p>
            </div>
            <div
              className={`dashboard-icon-tile ${(summary?.netWorth.dopUnified || 0) >= 0 ? 'from-emerald-600 to-green-700' : 'from-rose-600 to-red-700'
                }`}
            >
              {(summary?.netWorth.dopUnified || 0) >= 0 ? (
                <TrendingUp className="h-6 w-6 text-white" />
              ) : (
                <TrendingDown className="h-6 w-6 text-white" />
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="dashboard-stat-widget"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="dashboard-stat-label">Tasa de Cambio</p>
              <p className="dashboard-stat-value text-white">
                {summary?.exchangeRate != null ? summary.exchangeRate.toFixed(2) : '—'}
              </p>
              <p className="mt-1 text-xs text-dark-400">DOP/USD</p>
            </div>
            <div className="dashboard-icon-tile from-violet-600 to-purple-800">
              <AlertCircle className="h-6 w-6 text-white" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* New Modules Summary */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="dashboard-stat-widget"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="dashboard-stat-label">Cuentas por Pagar</p>
                <p className="dashboard-stat-value text-orange-400">
                  ${summary.accountsPayable.totalDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-xs text-dark-400">{summary.accountsPayable.count} pendiente{summary.accountsPayable.count !== 1 ? 's' : ''}</p>
              </div>
              <div className="dashboard-icon-tile from-amber-600 to-orange-700">
                <FileText className="h-6 w-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="dashboard-stat-widget"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="dashboard-stat-label">Cuentas por Cobrar</p>
                <p className="dashboard-stat-value text-green-400">
                  ${summary.accountsReceivable.totalDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-xs text-dark-400">{summary.accountsReceivable.count} pendiente{summary.accountsReceivable.count !== 1 ? 's' : ''}</p>
              </div>
              <div className="dashboard-icon-tile from-emerald-600 to-green-700">
                <Receipt className="h-6 w-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="dashboard-stat-widget"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="dashboard-stat-label">Presupuestos Activos</p>
                <p className="dashboard-stat-value text-blue-400">
                  {summary.activeBudgets}
                </p>
                <p className="mt-1 text-xs text-dark-400">Este mes/año</p>
              </div>
              <div className="dashboard-icon-tile from-sky-600 to-blue-700">
                <Calendar className="h-6 w-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="dashboard-stat-widget"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="dashboard-stat-label">Metas Financieras</p>
                <p className="dashboard-stat-value text-purple-400">
                  {summary.activeGoals}
                </p>
                <p className="mt-1 text-xs text-dark-400">Activa{summary.activeGoals !== 1 ? 's' : ''}</p>
              </div>
              <div className="dashboard-icon-tile from-fuchsia-600 to-purple-800">
                <Target className="h-6 w-6 text-white" />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="dashboard-stat-widget"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="dashboard-stat-label">Cuentas Registradas</p>
                <p className="dashboard-stat-value text-white">
                  {summary.bankAccounts ?? 0}
                </p>
                <p className="mt-1 text-xs text-dark-400">
                  Cuenta{(summary.bankAccounts ?? 0) !== 1 ? 's' : ''} financiera{(summary.bankAccounts ?? 0) !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="dashboard-icon-tile from-slate-600 to-slate-800">
                <Landmark className="h-6 w-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.82 }}
            className="dashboard-stat-widget"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="dashboard-stat-label">Tarjetas Registradas</p>
                <p className="dashboard-stat-value text-rose-300">
                  {summary.creditCards ?? 0}
                </p>
                <p className="mt-1 text-xs text-dark-400">
                  Tarjeta{(summary.creditCards ?? 0) !== 1 ? 's' : ''} de crédito
                </p>
              </div>
              <div className="dashboard-icon-tile from-rose-600 to-red-800">
                <CreditCard className="h-6 w-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.84 }}
            className="dashboard-stat-widget"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="dashboard-stat-label">Préstamos Registrados</p>
                <p className="dashboard-stat-value text-amber-300">
                  {summary.loans ?? 0}
                </p>
                <p className="mt-1 text-xs text-dark-400">Préstamo{(summary.loans ?? 0) !== 1 ? 's' : ''}</p>
              </div>
              <div className="dashboard-icon-tile from-amber-600 to-orange-800">
                <Banknote className="h-6 w-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.86 }}
            className="dashboard-stat-widget"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="dashboard-stat-label">Vehículos Registrados</p>
                <p className="dashboard-stat-value text-cyan-400">
                  {summary.vehicles}
                </p>
                <p className="mt-1 text-xs text-dark-400">
                  Vehículo{summary.vehicles !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="dashboard-icon-tile from-cyan-600 to-teal-700">
                <Car className="h-6 w-6 text-white" />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Health Content based on active tab */}
      {renderHealthContent()}

      {/* Debt Progress - Always visible */}
      {stats && stats.debtProgress.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="dashboard-panel"
        >
          <h2 className="dashboard-panel-title">Progreso de Préstamos</h2>
          <div className="space-y-4">
            {stats.debtProgress.map((loan) => (
              <div key={loan.id} className="dashboard-debt-row">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="font-medium text-white">
                    {loan.bankName ? `${loan.bankName} - ` : ''}{loan.loanName}
                  </h3>
                  <span className="shrink-0 text-sm tabular-nums text-dark-400">
                    {loan.paidInstallments}/{loan.totalInstallments} cuotas
                  </span>
                </div>
                <div className="mb-2 h-2.5 w-full overflow-hidden rounded-full bg-dark-700/90 ring-1 ring-white/5">
                  <div
                    className="h-2.5 rounded-full bg-gradient-to-r from-primary-600 to-primary-400 shadow-sm transition-all duration-300"
                    style={{ width: `${loan.progress}%` }}
                  />
                </div>
                <div className="flex flex-col gap-1 text-sm xs:flex-row xs:items-center xs:justify-between">
                  <span className="text-dark-400">
                    Pagado: {loan.totalPaid.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {loan.currency}
                  </span>
                  <span className="text-dark-400">
                    Restante: {loan.remaining.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {loan.currency}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default Dashboard;
