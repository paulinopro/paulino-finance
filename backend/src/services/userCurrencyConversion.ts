import { query } from '../config/database';
import { getOrRefreshSnapshot } from './openErRatesService';
import { getDefaultExchangeRateDopUsd } from '../utils/exchangeRate';
import { resolvedCurrencyPairFromRow, type UserCurrencyPair } from '../utils/userCurrencyPair';

export type UserConversionContext = {
  userId: number;
  pair: UserCurrencyPair;
  /** Tasas con base = moneda principal: amount_in_C / rates[C] = amount en principal */
  rates: Record<string, number>;
  /** Secundaria por 1 principal (para mostrar en UI). */
  pairRateSecondaryPerPrimary: number;
  usedManualPairRate: boolean;
};

function parseManual(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = parseFloat(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Tasa legado: `exchange_rate_dop_usd` = DOP por 1 USD (multiplicar USD * tasa → DOP).
 * Convierte a secundaria por 1 principal según el par actual.
 */
function legacyDopUsdToPairSecondaryPerPrimary(pair: UserCurrencyPair, legacyDopUsd: unknown): number | null {
  const leg = parseManual(legacyDopUsd);
  if (leg == null) return null;
  const p = pair.primary;
  const s = pair.secondary;
  if (p === 'USD' && s === 'DOP') return leg;
  if (p === 'DOP' && s === 'USD') return 1 / leg;
  return null;
}

/**
 * Contexto de conversión para un usuario: tasas con base = moneda principal.
 * Si `exchange_rate_manual` > 0, sustituye solo la tasa del código secundario del par.
 */
export async function getConversionContextForUser(userId: number): Promise<UserConversionContext> {
  const r = await query(
    `SELECT currency_preference, secondary_currency_preference, exchange_rate_manual, exchange_rate_dop_usd
     FROM users WHERE id = $1`,
    [userId]
  );
  const row = r.rows[0] || {};
  const pair = resolvedCurrencyPairFromRow(row as { currency_preference?: string; secondary_currency_preference?: string });

  let { rates } = await getOrRefreshSnapshot(pair.primary);

  const manual = parseManual((row as { exchange_rate_manual?: unknown }).exchange_rate_manual);
  let usedManual = false;
  if (manual != null) {
    rates = { ...rates, [pair.secondary]: manual };
    usedManual = true;
  } else {
    const legacyPair = legacyDopUsdToPairSecondaryPerPrimary(pair, (row as { exchange_rate_dop_usd?: unknown }).exchange_rate_dop_usd);
    if (legacyPair != null) {
      rates = { ...rates, [pair.secondary]: legacyPair };
      usedManual = true;
    }
  }

  let pairRate = rates[pair.secondary];
  if (pairRate == null || !Number.isFinite(pairRate) || pairRate <= 0) {
    const fallback = getDefaultExchangeRateDopUsd();
    if (pair.primary === 'USD' && pair.secondary === 'DOP') {
      pairRate = fallback;
      rates = { ...rates, DOP: fallback };
    } else if (pair.primary === 'DOP' && pair.secondary === 'USD') {
      pairRate = 1 / fallback;
      rates = { ...rates, USD: pairRate };
    } else {
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
export function amountToPrimary(amount: number, currency: string, ctx: UserConversionContext): number {
  const c = String(currency || '')
    .trim()
    .toUpperCase();
  const p = ctx.pair.primary;
  if (c === p) return amount;
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
export function bankBalancesToPrimary(balanceDop: number, balanceUsd: number, ctx: UserConversionContext): number {
  return (
    amountToPrimary(balanceDop, ctx.pair.primary, ctx) +
    amountToPrimary(balanceUsd, ctx.pair.secondary, ctx)
  );
}
