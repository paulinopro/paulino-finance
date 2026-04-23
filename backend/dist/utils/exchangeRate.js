"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultExchangeRateDopUsd = getDefaultExchangeRateDopUsd;
exports.resolveExchangeRateDopUsd = resolveExchangeRateDopUsd;
/**
 * Tasa DOP por 1 USD.
 * - Por usuario: `users.exchange_rate_dop_usd` (prioridad).
 * - Si falta o es inválida: `EXCHANGE_RATE_DOP_USD` en .env.
 * - Último recurso: 55 (histórico en esquema BD).
 */
function getDefaultExchangeRateDopUsd() {
    const raw = process.env.EXCHANGE_RATE_DOP_USD;
    const n = raw !== undefined && raw !== '' ? parseFloat(String(raw).trim()) : NaN;
    if (!Number.isNaN(n) && n > 0)
        return n;
    return 55;
}
function resolveExchangeRateDopUsd(stored) {
    const n = parseFloat(String(stored ?? '').trim());
    if (!Number.isNaN(n) && n > 0)
        return n;
    return getDefaultExchangeRateDopUsd();
}
//# sourceMappingURL=exchangeRate.js.map