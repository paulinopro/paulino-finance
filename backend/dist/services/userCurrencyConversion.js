"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConversionContextForUser = getConversionContextForUser;
exports.amountToPrimary = amountToPrimary;
exports.bankBalancesToPrimary = bankBalancesToPrimary;
const database_1 = require("../config/database");
const openErRatesService_1 = require("./openErRatesService");
const exchangeRate_1 = require("../utils/exchangeRate");
const userCurrencyPair_1 = require("../utils/userCurrencyPair");
function parseManual(raw) {
    if (raw === null || raw === undefined || raw === '')
        return null;
    const n = parseFloat(String(raw).trim());
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return n;
}
/**
 * Tasa legado: `exchange_rate_dop_usd` = DOP por 1 USD (multiplicar USD * tasa → DOP).
 * Convierte a secundaria por 1 principal según el par actual.
 */
function legacyDopUsdToPairSecondaryPerPrimary(pair, legacyDopUsd) {
    const leg = parseManual(legacyDopUsd);
    if (leg == null)
        return null;
    const p = pair.primary;
    const s = pair.secondary;
    if (p === 'USD' && s === 'DOP')
        return leg;
    if (p === 'DOP' && s === 'USD')
        return 1 / leg;
    return null;
}
/**
 * Contexto de conversión para un usuario: tasas con base = moneda principal.
 * Si `exchange_rate_manual` > 0, sustituye solo la tasa del código secundario del par.
 */
async function getConversionContextForUser(userId) {
    const r = await (0, database_1.query)(`SELECT currency_preference, secondary_currency_preference, exchange_rate_manual, exchange_rate_dop_usd
     FROM users WHERE id = $1`, [userId]);
    const row = r.rows[0] || {};
    const pair = (0, userCurrencyPair_1.resolvedCurrencyPairFromRow)(row);
    let { rates } = await (0, openErRatesService_1.getOrRefreshSnapshot)(pair.primary);
    const manual = parseManual(row.exchange_rate_manual);
    let usedManual = false;
    if (manual != null) {
        rates = { ...rates, [pair.secondary]: manual };
        usedManual = true;
    }
    else {
        const legacyPair = legacyDopUsdToPairSecondaryPerPrimary(pair, row.exchange_rate_dop_usd);
        if (legacyPair != null) {
            rates = { ...rates, [pair.secondary]: legacyPair };
            usedManual = true;
        }
    }
    let pairRate = rates[pair.secondary];
    if (pairRate == null || !Number.isFinite(pairRate) || pairRate <= 0) {
        const fallback = (0, exchangeRate_1.getDefaultExchangeRateDopUsd)();
        if (pair.primary === 'USD' && pair.secondary === 'DOP') {
            pairRate = fallback;
            rates = { ...rates, DOP: fallback };
        }
        else if (pair.primary === 'DOP' && pair.secondary === 'USD') {
            pairRate = 1 / fallback;
            rates = { ...rates, USD: pairRate };
        }
        else {
            pairRate = 1;
        }
    }
    return {
        userId,
        pair,
        rates,
        pairRateSecondaryPerPrimary: pairRate,
        usedManualPairRate: usedManual,
    };
}
/**
 * Convierte `amount` expresado en `currency` (ISO) a equivalente en moneda principal.
 * Usa tasas open.er con base = primary: `rates[C]` = unidades de C por 1 primary → primary_eq = amount / rates[C].
 */
function amountToPrimary(amount, currency, ctx) {
    const c = String(currency || '')
        .trim()
        .toUpperCase();
    const p = ctx.pair.primary;
    if (c === p)
        return amount;
    const r = ctx.rates[c];
    if (r != null && Number.isFinite(r) && r > 0) {
        return amount / r;
    }
    return amount;
}
/**
 * Convierte saldos de cuenta bancaria a moneda principal.
 * Las columnas `balance_dop` / `balance_usd` son el primer y segundo “riel” del par del usuario
 * (principal / secundaria), no necesariamente DOP ni USD.
 */
function bankBalancesToPrimary(balanceDop, balanceUsd, ctx) {
    return (amountToPrimary(balanceDop, ctx.pair.primary, ctx) +
        amountToPrimary(balanceUsd, ctx.pair.secondary, ctx));
}
//# sourceMappingURL=userCurrencyConversion.js.map