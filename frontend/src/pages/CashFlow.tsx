import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { Calendar, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
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
}

interface IncomeBreakdown {
  variableIncome: number;
  fixedIncome: number;
  accountsReceivable: number;
  total: number;
}

interface ExpensesBreakdown {
  nonRecurringExpenses: number;
  recurringExpenses: number;
  accountsPayable: number;
  total: number;
}

const CashFlow: React.FC = () => {
  const [cashFlowData, setCashFlowData] = useState<CashFlowData[]>([]);
  const [summary, setSummary] = useState<CashFlowSummary | null>(null);
  const [incomeBreakdown, setIncomeBreakdown] = useState<IncomeBreakdown | null>(null);
  const [expensesBreakdown, setExpensesBreakdown] = useState<ExpensesBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchCashFlow();
  }, [period]);

  const fetchCashFlow = async () => {
    try {
      setLoading(true);
      const params: any = { period };
      if (startDate && endDate) {
        params.startDate = startDate;
        params.endDate = endDate;
      }

      const response = await api.get('/cash-flow', { params });
      setCashFlowData(response.data.data.dailyData);
      setSummary(response.data.data.summary);
      setIncomeBreakdown(response.data.data.incomeBreakdown || null);
      setExpensesBreakdown(response.data.data.expensesBreakdown || null);
    } catch (error: any) {
      toast.error('Error al cargar flujo de caja');
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      setStartDate('');
      setEndDate('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Flujo de Caja</h1>
          <p className="text-dark-400 text-sm sm:text-base">Análisis de ingresos, gastos y saldo disponible</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 w-full lg:w-auto">
          <select
            value={period}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="input w-full sm:w-auto sm:min-w-[10rem]"
          >
            <option value="month">Este Mes</option>
            <option value="year">Este Año</option>
            <option value="custom">Personalizado</option>
          </select>
          {period === 'custom' && (
            <div className="flex flex-col xs:flex-row xs:items-center gap-2 w-full sm:w-auto">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input flex-1 min-w-0"
              />
              <span className="text-dark-400 text-center xs:px-1">a</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input flex-1 min-w-0"
              />
              <button type="button" onClick={fetchCashFlow} className="btn-primary w-full xs:w-auto shrink-0">
                Aplicar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">Ingresos Totales</p>
                <p className="text-2xl font-bold text-green-400">
                  ${summary.totalIncome.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">DOP</p>
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
                <p className="text-dark-400 text-sm mb-1">Gastos Totales</p>
                <p className="text-2xl font-bold text-red-400">
                  ${summary.totalExpenses.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">DOP</p>
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-dark-400 text-sm mb-1">Flujo Neto</p>
                <p
                  className={`text-2xl font-bold ${
                    summary.netCashFlow >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  ${summary.netCashFlow.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">DOP</p>
              </div>
              <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
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
                <p className="text-dark-400 text-sm mb-1">Saldo Final</p>
                <p
                  className={`text-2xl font-bold ${
                    summary.finalBalance >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  ${summary.finalBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">DOP</p>
              </div>
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
            </div>
          </motion.div>
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
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Ingresos vs Gastos</h2>
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
                tickFormatter={(value) => new Date(value).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}
              />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelFormatter={(value) => new Date(value).toLocaleDateString('es-DO')}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="income"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorIncome)"
                name="Ingresos"
              />
              <Area
                type="monotone"
                dataKey="expenses"
                stroke="#ef4444"
                fillOpacity={1}
                fill="url(#colorExpenses)"
                name="Gastos"
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
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Flujo Neto Diario</h2>
          <div className="chart-box h-[240px] sm:h-[280px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={cashFlowData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="date"
                stroke="#94a3b8"
                tickFormatter={(value) => new Date(value).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}
              />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                labelFormatter={(value) => new Date(value).toLocaleDateString('es-DO')}
              />
              <Line
                type="monotone"
                dataKey="netFlow"
                stroke="#0ea5e9"
                strokeWidth={2}
                dot={false}
                name="Flujo Neto"
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
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Saldo Acumulado</h2>
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
              tickFormatter={(value) => new Date(value).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}
            />
            <YAxis stroke="#94a3b8" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              labelFormatter={(value) => new Date(value).toLocaleDateString('es-DO')}
            />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#0ea5e9"
              fillOpacity={1}
              fill="url(#colorBalance)"
              name="Saldo"
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
            <h2 className="text-xl font-semibold text-white mb-4">Desglose de Ingresos Totales</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                <div>
                  <p className="text-dark-400 text-sm">Ingresos Variables</p>
                  <p className="text-lg font-semibold text-white">
                    ${incomeBreakdown.variableIncome.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-dark-400">
                    {((incomeBreakdown.variableIncome / incomeBreakdown.total) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                <div>
                  <p className="text-dark-400 text-sm">Ingresos Fijos</p>
                  <p className="text-lg font-semibold text-white">
                    ${incomeBreakdown.fixedIncome.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-dark-400">
                    {((incomeBreakdown.fixedIncome / incomeBreakdown.total) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                <div>
                  <p className="text-dark-400 text-sm">Cuentas por Cobrar Recibidas</p>
                  <p className="text-lg font-semibold text-white">
                    ${incomeBreakdown.accountsReceivable.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-dark-400">
                    {((incomeBreakdown.accountsReceivable / incomeBreakdown.total) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-primary-600/20 border border-primary-600 rounded-lg mt-4">
                <div>
                  <p className="text-primary-400 text-sm font-medium">Total de Ingresos</p>
                  <p className="text-2xl font-bold text-green-400">
                    ${incomeBreakdown.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
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
            <h2 className="text-xl font-semibold text-white mb-4">Desglose de Gastos Totales</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                <div>
                  <p className="text-dark-400 text-sm">Gastos No Recurrentes</p>
                  <p className="text-lg font-semibold text-white">
                    ${expensesBreakdown.nonRecurringExpenses.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-dark-400">
                    {((expensesBreakdown.nonRecurringExpenses / expensesBreakdown.total) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                <div>
                  <p className="text-dark-400 text-sm">Gastos Recurrentes</p>
                  <p className="text-lg font-semibold text-white">
                    ${expensesBreakdown.recurringExpenses.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-dark-400">
                    {((expensesBreakdown.recurringExpenses / expensesBreakdown.total) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                <div>
                  <p className="text-dark-400 text-sm">Cuentas por Pagar Pagadas</p>
                  <p className="text-lg font-semibold text-white">
                    ${expensesBreakdown.accountsPayable.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-dark-400">
                    {((expensesBreakdown.accountsPayable / expensesBreakdown.total) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-red-600/20 border border-red-600 rounded-lg mt-4">
                <div>
                  <p className="text-red-400 text-sm font-medium">Total de Gastos</p>
                  <p className="text-2xl font-bold text-red-400">
                    ${expensesBreakdown.total.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
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
