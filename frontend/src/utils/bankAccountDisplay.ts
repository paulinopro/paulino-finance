import type { BankAccount } from '../types';

/** Texto para `<option>` y listas: nombre + número para distinguir cuentas repetidas. */
export function formatBankAccountOptionLabel(account: Pick<BankAccount, 'bankName' | 'accountNumber'>): string {
  const name = (account.bankName || '').trim() || 'Cuenta';
  const num = (account.accountNumber || '').trim();
  return num ? `${name} - ${num}` : name;
}
