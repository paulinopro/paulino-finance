import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import toast from 'react-hot-toast';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
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

/** Etiqueta de mes legible: primera letra en mayúscula (p. ej. "septiembre 2026" → "Septiembre 2026"). */
function formatProjectionMonthLabel(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (/^\d+$/.test(word)) return word;
      if (!word) return word;
      return word.charAt(0).toLocaleUpperCase('es-DO') + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Abreviaturas de mes en eje (se añade punto: Abr., May., …). */
const MONTH_ABBR_ES: Record<string, string> = {
  enero: 'Ene',
  febrero: 'Feb',
  marzo: 'Mar',
  abril: 'Abr',
  mayo: 'May',
  junio: 'Jun',
  julio: 'Jul',
  agosto: 'Ago',
  septiembre: 'Sep',
  setiembre: 'Sep',
  octubre: 'Oct',
  noviembre: 'Nov',
  diciembre: 'Dic',
};

function getAxisMonthAbbrevParts(raw: string): { abbrDotted: string; year: string } {
  const label = formatProjectionMonthLabel(raw);
  const parts = label.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return { abbrDotted: label, year: '' };
  const year = parts[parts.length - 1];
  if (!/^\d{4}$/.test(year)) return { abbrDotted: label, year: '' };
  const monthName = parts.slice(0, -1).join(' ').toLowerCase();
  const short = MONTH_ABBR_ES[monthName] ?? parts[0].slice(0, 3);
  const abbrDotted = short.endsWith('.') ? short : `${short}.`;
  return { abbrDotted, year };
}

/** Una línea para eje X en escritorio (texto diagonal). */
function formatAxisMonthOneLine(raw: string): string {
  const { abbrDotted, year } = getAxisMonthAbbrevParts(raw);
  if (!year) return formatProjectionMonthLabel(raw);
  return `${abbrDotted} ${year}`;
}

/** Valores permitidos y etiquetas del selector (valor = meses). */
const PROJECTION_HORIZON_OPTIONS: { value: number; label: string }[] = [
  { value: 3, label: '3 meses' },
  { value: 6, label: '6 meses' },
  { value: 12, label: '1 año' },
  { value: 24, label: '2 años' },
  { value: 36, label: '3 años' },
  { value: 48, label: '4 años' },
  { value: 60, label: '5 años' },
  { value: 72, label: '6 años' },
  { value: 84, label: '7 años' },
  { value: 96, label: '8 años' },
  { value: 108, label: '9 años' },
  { value: 120, label: '10 años' },
  { value: 240, label: '20 años' },
  { value: 360, label: '30 años' },
  { value: 480, label: '40 años' },
  { value: 600, label: '50 años' },
];

/** Ancho mínimo por mes proyectado para permitir scroll horizontal en series largas. */
const PROJECTION_PX_PER_MONTH = 42;

/**
 * Contenedor con scroll horizontal: el ancho interno crece con la cantidad de meses (min. el ancho de la tarjeta).
 */
function ProjectionChartHScroll({
  minWidthPx,
  children,
}: {
  minWidthPx: number;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full overflow-x-auto overflow-y-visible overscroll-x-contain scroll-smooth touch-pan-x">
      <div className="relative w-full" style={{ width: `max(100%, ${minWidthPx}px)` }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Eje X para escala/barras: texto del tick vacío (las fechas van en {@link ProjectionHtmlMonthLabels}).
 * No usar `tick={false}` aquí: en Recharts vacía los ticks y puede romper el eje categórico.
 */
function ProjectionChartXAxis() {
  return (
    <XAxis
      dataKey="month"
      type="category"
      tickFormatter={() => ''}
      tick={{ fontSize: 0, fill: 'transparent' }}
      tickLine={false}
      axisLine={false}
      interval={0}
      height={0}
      minTickGap={0}
    />
  );
}

/** Etiquetas de mes bajo el gráfico (mismos márgenes horizontales que el área del plot). */
function ProjectionHtmlMonthLabels({
  projections,
  desktop,
  plotMargin,
}: {
  projections: MonthlyProjection[];
  desktop: boolean;
  plotMargin: { left: number; right: number };
}) {
  if (projections.length === 0) return null;
  return (
    <div
      className="w-full border-t border-dark-700/60 bg-dark-800/80"
      style={{
        paddingLeft: plotMargin.left,
        paddingRight: plotMargin.right,
      }}
    >
      <div
        className={`flex w-full ${desktop ? 'min-h-[3.5rem] pt-2' : 'min-h-[2.75rem] py-2'} ${desktop ? 'items-start' : 'items-start'}`}
      >
        {projections.map((p, idx) => (
          <div
            key={`lbl-${p.year}-${p.monthNumber}-${idx}`}
            className="flex min-w-0 flex-1 justify-center px-px"
          >
            <span
              className={
                desktop
                  ? 'block max-w-full origin-top -rotate-[34deg] text-center text-[10px] leading-tight text-slate-300'
                  : 'block text-center text-[9px] leading-snug text-slate-300'
              }
              title={formatProjectionMonthLabel(p.month)}
            >
              {formatAxisMonthOneLine(p.month)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Projections: React.FC = () => {
  const [projections, setProjections] = useState<MonthlyProjection[]>([]);
  const [summary, setSummary] = useState<ProjectionSummary | null>(null);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);
  const [projectionPage, setProjectionPage] = useState(1);
  const [chartDesktop, setChartDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setChartDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /** Márgenes del plot; el texto del eje X va en HTML debajo, no dentro del SVG. */
  const projectionChartMargin = useMemo(
    () => ({
      top: 8,
      right: 12,
      bottom: 20,
      left: 12,
    }),
    []
  );

  const projectionPlotHorizontalPad = useMemo(
    () => ({ left: projectionChartMargin.left, right: projectionChartMargin.right }),
    [projectionChartMargin]
  );

  /** Ancho mínimo del contenido del gráfico: muchos meses → barra de desplazamiento horizontal. */
  const projectionChartScrollMinPx = useMemo(() => {
    const n = projections.length;
    if (n === 0) return 280;
    return Math.max(280, n * PROJECTION_PX_PER_MONTH);
  }, [projections.length]);

  const fetchProjections = useCallback(async () => {
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
  }, [months]);

  useEffect(() => {
    fetchProjections();
  }, [fetchProjections]);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 projections-page">
      <PageHeader
        title="Proyecciones"
        subtitle="Estimación de flujo futuro a partir de ingresos/gastos en el sistema y saldo en cuentas bancarias"
        actions={
          <div className="flex flex-col xs:flex-row xs:items-center gap-2 w-full sm:w-auto">
            <label className="text-dark-400 text-sm shrink-0">Meses a proyectar:</label>
            <select
              value={months}
              onChange={(e) => setMonths(parseInt(e.target.value, 10))}
              className="input w-full sm:w-auto sm:min-w-[12rem]"
            >
              {PROJECTION_HORIZON_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <p className="text-dark-400 text-sm leading-relaxed max-w-3xl -mt-2">
        <span className="text-slate-300 font-medium">Cómo se calcula:</span> promedio mensual de ingresos y gastos{' '}
        <strong className="text-slate-300 font-semibold">no recurrentes</strong> en los últimos 3 meses; más el equivalente
        mensual de todo lo <strong className="text-slate-300 font-semibold">recurrente</strong> (según su frecuencia: diario,
        semanal, mensual, anual, etc.). El saldo inicial suma solo <strong className="text-slate-300 font-semibold">cuentas bancarias</strong>{' '}
        (DOP y USD a tu tasa). No incorpora tarjetas, préstamos, por pagar ni por cobrar — es una vista simplificada alineada con tus movimientos de ingresos/gastos.
      </p>

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
                  className={`text-2xl font-bold ${currentBalance >= 0 ? 'text-green-400' : 'text-red-400'
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
                  className={`text-2xl font-bold ${summary.finalProjectedBalance >= 0 ? 'text-green-400' : 'text-red-400'
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
          <div className="chart-box chart-box--projections w-full min-w-[280px]">
            <ProjectionChartHScroll minWidthPx={projectionChartScrollMinPx}>
              <div className="h-[260px] sm:h-[300px] md:h-[320px] w-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%" debounce={50}>
                  <BarChart
                    data={projections}
                    margin={projectionChartMargin}
                    barCategoryGap="12%"
                    barGap={4}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <ProjectionChartXAxis />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      labelFormatter={(label) => formatProjectionMonthLabel(String(label))}
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    />
                    <Legend />
                    <Bar dataKey="projectedIncome" fill="#10b981" name="Ingresos" maxBarSize={56} />
                    <Bar dataKey="projectedExpenses" fill="#ef4444" name="Gastos" maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ProjectionHtmlMonthLabels
                projections={projections}
                desktop={chartDesktop}
                plotMargin={projectionPlotHorizontalPad}
              />
            </ProjectionChartHScroll>
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
          <div className="chart-box chart-box--projections w-full min-w-[280px]">
            <ProjectionChartHScroll minWidthPx={projectionChartScrollMinPx}>
              <div className="h-[260px] sm:h-[300px] md:h-[320px] w-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%" debounce={50}>
                  <BarChart data={projections} margin={projectionChartMargin} barCategoryGap="12%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <ProjectionChartXAxis />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      labelFormatter={(label) => formatProjectionMonthLabel(String(label))}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#f1f5f9',
                      }}
                      labelStyle={{ color: '#e2e8f0' }}
                      itemStyle={{ color: '#f8fafc' }}
                    />
                    <Bar dataKey="netFlow" name="Flujo Neto" maxBarSize={56}>
                      {projections.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.netFlow >= 0 ? '#10b981' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ProjectionHtmlMonthLabels
                projections={projections}
                desktop={chartDesktop}
                plotMargin={projectionPlotHorizontalPad}
              />
            </ProjectionChartHScroll>
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
        <div className="chart-box chart-box--projections w-full min-w-[280px]">
          <ProjectionChartHScroll minWidthPx={projectionChartScrollMinPx}>
            <div className="h-[300px] sm:h-[360px] md:h-[420px] w-full min-h-[260px]">
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <LineChart data={projections} margin={projectionChartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <ProjectionChartXAxis />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    labelFormatter={(label) => formatProjectionMonthLabel(String(label))}
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedBalance"
                    stroke="#0ea5e9"
                    strokeWidth={3}
                    dot={{ fill: '#0ea5e9', r: 3 }}
                    name="Saldo Proyectado"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ProjectionHtmlMonthLabels
              projections={projections}
              desktop={chartDesktop}
              plotMargin={projectionPlotHorizontalPad}
            />
          </ProjectionChartHScroll>
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
        <div className="space-y-4">
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
                    <td
                      data-label="Mes"
                      className="py-3 px-4 align-top whitespace-normal break-words md:text-left"
                    >
                      <span className="table-stack-value">{formatProjectionMonthLabel(projection.month)}</span>
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
                      className={`py-3 px-4 text-right font-semibold md:text-right ${projection.netFlow >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                    >
                      <span className={`table-stack-value font-semibold ${projection.netFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${projection.netFlow.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td
                      data-label="Saldo proyectado"
                      className={`py-3 px-4 text-right font-semibold md:text-right ${projection.projectedBalance >= 0 ? 'text-green-400' : 'text-red-400'
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
          <TablePagination
            currentPage={projectionPageSafe}
            totalPages={projectionTotalPages}
            totalItems={projections.length}
            itemsPerPage={TABLE_PAGE_SIZE}
            onPageChange={setProjectionPage}
            itemLabel="meses"
            variant="card"
          />
        </div>
      </motion.div>
    </div>
  );
};

export default Projections;
