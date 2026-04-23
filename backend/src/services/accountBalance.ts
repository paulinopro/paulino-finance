import { PoolClient } from 'pg';
import { query } from '../config/database';

export function isCurrencyAllowedForAccount(currencyType: string, currency: string): boolean {
  if (currencyType === 'DUAL') return currency === 'DOP' || currency === 'USD';
  if (currencyType === 'DOP') return currency === 'DOP';
  if (currencyType === 'USD') return currency === 'USD';
  return false;
}

export type AccountRow = {
  id: number;
  user_id: number;
  balance_dop: string;
  balance_usd: string;
  currency_type: string;
  account_kind: string;
};

async function runQuery(
  text: string,
  params: any[] | undefined,
  client?: PoolClient
) {
  if (client) return client.query(text, params);
  return query(text, params);
}

export async function getAccountRow(
  userId: number,
  accountId: number,
  client?: PoolClient
): Promise<AccountRow | undefined> {
  const r = await runQuery(
    `SELECT id, user_id, balance_dop, balance_usd, currency_type, account_kind
     FROM bank_accounts WHERE id = $1 AND user_id = $2`,
    [accountId, userId],
    client
  );
  return r.rows[0] as AccountRow | undefined;
}

export function parseBalanceForCurrency(row: AccountRow, currency: string): number {
  const v = currency === 'DOP' ? row.balance_dop : row.balance_usd;
  return parseFloat(v || '0');
}

/**
 * Adds delta to the balance in the given currency leg (DOP or USD).
 */
export async function applyBalanceDelta(
  userId: number,
  accountId: number,
  currency: string,
  delta: number,
  client?: PoolClient
): Promise<void> {
  const acc = await getAccountRow(userId, accountId, client);
  if (!acc) {
    throw new Error('ACCOUNT_NOT_FOUND');
  }
  if (!isCurrencyAllowedForAccount(acc.currency_type, currency)) {
    throw new Error('CURRENCY_MISMATCH');
  }
  if (currency === 'DOP') {
    await runQuery(
      `UPDATE bank_accounts SET balance_dop = balance_dop + $1::numeric, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [delta, accountId, userId],
      client
    );
  } else if (currency === 'USD') {
    await runQuery(
      `UPDATE bank_accounts SET balance_usd = balance_usd + $1::numeric, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [delta, accountId, userId],
      client
    );
  } else {
    throw new Error('CURRENCY_MISMATCH');
  }
}
