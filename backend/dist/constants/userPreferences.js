"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_LOCALE_CODES = exports.ALLOWED_CURRENCY_CODES = void 0;
exports.normalizeCurrencyPreference = normalizeCurrencyPreference;
exports.normalizeLocalePreference = normalizeLocalePreference;
/** Códigos de moneda mostrados en Preferencias y validados en PATCH /auth/me */
exports.ALLOWED_CURRENCY_CODES = [
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
];
/** Idiomas de interfaz disponibles por ahora */
exports.ALLOWED_LOCALE_CODES = ['es', 'en', 'de'];
function normalizeCurrencyPreference(raw) {
    const c = String(raw ?? 'DOP')
        .trim()
        .toUpperCase();
    if (exports.ALLOWED_CURRENCY_CODES.includes(c))
        return c;
    return null;
}
function normalizeLocalePreference(raw) {
    const L = String(raw ?? 'es')
        .trim()
        .toLowerCase();
    if (exports.ALLOWED_LOCALE_CODES.includes(L))
        return L;
    return null;
}
//# sourceMappingURL=userPreferences.js.map