import { getConversionContextForUser } from './userCurrencyConversion';

export function parseManualExchangeColumn(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = parseFloat(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Payload JSON para cliente: manual, efectiva (API/cache), alias legado. */
export async function exchangeRatePayloadForUser(
  userId: number,
  row: { exchange_rate_manual?: unknown; exchange_rate_dop_usd?: unknown }
) {
  const ctx = await getConversionContextForUser(userId);
  return {
    exchangeRateManual: parseManualExchangeColumn(row.exchange_rate_manual),
    exchangeRateEffective: ctx.pairRateSecondaryPerPrimary,
    /** @deprecated misnombre; usar exchangeRateEffective — secundaria por 1 principal */
    exchangeRateDopUsd: ctx.pairRateSecondaryPerPrimary,
  };
}
