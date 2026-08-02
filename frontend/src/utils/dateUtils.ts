import i18n from '../i18n/config';

/**
 * Format date using user's timezone
 * The dateString should be in format YYYY-MM-DD
 */
export const formatDateInTimezone = (
  dateString: string,
  timezone: string = 'America/Santo_Domingo',
  localeTag: string = 'es-DO'
): string => {
  // Validate date string
  if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
    console.warn('formatDateInTimezone: Invalid date string', dateString);
    return i18n.t('common.invalidDate');
  }
  
  // Trim whitespace
  const trimmedDate = dateString.trim();
  
  // Parse the date string directly to avoid timezone shifts
  // dateString is already in YYYY-MM-DD format from backend
  const parts = trimmedDate.split('-');
  if (parts.length !== 3) {
    console.warn('formatDateInTimezone: Invalid date format', dateString);
    return trimmedDate; // Return original if can't parse
  }
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  // Validate parsed values
  if (isNaN(year) || isNaN(month) || isNaN(day) || 
      year < 1900 || year > 2100 || 
      month < 1 || month > 12 || 
      day < 1 || day > 31) {
    console.warn('formatDateInTimezone: Invalid date values', { year, month, day, dateString });
    return trimmedDate; // Return original if invalid
  }
  
  // Create a date object in UTC to avoid timezone shifts
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  
  // Validate the date object
  if (isNaN(date.getTime())) {
    console.warn('formatDateInTimezone: Invalid date object created', { year, month, day, dateString });
    return `${day}/${month}/${year}`; // Fallback to simple format
  }
  
  try {
    const formatted = new Intl.DateTimeFormat(localeTag, {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
    return formatted;
  } catch (error) {
    console.warn('formatDateInTimezone: Error formatting date', error, { dateString, timezone });
    // Fallback to simple format if timezone formatting fails
    return `${day}/${month}/${year}`;
  }
};

/**
 * Convierte fechas del API (DATE, ISO con hora, `Date` de node-pg, etc.) a `YYYY-MM-DD` para `<input type="date">`.
 * Prioriza el fragmento calendario inicial si ya viene como `YYYY-MM-DD…` (p. ej. Postgres serializado a JSON).
 * Para `Date`, usa componentes UTC (alineado a DATE de Postgres serializado como ISO en medianoche UTC).
 */
export const formatDateForInput = (
  value: string | Date | number | undefined | null,
  _timezone?: string
): string => {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && !Number.isNaN(value)) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    const y = value.getUTCFullYear();
    const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  const s = String(value).trim();
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (iso) return iso[1];
  // Evitar new Date("Thu Apr 02") sin año: en varios motores el año por defecto es 2001.
  if (/^\w{3}\s+\w{3}\s+\d{1,2}\s*$/.test(s)) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
};

/**
 * Fecha calendario como `dd/mm/aaaa` (ej. 18/04/2026), alineada con `formatDateForInput` (sin desfase ISO).
 */
export const formatDateDdMmYyyy = (value: string | undefined | null): string => {
  const ymd = formatDateForInput(value);
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
};

export const formatStoredDateEs = formatDateDdMmYyyy;

/**
 * Fecha de calendario local como YYYY-MM-DD. Evita `toISOString().split('T')[0]` (UTC → día incorrecto).
 */
export function dateToYmdLocal(d: Date): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayYmdLocal(): string {
  return dateToYmdLocal(new Date());
}

/** Timestamp local para ordenar por fecha calendario (evita parse UTC de `YYYY-MM-DD`). */
export function calendarDateToSortableMs(value: string | null | undefined): number {
  const displayMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(value || '').trim());
  const ymd = displayMatch
    ? `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`
    : formatDateForInput(value);
  if (!ymd) return 0;
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return 0;
  return new Date(y, m - 1, d).getTime();
}

/**
 * Cantidad de días calendario inclusivos desde `startYmd` hasta `endYmd`.
 * Espera `YYYY-MM-DD` (se normalizan con `formatDateForInput`).
 */
export function inclusiveCalendarDaysBetween(startYmd: string, endYmd: string): number {
  const start = formatDateForInput(startYmd);
  const end = formatDateForInput(endYmd);
  if (!start || !end) return 0;
  const a = calendarDateToSortableMs(start);
  const b = calendarDateToSortableMs(end);
  if (!a || !b || b < a) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

/** Primer y último día (inclusive) del mes calendario que contiene la fecha (`YYYY-MM-DD`). */
export function getCalendarMonthBoundsYmd(anyDayWithinMonth: string): { startYmd: string; endYmd: string } {
  const ymd = formatDateForInput(anyDayWithinMonth) || todayYmdLocal();
  const parts = ymd.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return getCalendarMonthBoundsYmd(todayYmdLocal());
  }
  const [yRaw, moRaw] = parts;
  const mo = Math.max(1, Math.min(12, moRaw));
  const ym = `${yRaw}-${String(mo).padStart(2, '0')}`;
  const startYmd = `${ym}-01`;
  const lastDayNum = new Date(yRaw, mo, 0).getDate();
  const endYmd = `${ym}-${String(lastDayNum).padStart(2, '0')}`;
  return { startYmd, endYmd };
}

/** Ejes de gráficos: fecha API `YYYY-MM-DD` → etiqueta local sin desfase UTC. */
export function formatChartAxisEsShort(value: string | null | undefined, localeTag: string = 'es-DO'): string {
  const ymd = formatDateForInput(value);
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return '';
  return new Date(y, m - 1, d).toLocaleDateString(localeTag, { day: 'numeric', month: 'short' });
}

export function formatChartTooltipEs(value: string | null | undefined, localeTag: string = 'es-DO'): string {
  const ymd = formatDateForInput(value);
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  if (Number.isNaN(y) || Number.isNaN(m) || Number.isNaN(d)) return '';
  return new Date(y, m - 1, d).toLocaleDateString(localeTag);
}

/**
 * Texto largo en español (ej. "jueves, 2 de abril de 2026") para fechas solo-calendario del API.
 * No usar `new Date('YYYY-MM-DD')` (medianoche UTC → día anterior en es-DO).
 */
export function formatCalendarDateLongEs(value: string | null | undefined, localeTag: string = 'es-DO'): string {
  const ymd = formatDateForInput(value);
  if (!ymd) return '';
  const parts = ymd.split('-').map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return '';
  const [y, m, d] = parts;
  const local = new Date(y, m - 1, d);
  const s = local.toLocaleDateString(localeTag, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return s ? s.charAt(0).toLocaleUpperCase(localeTag) + s.slice(1) : s;
}

/**
 * Convierte `dd/mm/aaaa` o `d/m/aaaa` a `YYYY-MM-DD` para el API. Devuelve null si es inválida.
 */
export const parseDdMmYyyyToIso = (input: string): string | null => {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

/** Combina un día recurrente con un período calendario y ajusta al último día válido. */
export function formatRecurringDayForPeriod(day: number, year: number, month: number): string {
  const safeMonth = Math.max(1, Math.min(12, Math.trunc(month)));
  const lastDay = new Date(year, safeMonth, 0).getDate();
  const safeDay = Math.max(1, Math.min(lastDay, Math.trunc(day)));
  return [
    String(safeDay).padStart(2, '0'),
    String(safeMonth).padStart(2, '0'),
    String(year).padStart(4, '0'),
  ].join('/');
}
