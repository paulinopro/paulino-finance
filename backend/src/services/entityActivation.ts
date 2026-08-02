import { query } from '../config/database';

const ENTITY_TABLES = {
  accounts: 'bank_accounts',
  income: 'income',
  expenses: 'expenses',
  cards: 'credit_cards',
  loans: 'loans',
  accountsPayable: 'accounts_payable',
  accountsReceivable: 'accounts_receivable',
} as const;

export type ActivatableEntity = keyof typeof ENTITY_TABLES;

type QueryResultLike = { rows: any[] };
export type ActivationQueryExecutor = (
  sql: string,
  params?: unknown[]
) => Promise<QueryResultLike>;

const defaultExecutor: ActivationQueryExecutor = (sql, params) => query(sql, params);

export class InactiveEntityError extends Error {
  readonly code = 'ENTITY_INACTIVE';

  constructor(message = 'La entidad está inactiva') {
    super(message);
    this.name = 'InactiveEntityError';
  }
}

export async function setEntityActiveStatus(
  entity: ActivatableEntity,
  id: number,
  userId: number,
  isActive: boolean,
  executor: ActivationQueryExecutor = defaultExecutor
): Promise<{ id: number; isActive: boolean } | null> {
  const table = ENTITY_TABLES[entity];
  const result = await executor(
    `UPDATE ${table}
     SET is_active = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND user_id = $3
     RETURNING id, is_active`,
    [isActive, id, userId]
  );
  const row = result.rows[0];
  return row ? { id: Number(row.id), isActive: row.is_active === true } : null;
}

export async function requireEntityActive(
  entity: ActivatableEntity,
  id: number,
  userId: number,
  executor: ActivationQueryExecutor = defaultExecutor
): Promise<void | false> {
  const table = ENTITY_TABLES[entity];
  const result = await executor(
    `SELECT is_active FROM ${table} WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  const row = result.rows[0];
  if (!row) return false;
  if (row.is_active !== true) throw new InactiveEntityError();
}
