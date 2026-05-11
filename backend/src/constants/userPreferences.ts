/** Códigos de moneda mostrados en Preferencias y validados en PATCH /auth/me */
export const ALLOWED_CURRENCY_CODES = [
  'DOP',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CNY',
  'MXN',
  'CAD',
  'AUD',
  'CHF',
  'BRL',
  'ARS',
  'COP',
] as const;

export type AllowedCurrencyCode = (typeof ALLOWED_CURRENCY_CODES)[number];

/** Idiomas de interfaz disponibles por ahora */
export const ALLOWED_LOCALE_CODES = ['es', 'en', 'de'] as const;

export type AllowedLocaleCode = (typeof ALLOWED_LOCALE_CODES)[number];

export function normalizeCurrencyPreference(raw: unknown): AllowedCurrencyCode | null {
  const c = String(raw ?? 'DOP')
    .trim()
    .toUpperCase();
  if ((ALLOWED_CURRENCY_CODES as readonly string[]).includes(c)) return c as AllowedCurrencyCode;
  return null;
}

export function normalizeLocalePreference(raw: unknown): AllowedLocaleCode | null {
  const L = String(raw ?? 'es')
    .trim()
    .toLowerCase();
  if ((ALLOWED_LOCALE_CODES as readonly string[]).includes(L)) return L as AllowedLocaleCode;
  return null;
}
