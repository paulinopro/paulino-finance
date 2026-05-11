import { query } from '../config/database';
import {
  AllowedCurrencyCode,
  normalizeCurrencyPreference,
} from '../constants/userPreferences';

export type UserCurrencyPair = { primary: AllowedCurrencyCode; secondary: AllowedCurrencyCode };

/** Moneda secundaria por defecto cuando falta dato o coincide con la principal */
export function defaultSecondaryForPrimary(primary: AllowedCurrencyCode): AllowedCurrencyCode {
  return primary === 'USD' ? 'DOP' : 'USD';
}

/** Par estable a partir de columnas de usuario (sync, p. ej. respuestas auth). */
export function resolvedCurrencyPairFromRow(row: {
  currency_preference?: string | null;
  secondary_currency_preference?: string | null;
}): UserCurrencyPair {
  const primary = normalizeCurrencyPreference(row?.currency_preference) || 'DOP';
  let secondary = normalizeCurrencyPreference(row?.secondary_currency_preference);
  if (!secondary || secondary === primary) {
    secondary = defaultSecondaryForPrimary(primary);
  }
  return { primary, secondary };
}

/** Campos en camelCase para respuestas JSON de auth. */
export function userCurrencyPreferencePayload(row: {
  currency_preference?: string | null;
  secondary_currency_preference?: string | null;
}): { currencyPreference: AllowedCurrencyCode; secondaryCurrencyPreference: AllowedCurrencyCode } {
  const pair = resolvedCurrencyPairFromRow(row);
  return {
    currencyPreference: pair.primary,
    secondaryCurrencyPreference: pair.secondary,
  };
}

export async function getUserCurrencyPair(userId: number): Promise<UserCurrencyPair> {
  const r = await query(
    `SELECT currency_preference, secondary_currency_preference FROM users WHERE id = $1`,
    [userId]
  );
  return resolvedCurrencyPairFromRow(r.rows[0] || {});
}

export function isCurrencyInUserPair(pair: UserCurrencyPair, currency: string): boolean {
  const c = String(currency ?? '')
    .trim()
    .toUpperCase();
  return c === pair.primary || c === pair.secondary;
}

/** Movimientos / transferencias: la moneda debe ser la principal o la secundaria del perfil. */
export function validateLedgerCurrencyForUser(pair: UserCurrencyPair, currency: string): string | null {
  const c = String(currency ?? '')
    .trim()
    .toUpperCase();
  if (!isCurrencyInUserPair(pair, c)) {
    return 'Elige una moneda del par configurado en Preferencias (principal o secundaria).';
  }
  return null;
}
