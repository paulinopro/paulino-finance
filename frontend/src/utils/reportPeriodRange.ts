/**
 * Rangos de fechas (YYYY-MM-DD) en calendario local del navegador — para el módulo de reportes.
 */

export type ReportPeriodKey =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_year'
  | 'custom';

const pad = (n: number) => String(n).padStart(2, '0');

export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Lunes de la semana calendario que contiene `d` (lunes = inicio de semana). */
function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function endOfWeekSunday(d: Date): Date {
  const mon = startOfWeekMonday(d);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return sun;
}

/**
 * `now` inyectable para pruebas; por defecto "ahora" del cliente.
 */
export function getDateRangeForReportPeriod(preset: Exclude<ReportPeriodKey, 'custom'>, now: Date = new Date()): {
  from: string;
  to: string;
} {
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = now.getDate();

  const today = new Date(y, m, day);

  switch (preset) {
    case 'today':
      return { from: toYmd(today), to: toYmd(today) };
    case 'yesterday': {
      const yest = new Date(y, m, day - 1);
      return { from: toYmd(yest), to: toYmd(yest) };
    }
    case 'this_week': {
      const start = startOfWeekMonday(today);
      const end = endOfWeekSunday(today);
      return { from: toYmd(start), to: toYmd(end) };
    }
    case 'this_month': {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return { from: toYmd(start), to: toYmd(end) };
    }
    case 'last_month': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { from: toYmd(start), to: toYmd(end) };
    }
    case 'last_7_days': {
      const start = new Date(y, m, day - 6);
      return { from: toYmd(start), to: toYmd(today) };
    }
    case 'last_30_days': {
      const start = new Date(y, m, day - 29);
      return { from: toYmd(start), to: toYmd(today) };
    }
    case 'this_year': {
      const start = new Date(y, 0, 1);
      return { from: toYmd(start), to: toYmd(today) };
    }
    default: {
      const _ex: never = preset;
      return _ex;
    }
  }
}

export const REPORT_PERIOD_OPTIONS: { value: ReportPeriodKey; label: string }[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: 'this_week', label: 'Esta semana' },
  { value: 'this_month', label: 'Este mes' },
  { value: 'last_month', label: 'Mes anterior' },
  { value: 'last_7_days', label: 'Últimos 7 días' },
  { value: 'last_30_days', label: 'Últimos 30 días' },
  { value: 'this_year', label: 'Este año' },
  { value: 'custom', label: 'Personalizado' },
];
