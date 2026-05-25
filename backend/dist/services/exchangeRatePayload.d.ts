export declare function parseManualExchangeColumn(raw: unknown): number | null;
/** Payload JSON para cliente: manual, efectiva (API/cache), alias legado. */
export declare function exchangeRatePayloadForUser(userId: number, row: {
    exchange_rate_manual?: unknown;
    exchange_rate_dop_usd?: unknown;
}): Promise<{
    exchangeRateManual: number | null;
    exchangeRateEffective: number;
    /** @deprecated misnombre; usar exchangeRateEffective — secundaria por 1 principal */
    exchangeRateDopUsd: number;
}>;
//# sourceMappingURL=exchangeRatePayload.d.ts.map