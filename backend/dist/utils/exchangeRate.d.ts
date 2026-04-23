/**
 * Tasa DOP por 1 USD.
 * - Por usuario: `users.exchange_rate_dop_usd` (prioridad).
 * - Si falta o es inválida: `EXCHANGE_RATE_DOP_USD` en .env.
 * - Último recurso: 55 (histórico en esquema BD).
 */
export declare function getDefaultExchangeRateDopUsd(): number;
export declare function resolveExchangeRateDopUsd(stored: unknown): number;
//# sourceMappingURL=exchangeRate.d.ts.map