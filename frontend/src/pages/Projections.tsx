import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { TrendingUp, TrendingDown, DollarSign, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';

interface MonthlyProjection {
  month: string;
  monthNumber: number;
  year: number;
  projectedIncome: number;
  projectedExpenses: number;
  netFlow: number;
  projectedBalance: number;
}

interface ProjectionSummary {
  totalProjectedIncome: number;
  totalProjectedExpenses: number;
  totalNetFlow: number;
  finalProjectedBalance: number;
  avgMonthlyIncome: number;
  avgMonthlyExpenses: number;
}

const Projections: React.FC = () => {
  const [projections, setProjections] = useState<MonthlyProjection[]>([]);
  const [summary, setSummary] = useState<ProjectionSummary | null>(null);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);
  const [projectionPage, setProjectionPage] = useState(1);

  useEffect(() => {
    fetchProjections();
  }, [months]);

  useEffect(() => {
    setProjectionPage(1);
  }, [months]);

  const projectionTotalPages = Math.max(1, Math.ceil(projections.length / TABLE_PAGE_SIZE));
  const projectionPageSafe = Math.min(projectionPage, projectionTotalPages);
  const pagedProjections = useMemo(() => {
    const start = (projectionPageSafe - 1) * TABLE_PAGE_SIZE;
    return projections.slice(start, start + TABLE_PAGE_SIZE);
  }, [projections, projectionPageSafe]);

  useEffect(() => {
    setProjectionPage((p) => Math.min(p, projectionTotalPages));
  }, [projectionTotalPages]);

  const fetchProjections = async () => {
    try {
      setLoading(true);
      const response = await api.get('/projections', { params: { months } });
      setProjections(response.data.data.monthlyProjections);
      setSummary(response.data.data.summary);
      setCurrentBalance(response.data.data.currentBalance);
    } catch (error: any) {
      toast.error('Error al cargar proyecciones');
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Proyecciones</h1>
          <p className="text-dark-400 text-sm sm:text-base">Proyección de tu flujo de caja futuro</p>
        </div>
        <div className="flex flex-col xs:flex-row xs:items-center gap-2 w-full sm:w-auto">
          <label className="text-dark-400 text-sm shrink-0">Meses a proyectar:</label>
          <select
            value={months}
            onChange={(e) => setMonths(parseInt(e.target.value))}
            className="input w-full sm:w-auto sm:min-w-[10rem]"
          >
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
            <option value="24">24 meses</option>
          </select>
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
                <p className="text-dark-400 text-sm mb-1">Saldo Actual</p>
                <p
                  className={`text-2xl font-bold ${
                    currentBalance >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  ${currentBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">DOP</p>
              </div>
              <div className="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center">
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
                <p className="text-dark-400 text-sm mb-1">Ingresos Proyectados</p>
                <p className="text-2xl font-bold text-green-400">
                  ${summary.totalProjectedIncome.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">Promedio: ${summary.avgMonthlyIncome.toLocaleString('es-DO', { minimumFractionDigits: 2 })}/mes</p>
              </div>
              <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
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
                <p className="text-dark-400 text-sm mb-1">Gastos Proyectados</p>
                <p className="text-2xl font-bold text-red-400">
                  ${summary.totalProjectedExpenses.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                </p>
                <p className="text-xs text-dark-400 mt-1">Promedio: ${summary.avgMonthlyExpenses.toLocaleString('es-DO', { minimumFractionDigits: 2 })}/mes</p>
              </div>
              <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center">
                <TrendingDown className="w-6 h-6 text-white" />
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
                <p className="text-dark-400 text-sm mb-1">Saldo Proyectado</p>
                <p
                  className={`text-2xl font-bold ${
                    summary.finalProjectedBalance >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  ${summary.finalProjectedBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
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
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Ingresos vs Gastos Proyectados</h2>
          <div className="chart-box h-[240px] sm:h-[280px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projections}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="month"
                stroke="#94a3b8"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              />
              <Legend />
              <Bar dataKey="projectedIncome" fill="#10b981" name="Ingresos" />
              <Bar dataKey="projectedExpenses" fill="#ef4444" name="Gastos" />
            </BarChart>
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
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Flujo Neto Proyectado</h2>
          <div className="chart-box h-[240px] sm:h-[280px] md:h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={projections}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="month"
                stroke="#94a3b8"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 12 }}
              />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              />
              <Bar dataKey="netFlow" name="Flujo Neto">
                {projections.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.netFlow >= 0 ? '#10b981' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      {/* Projected Balance Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="card min-w-0"
      >
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Saldo Proyectado Acumulado</h2>
        <div className="chart-box h-[280px] sm:h-[340px] md:h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={projections}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="month"
              stroke="#94a3b8"
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fontSize: 12 }}
            />
            <YAxis stroke="#94a3b8" />
            <Tooltip
              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
            />
            <Line
              type="monotone"
              dataKey="projectedBalance"
              stroke="#0ea5e9"
              strokeWidth={3}
              dot={{ fill: '#0ea5e9', r: 4 }}
              name="Saldo Proyectado"
            />
          </LineChart>
        </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Monthly Projections Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="card"
      >
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">Proyecciones Mensuales</h2>
        <div className="table-responsive table-stack">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th className="text-left py-3 px-4 text-dark-400 font-medium">Mes</th>
                <th className="text-right py-3 px-4 text-dark-400 font-medium">Ingresos</th>
                <th className="text-right py-3 px-4 text-dark-400 font-medium">Gastos</th>
                <th className="text-right py-3 px-4 text-dark-400 font-medium">Flujo Neto</th>
                <th className="text-right py-3 px-4 text-dark-400 font-medium">Saldo Proyectado</th>
              </tr>
            </thead>
            <tbody>
              {pagedProjections.map((projection, index) => (
                <tr key={`${projection.month}-${projection.year}-${index}`} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                  <td data-label="Mes" className="py-3 px-4">
                    <span className="table-stack-value">{projection.month}</span>
                  </td>
                  <td data-label="Ingresos" className="py-3 px-4 text-right text-green-400 md:text-right">
                    <span className="table-stack-value text-green-400">
                      ${projection.projectedIncome.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td data-label="Gastos" className="py-3 px-4 text-right text-red-400 md:text-right">
                    <span className="table-stack-value text-red-400">
                      ${projection.projectedExpenses.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td
                    data-label="Flujo neto"
                    className={`py-3 px-4 text-right font-semibold md:text-right ${
                      projection.netFlow >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    <span className={`table-stack-value font-semibold ${projection.netFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${projection.netFlow.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td
                    data-label="Saldo proyectado"
                    className={`py-3 px-4 text-right font-semibold md:text-right ${
                      projection.projectedBalance >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    <span className={`table-stack-value font-semibold ${projection.projectedBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ${projection.projectedBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {projectionTotalPages > 1 && (
          <div className="border-t border-dark-700 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-dark-400">
                Mostrando {(projectionPageSafe - 1) * TABLE_PAGE_SIZE + 1} –{' '}
                {Math.min(projectionPageSafe * TABLE_PAGE_SIZE, projections.length)} de {projections.length} meses
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setProjectionPage((p) => Math.max(1, p - 1))}
                  disabled={projectionPageSafe <= 1}
                  className="px-3 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  <ChevronLeft size={18} />
                  Anterior
                </button>
                <span className="text-sm text-dark-400 px-2 tabular-nums">
                  Página {projectionPageSafe} de {projectionTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setProjectionPage((p) => Math.min(projectionTotalPages, p + 1))}
                  disabled={projectionPageSafe >= projectionTotalPages}
                  className="px-3 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  Siguiente
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default Projections;
