import { PoolClient } from 'pg';
import { query } from '../config/database';

function run(
  client: PoolClient | undefined,
  text: string,
  params: unknown[]
): Promise<import('pg').QueryResult> {
  if (client) return client.query(text, params);
  return query(text, params);
}

export async function getExpensePeriodAmount(
  userId: number,
  expenseId: number,
  year: number,
  month: number,
  client?: PoolClient
): Promise<number | null> {
  const r = await run(
    client,
    `SELECT amount FROM expense_period_amounts
     WHERE user_id = $1 AND expense_id = $2 AND year = $3 AND month = $4`,
    [userId, expenseId, year, month]
  );
  if (r.rows.length === 0) return null;
  return parseFloat(String(r.rows[0].amount));
}

export async function upsertExpensePeriodAmount(
  client: PoolClient | undefined,
  userId: number,
  expenseId: number,
  year: number,
  month: number,
  amount: number
): Promise<void> {
  await run(
    client,
    `INSERT INTO expense_period_amounts (expense_id, user_id, year, month, amount, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (expense_id, year, month)
     DO UPDATE SET amount = EXCLUDED.amount, updated_at = CURRENT_TIMESTAMP`,
    [expenseId, userId, year, month, amount]
  );
}

export async function deleteExpensePeriodAmount(
  client: PoolClient | undefined,
  userId: number,
  expenseId: number,
  year: number,
  month: number
): Promise<void> {
  await run(
    client,
    `DELETE FROM expense_period_amounts
     WHERE user_id = $1 AND expense_id = $2 AND year = $3 AND month = $4`,
    [userId, expenseId, year, month]
  );
}

export async function getIncomePeriodAmount(
  userId: number,
  incomeId: number,
  year: number,
  month: number,
  client?: PoolClient
): Promise<number | null> {
  const r = await run(
    client,
    `SELECT amount FROM income_period_amounts
     WHERE user_id = $1 AND income_id = $2 AND year = $3 AND month = $4`,
    [userId, incomeId, year, month]
  );
  if (r.rows.length === 0) return null;
  return parseFloat(String(r.rows[0].amount));
}

export async function upsertIncomePeriodAmount(
  client: PoolClient | undefined,
  userId: number,
  incomeId: number,
  year: number,
  month: number,
  amount: number
): Promise<void> {
  await run(
    client,
    `INSERT INTO income_period_amounts (income_id, user_id, year, month, amount, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (income_id, year, month)
     DO UPDATE SET amount = EXCLUDED.amount, updated_at = CURRENT_TIMESTAMP`,
    [incomeId, userId, year, month, amount]
  );
}

export async function deleteIncomePeriodAmount(
  client: PoolClient | undefined,
  userId: number,
  incomeId: number,
  year: number,
  month: number
): Promise<void> {
  await run(
    client,
    `DELETE FROM income_period_amounts
     WHERE user_id = $1 AND income_id = $2 AND year = $3 AND month = $4`,
    [userId, incomeId, year, month]
  );
}
