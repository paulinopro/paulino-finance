import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import toast from 'react-hot-toast';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';
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
function formatProjectionMonthLabel(raw: string, localeTag: string = 'es-DO'): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (/^\d+$/.test(word)) return word;
      if (!word) return word;
      return word.charAt(0).toLocaleUpperCase(localeTag) + word.slice(1).toLowerCase();
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

function getAxisMonthAbbrevParts(raw: string, localeTag: string = 'es-DO'): { abbrDotted: string; year: string } {
  const label = formatProjectionMonthLabel(raw, localeTag);
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
function formatAxisMonthOneLine(raw: string, localeTag: string = 'es-DO'): string {
  const { abbrDotted, year } = getAxisMonthAbbrevParts(raw, localeTag);
  if (!year) return formatProjectionMonthLabel(raw, localeTag);
  return `${abbrDotted} ${year}`;
}

/** Valores permitidos y etiquetas del selector (valor = meses). */
const PROJECTION_HORIZON_VALUES: number[] = [3, 6, 12, 24, 36, 48, 60, 72, 84, 96, 108, 120, 240, 360, 480, 600];

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
  localeTag = 'es-DO',
}: {
  projections: MonthlyProjection[];
  desktop: boolean;
  plotMargin: { left: number; right: number };
  localeTag?: string;
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
              title={formatProjectionMonthLabel(p.month, localeTag)}
            >
              {formatAxisMonthOneLine(p.month, localeTag)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Projections: React.FC = () => {
  const { t } = useTranslation();
  const { formatCurrency: fc, localeTag, primaryCurrency, secondaryCurrency } = useIntlFormatting();
  const { pageSize: projectionPageSize, setPageSize: setProjectionPageSize, pageSizeOptions: projectionPageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:projections', TABLE_PAGE_SIZE);
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
      toast.error(t('toast.projections.loadError'));
    } finally {
      setLoading(false);
    }
  }, [months, t]);

  useEffect(() => {
    fetchProjections();
  }, [fetchProjections]);

  useEffect(() => {
    setProjectionPage(1);
  }, [months, projectionPageSize]);

  const projectionTotalPages = Math.max(1, Math.ceil(projections.length / projectionPageSize));
  const projectionPageSafe = Math.min(projectionPage, projectionTotalPages);
  const pagedProjections = useMemo(() => {
    const start = (projectionPageSafe - 1) * projectionPageSize;
    return projections.slice(start, start + projectionPageSize);
  }, [projections, projectionPageSafe, projectionPageSize]);

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
        title={t('pages.projections.title')}
        subtitle={t('pages.projections.subtitle')}
        actions={
          <div className="flex flex-col xs:flex-row xs:items-center gap-2 w-full sm:w-auto">
            <label className="text-dark-400 text-sm shrink-0">{t('pages.projections.monthsToProject')}</label>
            <select
              value={months}
              onChange={(e) => setMonths(parseInt(e.target.value, 10))}
              className="input w-full sm:w-auto sm:min-w-[12rem]"
            >
              {PROJECTION_HORIZON_VALUES.map((value) => (
                <option key={value} value={value}>
                  {t('pages.projections.horizonOption', { count: value })}
                </option>
              ))}
            </select>
          </div>
        }
      />

      <p className="text-dark-400 text-sm leading-relaxed max-w-3xl -mt-2">
        {t('pages.projections.calculationHelp', { primary: primaryCurrency, secondary: secondaryCurrency })}
      </p>

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
                <p className="text-dark-400 text-sm mb-1">{t('pages.projections.currentBalance')}</p>
                <p
                  className={`text-2xl font-bold ${currentBalance >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                >
                  {fc(currentBalance, primaryCurrency)}
                </p>
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
                <p className="text-dark-400 text-sm mb-1">{t('pages.projections.projectedIncome')}</p>
                <p className="text-2xl font-bold text-green-400">
                  {fc(summary.totalProjectedIncome, primaryCurrency)}
                </p>
                <p className="text-xs text-dark-400 mt-1">{t('pages.projections.averagePerMonth', { amount: fc(summary.avgMonthlyIncome, primaryCurrency) })}</p>
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
                <p className="text-dark-400 text-sm mb-1">{t('pages.projections.projectedExpenses')}</p>
                <p className="text-2xl font-bold text-red-400">
                  {fc(summary.totalProjectedExpenses, primaryCurrency)}
                </p>
                <p className="text-xs text-dark-400 mt-1">{t('pages.projections.averagePerMonth', { amount: fc(summary.avgMonthlyExpenses, primaryCurrency) })}</p>
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
                <p className="text-dark-400 text-sm mb-1">{t('pages.projections.projectedBalance')}</p>
                <p
                  className={`text-2xl font-bold ${summary.finalProjectedBalance >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}
                >
                  {fc(summary.finalProjectedBalance, primaryCurrency)}
                </p>
              </div>
              <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-white" />
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
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">{t('pages.projections.incomeVsExpensesProjected')}</h2>
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
                      labelFormatter={(label) => formatProjectionMonthLabel(String(label), localeTag)}
                      contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    />
                    <Legend />
                    <Bar dataKey="projectedIncome" fill="#10b981" name={t('pages.projections.chartIncome')} maxBarSize={56} />
                    <Bar dataKey="projectedExpenses" fill="#ef4444" name={t('pages.projections.chartExpenses')} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <ProjectionHtmlMonthLabels
                projections={projections}
                desktop={chartDesktop}
                plotMargin={projectionPlotHorizontalPad}
                localeTag={localeTag}
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
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">{t('pages.projections.netFlowProjected')}</h2>
          <div className="chart-box chart-box--projections w-full min-w-[280px]">
            <ProjectionChartHScroll minWidthPx={projectionChartScrollMinPx}>
              <div className="h-[260px] sm:h-[300px] md:h-[320px] w-full min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%" debounce={50}>
                  <BarChart data={projections} margin={projectionChartMargin} barCategoryGap="12%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <ProjectionChartXAxis />
                    <YAxis stroke="#94a3b8" />
                    <Tooltip
                      labelFormatter={(label) => formatProjectionMonthLabel(String(label), localeTag)}
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#f1f5f9',
                      }}
                      labelStyle={{ color: '#e2e8f0' }}
                      itemStyle={{ color: '#f8fafc' }}
                    />
                    <Bar dataKey="netFlow" name={t('pages.projections.netFlow')} maxBarSize={56}>
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
                localeTag={localeTag}
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
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">{t('pages.projections.projectedBalanceAccumulated')}</h2>
        <div className="chart-box chart-box--projections w-full min-w-[280px]">
          <ProjectionChartHScroll minWidthPx={projectionChartScrollMinPx}>
            <div className="h-[300px] sm:h-[360px] md:h-[420px] w-full min-h-[260px]">
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <LineChart data={projections} margin={projectionChartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <ProjectionChartXAxis />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip
                    labelFormatter={(label) => formatProjectionMonthLabel(String(label), localeTag)}
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="projectedBalance"
                    stroke="#0ea5e9"
                    strokeWidth={3}
                    dot={{ fill: '#0ea5e9', r: 3 }}
                    name={t('pages.projections.projectedBalance')}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ProjectionHtmlMonthLabels
              projections={projections}
              desktop={chartDesktop}
              plotMargin={projectionPlotHorizontalPad}
              localeTag={localeTag}
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
        <h2 className="text-lg sm:text-xl font-semibold text-white mb-4">{t('pages.projections.monthlyProjections')}</h2>
        <>
          <div className="table-responsive table-stack">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-700">
                  <th className="text-left py-3 px-4 text-dark-400 font-medium">{t('pages.projections.month')}</th>
                  <th className="text-right py-3 px-4 text-dark-400 font-medium">{t('pages.projections.chartIncome')}</th>
                  <th className="text-right py-3 px-4 text-dark-400 font-medium">{t('pages.projections.chartExpenses')}</th>
                  <th className="text-right py-3 px-4 text-dark-400 font-medium">{t('pages.projections.netFlow')}</th>
                  <th className="text-right py-3 px-4 text-dark-400 font-medium">{t('pages.projections.projectedBalance')}</th>
                </tr>
              </thead>
              <tbody>
                {pagedProjections.map((projection, index) => (
                  <tr key={`${projection.month}-${projection.year}-${index}`} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                    <td
                      data-label={t('pages.projections.month')}
                      className="py-3 px-4 align-top whitespace-normal break-words md:text-left"
                    >
                      <span className="table-stack-value">{formatProjectionMonthLabel(projection.month, localeTag)}</span>
                    </td>
                    <td data-label={t('pages.projections.chartIncome')} className="py-3 px-4 text-right text-green-400 md:text-right">
                      <span className="table-stack-value text-green-400">
                        {fc(projection.projectedIncome, primaryCurrency)}
                      </span>
                    </td>
                    <td data-label={t('pages.projections.chartExpenses')} className="py-3 px-4 text-right text-red-400 md:text-right">
                      <span className="table-stack-value text-red-400">
                        {fc(projection.projectedExpenses, primaryCurrency)}
                      </span>
                    </td>
                    <td
                      data-label={t('pages.projections.netFlow')}
                      className={`py-3 px-4 text-right font-semibold md:text-right ${projection.netFlow >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                    >
                      <span className={`table-stack-value font-semibold ${projection.netFlow >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fc(projection.netFlow, primaryCurrency)}
                      </span>
                    </td>
                    <td
                      data-label={t('pages.projections.projectedBalance')}
                      className={`py-3 px-4 text-right font-semibold md:text-right ${projection.projectedBalance >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                    >
                      <span className={`table-stack-value font-semibold ${projection.projectedBalance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {fc(projection.projectedBalance, primaryCurrency)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            className="mt-4 sm:mt-5"
            currentPage={projectionPageSafe}
            totalPages={projectionTotalPages}
            totalItems={projections.length}
            itemsPerPage={projectionPageSize}
            onPageChange={setProjectionPage}
            itemLabel={t('pages.projections.itemsLabel')}
            variant="card"
            pageSizeOptions={projectionPageSizeOptions}
            onPageSizeChange={setProjectionPageSize}
          />
        </>
      </motion.div>
    </div>
  );
};

export default Projections;
