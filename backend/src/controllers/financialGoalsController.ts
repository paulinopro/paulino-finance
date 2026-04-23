import { Response } from 'express';
import { getClient, query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { applyBalanceDelta, getAccountRow, isCurrencyAllowedForAccount } from '../services/accountBalance';

function parseBankAccountIdBody(
  body: Record<string, unknown>,
  mode: 'create' | 'update',
  previous: number | null
): number | null {
  if (!('bankAccountId' in body)) {
    return mode === 'create' ? null : previous;
  }
  const v = (body as Record<string, unknown>).bankAccountId;
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

async function validateGoalBankAccount(
  userId: number,
  accountId: number | null,
  currency: string
): Promise<string | null> {
  if (!accountId) return null;
  const row = await getAccountRow(userId, accountId);
  if (!row) return 'Cuenta no encontrada';
  if (!isCurrencyAllowedForAccount(row.currency_type, currency)) {
    return 'La moneda de la meta debe coincidir con la cuenta (o usar cuenta DUAL)';
  }
  return null;
}

export const getFinancialGoals = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { status } = req.query;

    let queryText = `
      SELECT fg.id, fg.name, fg.description, fg.target_amount, fg.current_amount, fg.currency, fg.target_date, fg.status,
             fg.created_at, fg.updated_at, fg.bank_account_id,
             ba.bank_name AS bank_account_name
      FROM financial_goals fg
      LEFT JOIN bank_accounts ba ON ba.id = fg.bank_account_id AND ba.user_id = fg.user_id
      WHERE fg.user_id = $1
    `;
    const params: any[] = [userId];

    if (status) {
      queryText += ' AND fg.status = $2';
      params.push(status);
    }

    queryText += ' ORDER BY fg.created_at DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      goals: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        targetAmount: parseFloat(row.target_amount),
        currentAmount: parseFloat(row.current_amount || 0),
        currency: row.currency,
        targetDate: row.target_date,
        status: row.status,
        progress: (parseFloat(row.current_amount || 0) / parseFloat(row.target_amount)) * 100,
        remaining: parseFloat(row.target_amount) - parseFloat(row.current_amount || 0),
        bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
        bankAccountName: row.bank_account_name != null ? String(row.bank_account_name) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('Get financial goals error:', error);
    res.status(500).json({ message: 'Error fetching financial goals', error: error.message });
  }
};

export const createFinancialGoal = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const body = req.body as Record<string, unknown>;
    const { name, description, targetAmount, currency, targetDate } = req.body as Record<string, any>;

    if (!name || !targetAmount || !currency) {
      return res.status(400).json({ message: 'Name, target amount, and currency are required' });
    }

    const bankAccountId = parseBankAccountIdBody(body, 'create', null);
    const errAcc = await validateGoalBankAccount(userId, bankAccountId, String(currency));
    if (errAcc) {
      return res.status(400).json({ message: errAcc });
    }

    const result = await query(
      `INSERT INTO financial_goals (user_id, name, description, target_amount, currency, target_date, bank_account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, target_amount, current_amount, currency, target_date, status, bank_account_id, created_at, updated_at`,
      [userId, name, description || null, targetAmount, currency, targetDate || null, bankAccountId]
    );

    const goal = result.rows[0];

    res.status(201).json({
      success: true,
      goal: {
        id: goal.id,
        name: goal.name,
        description: goal.description,
        targetAmount: parseFloat(goal.target_amount),
        currentAmount: parseFloat(goal.current_amount || 0),
        currency: goal.currency,
        targetDate: goal.target_date,
        status: goal.status,
        progress: 0,
        remaining: parseFloat(goal.target_amount),
        bankAccountId: goal.bank_account_id != null ? goal.bank_account_id : null,
        bankAccountName: null,
        createdAt: goal.created_at,
        updatedAt: goal.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Create financial goal error:', error);
    res.status(500).json({ message: 'Error creating financial goal', error: error.message });
  }
};

export const updateFinancialGoal = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const body = req.body as Record<string, unknown>;
    const { name, description, targetAmount, currency, targetDate, currentAmount, status } = req.body as Record<string, any>;

    const prevRow = await query(
      `SELECT bank_account_id, currency FROM financial_goals WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (prevRow.rows.length === 0) {
      return res.status(404).json({ message: 'Financial goal not found' });
    }
    const prevBank = prevRow.rows[0].bank_account_id as number | null;
    const effCurrency = currency !== undefined && currency !== null ? String(currency) : String(prevRow.rows[0].currency);
    const newBankId = parseBankAccountIdBody(body, 'update', prevBank);
    const errAcc = await validateGoalBankAccount(userId, newBankId, effCurrency);
    if (errAcc) {
      return res.status(400).json({ message: errAcc });
    }

    const result = await query(
      `UPDATE financial_goals
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           target_amount = COALESCE($3, target_amount),
           currency = COALESCE($4, currency),
           target_date = COALESCE($5, target_date),
           current_amount = COALESCE($6, current_amount),
           status = COALESCE($7, status),
           bank_account_id = $8,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND user_id = $10
       RETURNING id, name, description, target_amount, current_amount, currency, target_date, status, bank_account_id, created_at, updated_at`,
      [name, description, targetAmount, currency, targetDate, currentAmount, status, newBankId, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Financial goal not found' });
    }

    const goal = result.rows[0];
    const baName = await query(`SELECT bank_name FROM bank_accounts WHERE id = $1 AND user_id = $2`, [
      goal.bank_account_id,
      userId,
    ]);

    // Auto-complete if current amount >= target amount
    let finalStatus = goal.status;
    if (parseFloat(goal.current_amount || 0) >= parseFloat(goal.target_amount) && goal.status === 'ACTIVE') {
      finalStatus = 'COMPLETED';
      await query(
        `UPDATE financial_goals SET status = 'COMPLETED' WHERE id = $1`,
        [id]
      );
    }

    res.json({
      success: true,
      goal: {
        id: goal.id,
        name: goal.name,
        description: goal.description,
        targetAmount: parseFloat(goal.target_amount),
        currentAmount: parseFloat(goal.current_amount || 0),
        currency: goal.currency,
        targetDate: goal.target_date,
        status: finalStatus,
        progress: (parseFloat(goal.current_amount || 0) / parseFloat(goal.target_amount)) * 100,
        remaining: parseFloat(goal.target_amount) - parseFloat(goal.current_amount || 0),
        bankAccountId: goal.bank_account_id != null ? goal.bank_account_id : null,
        bankAccountName:
          goal.bank_account_id != null && baName.rows.length > 0
            ? String(baName.rows[0].bank_name)
            : null,
        createdAt: goal.created_at,
        updatedAt: goal.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Update financial goal error:', error);
    res.status(500).json({ message: 'Error updating financial goal', error: error.message });
  }
};

export const deleteFinancialGoal = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { id } = req.params;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const gRes = await client.query(
      `SELECT id, currency FROM financial_goals WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (gRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Financial goal not found' });
    }
    const cur = String(gRes.rows[0].currency);

    const movs = await client.query(
      `SELECT bank_account_id, source_bank_account_id, amount FROM financial_goal_movements WHERE goal_id = $1 AND user_id = $2`,
      [id, userId]
    );

    for (const row of movs.rows) {
      const destId = row.bank_account_id as number | null;
      const srcId = row.source_bank_account_id as number | null;
      const amt = parseFloat(row.amount);
      try {
        if (srcId) {
          await applyBalanceDelta(userId, srcId, cur, amt, client);
        }
        if (destId) {
          await applyBalanceDelta(userId, destId, cur, -amt, client);
        }
      } catch (e: any) {
        await client.query('ROLLBACK');
        console.error('Revert goal movements balance:', e);
        return res.status(500).json({ message: 'Error al revertir saldos de la meta' });
      }
    }

    const result = await client.query('DELETE FROM financial_goals WHERE id = $1 AND user_id = $2 RETURNING id', [
      id,
      userId,
    ]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Financial goal not found' });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Financial goal deleted successfully',
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Delete financial goal error:', error);
    res.status(500).json({ message: 'Error deleting financial goal', error: error.message });
  } finally {
    client.release();
  }
};
