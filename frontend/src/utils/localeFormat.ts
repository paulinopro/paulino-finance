/** BCP 47 para Intl según idioma UI (Preferencias → Idioma de la interfaz). */
export function localeTagFromUiLanguage(code: string | undefined): string {
  switch (code) {
    case 'en':
      return 'en-US';
    case 'de':
      return 'de-DE';
    default:
      return 'es-DO';
  }
}

const ZERO_DECIMAL = new Set(['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

/** Símbolo cuando Intl no devuelve uno útil (p. ej. devuelve el código ISO). */
const CURRENCY_SYMBOL_FALLBACK: Record<string, string> = {
  EUR: '€',
  MXN: 'MX$',
  USD: '$',
  DOP: 'RD$',
  GBP: '£',
  COP: '$',
  ARS: '$',
  BRL: 'R$',
  CLP: '$',
  PEN: 'S/',
};

/**
 * Locale con datos CLDR adecuados para **mostrar** símbolo/importe de esa moneda.
 * `es-DO` como único locale suele hacer que EUR/MXN salgan como texto «EUR»/«MXN» en lugar de € / MX$.
 */
export function numberFormatLocaleForCurrency(currencyCode: string, uiLocaleTag: string): string {
  const c = currencyCode.toUpperCase();
  switch (c) {
    case 'DOP':
      return 'es-DO';
    case 'EUR':
      return 'es-ES';
    case 'MXN':
      return 'es-MX';
    case 'USD':
      return 'en-US';
    case 'GBP':
      return 'en-GB';
    case 'COP':
      return 'es-CO';
    default:
      return uiLocaleTag;
  }
}

function currencyPartFromIntl(
  currencyIso: string,
  fmtLocale: string,
  display: 'narrowSymbol' | 'symbol'
): string | undefined {
  try {
    const parts = new Intl.NumberFormat(fmtLocale, {
      style: 'currency',
      currency: currencyIso,
      currencyDisplay: display,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value?.trim();
  } catch {
    return undefined;
  }
}

/** true si el fragmento «currency» de Intl es solo el código ISO (no es un símbolo útil). */
function isIsoLikeCurrencyToken(sym: string, currencyIso: string): boolean {
  const s = sym.trim();
  if (!s) return true;
  if (s === currencyIso) return true;
  if (/^[A-Z]{3}$/.test(s)) return true;
  return false;
}

/**
 * Símbolo para etiquetas (selectores): intenta narrow → symbol con locale idóneo por moneda.
 */
export function currencyNarrowSymbol(code: string, localeTag: string): string {
  const c = code.toUpperCase();
  if (c === 'DUAL') return '';
  const fmtLocale = numberFormatLocaleForCurrency(c, localeTag);

  for (const display of ['narrowSymbol', 'symbol'] as const) {
    const sym = currencyPartFromIntl(c, fmtLocale, display);
    if (sym && !isIsoLikeCurrencyToken(sym, c)) return sym;
  }

  if (fmtLocale !== localeTag) {
    for (const display of ['narrowSymbol', 'symbol'] as const) {
      const sym = currencyPartFromIntl(c, localeTag, display);
      if (sym && !isIsoLikeCurrencyToken(sym, c)) return sym;
    }
  }

  return CURRENCY_SYMBOL_FALLBACK[c] ?? c;
}

export function fractionDigitsForCurrency(currencyCode: string): { min: number; max: number } {
  if (ZERO_DECIMAL.has(currencyCode.toUpperCase())) return { min: 0, max: 0 };
  return { min: 2, max: 2 };
}

/**
 * Etiqueta para opciones de moneda: «símbolo (ISO)».
 * Para `DUAL`, el proveedor (`IntlFormattingProvider`) suele sobreescribir con el par del usuario.
 */
export function currencySelectLabel(code: string, localeTag: string): string {
  const c = code.toUpperCase();
  if (c === 'DUAL') {
    const d = currencyNarrowSymbol('DOP', localeTag);
    const u = currencyNarrowSymbol('USD', localeTag);
    return `${d} + ${u} (DUAL)`;
  }
  const sym = currencyNarrowSymbol(c, localeTag);
  return `${sym} (${c})`;
}

export function formatCurrencyAmount(
  amount: number,
  currency: string,
  localeTag: string,
  options?: Partial<Intl.NumberFormatOptions>
): string {
  const cur = currency.toUpperCase();
  const fd = fractionDigitsForCurrency(cur);
  const formatLocale = numberFormatLocaleForCurrency(cur, localeTag);
  try {
    return new Intl.NumberFormat(formatLocale, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: options?.minimumFractionDigits ?? fd.min,
      maximumFractionDigits: options?.maximumFractionDigits ?? fd.max,
      ...options,
    }).format(amount);
  } catch {
    try {
      return new Intl.NumberFormat(formatLocale, {
        minimumFractionDigits: fd.min,
        maximumFractionDigits: fd.max,
      }).format(amount) + ` ${cur}`;
    } catch {
      return amount.toFixed(fd.max > 0 ? 2 : 0) + ` ${cur}`;
    }
  }
}

export function formatDecimalAmount(
  amount: number,
  localeTag: string,
  minimumFractionDigits: number,
  maximumFractionDigits: number
): string {
  try {
    return new Intl.NumberFormat(localeTag, {
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(amount);
  } catch {
    return amount.toFixed(maximumFractionDigits);
  }
}

export function formatIntegerLocale(amount: number, localeTag: string): string {
  try {
    return new Intl.NumberFormat(localeTag, { maximumFractionDigits: 0 }).format(amount);
  } catch {
    return String(Math.round(amount));
  }
}

export type DateFmtPreset = 'short' | 'long' | 'weekdayMedium';

export function formatDatePreset(
  value: Date | string | number,
  localeTag: string,
  preset: DateFmtPreset
): string {
  const d =
    value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(d.getTime())) return '';
  try {
    if (preset === 'long') {
      return new Intl.DateTimeFormat(localeTag, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(d);
    }
    if (preset === 'weekdayMedium') {
      return new Intl.DateTimeFormat(localeTag, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(d);
    }
    return new Intl.DateTimeFormat(localeTag, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** yyyy-mm-dd interpretado como fecha local. */
export function formatYmdShort(ymd: string, localeTag: string): string {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  try {
    return new Intl.DateTimeFormat(localeTag, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(y, m - 1, d));
  } catch {
    return ymd;
  }
}

export function formatDateTimeShortMdHm(value: Date | string | number, localeTag: string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(localeTag, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

export function formatDateTimeMedium(value: Date | string | number, localeTag: string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(localeTag, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}
