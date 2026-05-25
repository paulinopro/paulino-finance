"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultSecondaryForPrimary = defaultSecondaryForPrimary;
exports.resolvedCurrencyPairFromRow = resolvedCurrencyPairFromRow;
exports.userCurrencyPreferencePayload = userCurrencyPreferencePayload;
exports.getUserCurrencyPair = getUserCurrencyPair;
exports.isCurrencyInUserPair = isCurrencyInUserPair;
exports.validateLedgerCurrencyForUser = validateLedgerCurrencyForUser;
const database_1 = require("../config/database");
const userPreferences_1 = require("../constants/userPreferences");
/** Moneda secundaria por defecto cuando falta dato o coincide con la principal */
function defaultSecondaryForPrimary(primary) {
    return primary === 'USD' ? 'DOP' : 'USD';
}
/** Par estable a partir de columnas de usuario (sync, p. ej. respuestas auth). */
function resolvedCurrencyPairFromRow(row) {
    const primary = (0, userPreferences_1.normalizeCurrencyPreference)(row?.currency_preference) || 'DOP';
    let secondary = (0, userPreferences_1.normalizeCurrencyPreference)(row?.secondary_currency_preference);
    if (!secondary || secondary === primary) {
        secondary = defaultSecondaryForPrimary(primary);
    }
    return { primary, secondary };
}
/** Campos en camelCase para respuestas JSON de auth. */
function userCurrencyPreferencePayload(row) {
    const pair = resolvedCurrencyPairFromRow(row);
    return {
        currencyPreference: pair.primary,
        secondaryCurrencyPreference: pair.secondary,
    };
}
async function getUserCurrencyPair(userId) {
    const r = await (0, database_1.query)(`SELECT currency_preference, secondary_currency_preference FROM users WHERE id = $1`, [userId]);
    return resolvedCurrencyPairFromRow(r.rows[0] || {});
}
function isCurrencyInUserPair(pair, currency) {
    const c = String(currency ?? '')
        .trim()
        .toUpperCase();
    return c === pair.primary || c === pair.secondary;
}
/** Movimientos / transferencias: la moneda debe ser la principal o la secundaria del perfil. */
function validateLedgerCurrencyForUser(pair, currency) {
    const c = String(currency ?? '')
        .trim()
        .toUpperCase();
    if (!isCurrencyInUserPair(pair, c)) {
        return 'Elige una moneda del par configurado en Preferencias (principal o secundaria).';
    }
    return null;
}
//# sourceMappingURL=userCurrencyPair.js.map