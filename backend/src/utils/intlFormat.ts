/** Alineado con `frontend/src/utils/localeFormat.ts` (locale UI + DOP → es-DO). */

export function localeTagFromUiLanguage(code: string | undefined | null): string {
  switch (code) {
    case 'en':
      return 'en-US';
    case 'de':
      return 'de-DE';
    default:
      return 'es-DO';
  }
}

const ZERO_DECIMAL = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

function fractionDigitsForCurrency(currencyCode: string): { min: number; max: number } {
  if (ZERO_DECIMAL.has(currencyCode.toUpperCase())) return { min: 0, max: 0 };
  return { min: 2, max: 2 };
}

/** Alineado con `frontend/src/utils/localeFormat.ts` — evita «EUR»/«MXN» como símbolo con solo es-DO. */
function numberFormatLocaleForCurrency(currencyCode: string, uiLocaleTag: string): string {
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

export function formatCurrencyAmount(amount: number, currency: string, localeTag: string): string {
  const cur = currency.toUpperCase();
  const fd = fractionDigitsForCurrency(cur);
  const formatLocale = numberFormatLocaleForCurrency(cur, localeTag);
  try {
    return new Intl.NumberFormat(formatLocale, {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: fd.min,
      maximumFractionDigits: fd.max,
    }).format(amount);
  } catch {
    return `${amount.toFixed(fd.max > 0 ? 2 : 0)} ${cur}`;
  }
}
