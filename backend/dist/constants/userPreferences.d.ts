/** Códigos de moneda mostrados en Preferencias y validados en PATCH /auth/me */
export declare const ALLOWED_CURRENCY_CODES: readonly ["DOP", "USD", "EUR", "GBP", "JPY", "CNY", "MXN", "CAD", "AUD", "CHF", "BRL", "ARS", "COP"];
export type AllowedCurrencyCode = (typeof ALLOWED_CURRENCY_CODES)[number];
/** Idiomas de interfaz disponibles por ahora */
export declare const ALLOWED_LOCALE_CODES: readonly ["es", "en", "de"];
export type AllowedLocaleCode = (typeof ALLOWED_LOCALE_CODES)[number];
export declare function normalizeCurrencyPreference(raw: unknown): AllowedCurrencyCode | null;
export declare function normalizeLocalePreference(raw: unknown): AllowedLocaleCode | null;
//# sourceMappingURL=userPreferences.d.ts.map