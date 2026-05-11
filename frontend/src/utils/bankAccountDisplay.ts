import type { BankAccount } from '../types';

/**
 * Compatibilidad al cambiar el par de monedas en preferencias: en BD, `currencyType` en cuentas
 * es el **riel** (DOP = primaria, USD = secundaria, DUAL = ambas), no un ISO fijo.
 * Al filtrar por la moneda ISO del movimiento, hay que mapear riel → moneda actual del usuario.
 */
export function bankAccountSupportsLedgerCurrency(
  account: Pick<BankAccount, 'currencyType'>,
  ledgerCurrencyIso: string,
  primaryCurrency: string,
  secondaryCurrency: string
): boolean {
  const c = String(ledgerCurrencyIso ?? '')
    .trim()
    .toUpperCase();
  if (!c) return false;
  const p = String(primaryCurrency ?? '')
    .trim()
    .toUpperCase();
  const s = String(secondaryCurrency ?? '')
    .trim()
    .toUpperCase();
  const ct = account.currencyType;
  if (ct === 'DUAL') return c === p || c === s;
  if (ct === 'DOP') return c === p;
  if (ct === 'USD') return c === s;
  return false;
}

/** Texto para `<option>` y listas: nombre + número para distinguir cuentas repetidas. */
export function formatBankAccountOptionLabel(account: Pick<BankAccount, 'bankName' | 'accountNumber'>): string {
  const name = (account.bankName || '').trim() || 'Cuenta';
  const num = (account.accountNumber || '').trim();
  return num ? `${name} - ${num}` : name;
}
