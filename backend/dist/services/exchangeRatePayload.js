"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseManualExchangeColumn = parseManualExchangeColumn;
exports.exchangeRatePayloadForUser = exchangeRatePayloadForUser;
const userCurrencyConversion_1 = require("./userCurrencyConversion");
function parseManualExchangeColumn(raw) {
    if (raw === null || raw === undefined || raw === '')
        return null;
    const n = parseFloat(String(raw).trim());
    if (!Number.isFinite(n) || n <= 0)
        return null;
    return n;
}
/** Payload JSON para cliente: manual, efectiva (API/cache), alias legado. */
async function exchangeRatePayloadForUser(userId, row) {
    const ctx = await (0, userCurrencyConversion_1.getConversionContextForUser)(userId);
    return {
        exchangeRateManual: parseManualExchangeColumn(row.exchange_rate_manual),
        exchangeRateEffective: ctx.pairRateSecondaryPerPrimary,
        /** @deprecated misnombre; usar exchangeRateEffective — secundaria por 1 principal */
        exchangeRateDopUsd: ctx.pairRateSecondaryPerPrimary,
    };
}
//# sourceMappingURL=exchangeRatePayload.js.map