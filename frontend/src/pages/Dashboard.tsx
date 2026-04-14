import React, { useEffect, useState } from 'react';
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
  RadialBarChart,
  RadialBar,
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
} from 'lucide-react';
import toast from 'react-hot-toast';

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

  useEffect(() => {
    fetchHealthData();
  }, [activeTab]);

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

  const fetchHealthData = async () => {
    try {
      setHealthLoading(true);
      let response;
      const today = new Date();

      switch (activeTab) {
        case 'day':
          response = await api.get('/dashboard/daily-health', {
            params: { date: today.toISOString().split('T')[0] },
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
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  const COLORS = ['#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'];

  const expensesData = stats
    ? Object.entries(stats.expensesByCategory).map(([name, value]) => ({
        name,
        value: Math.round(value),
      }))
    : [];

  const incomeVsExpensesData = stats
    ? [
        {
          name: 'Ingresos',
          value: Math.round(stats.incomeVsExpenses.income),
        },
        {
          name: 'Gastos',
          value: Math.round(stats.incomeVsExpenses.expenses),
        },
      ]
    : [];

  const getHealthStatus = (score: number) => {
    if (score >= 80) return { text: 'Excelente', color: 'text-green-400' };
    if (score >= 70) return { text: 'Buena', color: 'text-green-400' };
    if (score >= 50) return { text: 'Regular', color: 'text-yellow-400' };
    return { text: 'Necesita Mejora', color: 'text-red-400' };
  };

  const renderHealthContent = () => {
    if (healthLoading || !healthData) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      );
    }

    const healthStatus = getHealthStatus(healthData.healthScore);
    const healthScoreData = [
      {
        name: 'Salud Financiera',
        value: healthData.healthScore,
        fill: healthData.healthScore >= 70 ? '#10b981' : healthData.healthScore >= 50 ? '#f59e0b' : '#ef4444',
      },
    ];

    const healthExpensesData = Object.entries(healthData.expenses.byCategory).map(([name, value]) => ({
      name,
      value: Math.round(value),
    }));

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

    return (
      <>
        {/* Health Score Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg sm:text-xl font-semibold text-white mb-2">Salud Financiera</h2>
              <div className="flex flex-col xs:flex-row xs:items-center gap-4">
                <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 mx-auto xs:mx-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart
                      innerRadius="60%"
                      outerRadius="90%"
                      data={healthScoreData}
                      startAngle={90}
                      endAngle={-270}
                    >
                      <RadialBar dataKey="value" cornerRadius={10} fill={healthScoreData[0].fill} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-2xl font-bold text-white">{Math.round(healthData.healthScore)}</span>
                  </div>
                </div>
                <div className="text-center xs:text-left">
                  <p className={`text-xl sm:text-2xl font-bold ${healthStatus.color} mb-1`}>{healthStatus.text}</p>
                  <p className="text-dark-400 text-sm">Puntuación: {Math.round(healthData.healthScore)}/100</p>
                </div>
              </div>
            </div>
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-primary-600 rounded-lg flex items-center justify-center shrink-0 self-center sm:self-auto">
              <Heart className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
            </div>
          </div>
        </motion.div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">Ingresos Totales</p>
                <p className="text-2xl font-bold text-white">
                  ${healthData.income.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">DOP</p>
                {healthData.income.change !== 0 && (
                  <div className={`flex items-center gap-1 mt-2 ${healthData.income.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {healthData.income.change >= 0 ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span className="text-xs">{Math.abs(healthData.income.change).toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
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
                <p className="text-dark-400 text-sm mb-1">Gastos Totales</p>
                <p className="text-2xl font-bold text-red-400">
                  ${healthData.expenses.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">DOP</p>
                {healthData.expenses.change !== 0 && (
                  <div className={`flex items-center gap-1 mt-2 ${healthData.expenses.change <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {healthData.expenses.change <= 0 ? (
                      <TrendingDown className="w-4 h-4" />
                    ) : (
                      <TrendingUp className="w-4 h-4" />
                    )}
                    <span className="text-xs">{Math.abs(healthData.expenses.change).toFixed(1)}%</span>
                  </div>
                )}
              </div>
              <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">Ahorros</p>
                <p
                  className={`text-2xl font-bold ${healthData.savings.amount >= 0 ? 'text-green-400' : 'text-red-400'}`}
                >
                  ${healthData.savings.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">Tasa: {healthData.savings.rate.toFixed(1)}%</p>
              </div>
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <PiggyBank className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">Deudas Totales</p>
                <p className="text-2xl font-bold text-orange-400">
                  ${healthData.debts.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">
                  Deuda/Ingreso: {healthData.ratios.debtToIncome.toFixed(1)}%
                </p>
              </div>
              <div className="w-12 h-12 bg-orange-600 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 min-w-0">
          {/* Expenses by Category */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="card"
          >
            <h2 className="text-xl font-semibold text-white mb-4">Gastos por Categoría</h2>
            {healthExpensesData.length > 0 ? (
              <div className="chart-box h-[240px] xs:h-[260px] sm:h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={healthExpensesData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {healthExpensesData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-dark-400">
                No hay datos de gastos disponibles
              </div>
            )}
          </motion.div>

          {/* Income vs Expenses */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="card"
          >
            <h2 className="text-xl font-semibold text-white mb-4">Ingresos vs Gastos</h2>
            {healthIncomeVsExpensesData.length > 0 ? (
              <div className="chart-box h-[220px] sm:h-[280px]">
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
              <div className="flex items-center justify-center h-64 text-dark-400">
                No hay datos disponibles
              </div>
            )}
          </motion.div>
        </div>

        {/* Financial Ratios */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card"
        >
          <h2 className="text-xl font-semibold text-white mb-4">Ratios Financieros</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-dark-400">Tasa de Ahorro</span>
                <span className={`font-semibold ${healthData.savings.rate >= 20 ? 'text-green-400' : healthData.savings.rate >= 10 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {healthData.savings.rate.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-dark-600 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${healthData.savings.rate >= 20 ? 'bg-green-500' : healthData.savings.rate >= 10 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, healthData.savings.rate))}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-dark-400">Ratio Deuda/Ingreso</span>
                <span className={`font-semibold ${healthData.ratios.debtToIncome <= 20 ? 'text-green-400' : healthData.ratios.debtToIncome <= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {healthData.ratios.debtToIncome.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-dark-600 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${healthData.ratios.debtToIncome <= 20 ? 'bg-green-500' : healthData.ratios.debtToIncome <= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, healthData.ratios.debtToIncome)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-dark-400">Ratio Gasto/Ingreso</span>
                <span className={`font-semibold ${healthData.ratios.expenseToIncome <= 70 ? 'text-green-400' : healthData.ratios.expenseToIncome <= 90 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {healthData.ratios.expenseToIncome.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-dark-600 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${healthData.ratios.expenseToIncome <= 70 ? 'bg-green-500' : healthData.ratios.expenseToIncome <= 90 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, healthData.ratios.expenseToIncome)}%` }}
                />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Annual Chart - Only for year tab */}
        {activeTab === 'year' && 'monthlyData' in healthData && healthData.monthlyData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="card"
          >
            <h2 className="text-xl font-semibold text-white mb-4">Tendencias Mensuales</h2>
            <div className="chart-box h-[280px] sm:h-[360px] lg:h-[400px]">
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Resumen</h1>
          <p className="text-dark-400 text-sm sm:text-base">Resumen de tu situación financiera</p>
        </div>
        {/* Tabs: scroll horizontal en pantallas estrechas */}
        <div className="w-full lg:w-auto -mx-1 px-1 overflow-x-auto overscroll-x-contain pb-1">
          <div className="flex gap-1 bg-dark-800 rounded-lg p-1 min-w-max sm:min-w-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setActiveTab('day')}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 sm:py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 ${
              activeTab === 'day'
                ? 'bg-primary-600 text-white'
                : 'text-dark-400 hover:text-white hover:bg-dark-700'
            }`}
          >
            Día
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('week')}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 sm:py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 ${
              activeTab === 'week'
                ? 'bg-primary-600 text-white'
                : 'text-dark-400 hover:text-white hover:bg-dark-700'
            }`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('month')}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 sm:py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 ${
              activeTab === 'month'
                ? 'bg-primary-600 text-white'
                : 'text-dark-400 hover:text-white hover:bg-dark-700'
            }`}
          >
            Mes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('year')}
            className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2.5 sm:py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap min-h-[44px] sm:min-h-0 ${
              activeTab === 'year'
                ? 'bg-primary-600 text-white'
                : 'text-dark-400 hover:text-white hover:bg-dark-700'
            }`}
          >
            Año
          </button>
          </div>
        </div>
      </div>

      {/* Summary Cards - Always visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-400 text-sm mb-1">Activos Totales</p>
              <p className="text-2xl font-bold text-white">
                ${summary?.assets.dopUnified.toLocaleString('es-DO', { minimumFractionDigits: 2 }) || '0.00'}
              </p>
              <p className="text-xs text-dark-400 mt-1">DOP</p>
            </div>
            <div className="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-white" />
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
              <p className="text-dark-400 text-sm mb-1">Deudas Totales</p>
              <p className="text-2xl font-bold text-red-400">
                ${summary?.debts.dopUnified.toLocaleString('es-DO', { minimumFractionDigits: 2 }) || '0.00'}
              </p>
              <p className="text-xs text-dark-400 mt-1">DOP</p>
            </div>
            <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-400 text-sm mb-1">Patrimonio Neto</p>
              <p
                className={`text-2xl font-bold ${
                  (summary?.netWorth.dopUnified || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                }`}
              >
                ${summary?.netWorth.dopUnified.toLocaleString('es-DO', { minimumFractionDigits: 2 }) || '0.00'}
              </p>
              <p className="text-xs text-dark-400 mt-1">DOP</p>
            </div>
            <div
              className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                (summary?.netWorth.dopUnified || 0) >= 0 ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              {(summary?.netWorth.dopUnified || 0) >= 0 ? (
                <TrendingUp className="w-6 h-6 text-white" />
              ) : (
                <TrendingDown className="w-6 h-6 text-white" />
              )}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-400 text-sm mb-1">Tasa de Cambio</p>
              <p className="text-2xl font-bold text-white">
                {summary?.exchangeRate.toFixed(2) || '55.00'}
              </p>
              <p className="text-xs text-dark-400 mt-1">DOP/USD</p>
            </div>
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-white" />
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
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">Cuentas por Pagar</p>
                <p className="text-2xl font-bold text-orange-400">
                  ${summary.accountsPayable.totalDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">{summary.accountsPayable.count} pendiente{summary.accountsPayable.count !== 1 ? 's' : ''}</p>
              </div>
              <div className="w-12 h-12 bg-orange-600 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">Cuentas por Cobrar</p>
                <p className="text-2xl font-bold text-green-400">
                  ${summary.accountsReceivable.totalDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">{summary.accountsReceivable.count} pendiente{summary.accountsReceivable.count !== 1 ? 's' : ''}</p>
              </div>
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                <Receipt className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">Presupuestos Activos</p>
                <p className="text-2xl font-bold text-blue-400">
                  {summary.activeBudgets}
                </p>
                <p className="text-xs text-dark-400 mt-1">Este mes/año</p>
              </div>
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">Metas Financieras</p>
                <p className="text-2xl font-bold text-purple-400">
                  {summary.activeGoals}
                </p>
                <p className="text-xs text-dark-400 mt-1">Activa{summary.activeGoals !== 1 ? 's' : ''}</p>
              </div>
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
                <Target className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {summary && summary.vehicles > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="card"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-dark-400 text-sm mb-1">Vehículos Registrados</p>
              <p className="text-2xl font-bold text-cyan-400">
                {summary.vehicles}
              </p>
              <p className="text-xs text-dark-400 mt-1">Vehículo{summary.vehicles !== 1 ? 's' : ''}</p>
            </div>
            <div className="w-12 h-12 bg-cyan-600 rounded-lg flex items-center justify-center">
              <Car className="w-6 h-6 text-white" />
            </div>
          </div>
        </motion.div>
      )}

      {/* Health Content based on active tab */}
      {renderHealthContent()}

      {/* Debt Progress - Always visible */}
      {stats && stats.debtProgress.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="card"
        >
          <h2 className="text-xl font-semibold text-white mb-4">Progreso de Préstamos</h2>
          <div className="space-y-4">
            {stats.debtProgress.map((loan) => (
              <div key={loan.id} className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-white">
                    {loan.bankName ? `${loan.bankName} - ` : ''}{loan.loanName}
                  </h3>
                  <span className="text-sm text-dark-400">
                    {loan.paidInstallments}/{loan.totalInstallments} cuotas
                  </span>
                </div>
                <div className="w-full bg-dark-600 rounded-full h-2 mb-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${loan.progress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
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
