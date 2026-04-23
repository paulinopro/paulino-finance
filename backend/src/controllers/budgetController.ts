import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getBudgets = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { periodType, periodMonth, periodYear } = req.query;

    let queryText = `
      SELECT id, name, category, amount, currency, period_type, period_month, period_year, spent, created_at, updated_at
      FROM budgets
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (periodType) {
      queryText += ' AND period_type = $2';
      params.push(periodType);
    }

    if (periodYear) {
      queryText += ` AND period_year = $${params.length + 1}`;
      params.push(periodYear);
    }

    if (periodMonth) {
      queryText += ` AND period_month = $${params.length + 1}`;
      params.push(periodMonth);
    }

    queryText += ' ORDER BY period_year DESC, period_month DESC, created_at DESC';

    const result = await query(queryText, params);

    // Calculate spent amounts from expenses and accounts payable
    for (const budget of result.rows) {
      let spent = 0;

      // Get expenses for the budget period
      const spentResult = await query(
        `SELECT SUM(amount) as total
         FROM expenses
         WHERE user_id = $1
           AND currency = $2
           AND (category = $3 OR $3 IS NULL)
           AND (
             (recurrence_type = 'non_recurrent' AND EXTRACT(YEAR FROM date) = $4 ${
               budget.period_type === 'MONTHLY' ? 'AND EXTRACT(MONTH FROM date) = $5' : ''
             })
             OR (
               recurrence_type = 'recurrent'
               AND LOWER(TRIM(COALESCE(frequency, ''))) = 'monthly'
               AND $6 = 'MONTHLY'
             )
             OR (
               recurrence_type = 'recurrent'
               AND LOWER(TRIM(COALESCE(frequency, ''))) = 'annual'
               AND EXTRACT(YEAR FROM date) = $4
             )
           )`,
        budget.period_type === 'MONTHLY'
          ? [userId, budget.currency, budget.category, budget.period_year, budget.period_month, budget.period_type]
          : [userId, budget.currency, budget.category, budget.period_year, budget.period_type]
      );

      spent += parseFloat(spentResult.rows[0]?.total || 0);

      // Get accounts payable paid in the period
      const accountsPayableResult = await query(
        `SELECT SUM(amount) as total
         FROM accounts_payable
         WHERE user_id = $1
           AND currency = $2
           AND (category = $3 OR $3 IS NULL)
           AND status = 'PAID'
           AND EXTRACT(YEAR FROM paid_date) = $4 ${
             budget.period_type === 'MONTHLY' ? 'AND EXTRACT(MONTH FROM paid_date) = $5' : ''
           }`,
        budget.period_type === 'MONTHLY'
          ? [userId, budget.currency, budget.category, budget.period_year, budget.period_month]
          : [userId, budget.currency, budget.category, budget.period_year]
      );

      spent += parseFloat(accountsPayableResult.rows[0]?.total || 0);

      await query(
        `UPDATE budgets SET spent = $1 WHERE id = $2`,
        [spent, budget.id]
      );
    }

    // Fetch updated budgets
    const updatedResult = await query(queryText, params);

    res.json({
      success: true,
      budgets: updatedResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        category: row.category,
        amount: parseFloat(row.amount),
        currency: row.currency,
        periodType: row.period_type,
        periodMonth: row.period_month,
        periodYear: row.period_year,
        spent: parseFloat(row.spent || 0),
        remaining: parseFloat(row.amount) - parseFloat(row.spent || 0),
        percentage: (parseFloat(row.spent || 0) / parseFloat(row.amount)) * 100,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('Get budgets error:', error);
    res.status(500).json({ message: 'Error fetching budgets', error: error.message });
  }
};

export const createBudget = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name, category, amount, currency, periodType, periodMonth, periodYear } = req.body;

    if (!name || !amount || !currency || !periodType || !periodYear) {
      return res.status(400).json({ message: 'Name, amount, currency, period type, and period year are required' });
    }

    if (periodType === 'MONTHLY' && !periodMonth) {
      return res.status(400).json({ message: 'Period month is required for monthly budgets' });
    }

    const result = await query(
      `INSERT INTO budgets (user_id, name, category, amount, currency, period_type, period_month, period_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, category, amount, currency, period_type, period_month, period_year, spent, created_at, updated_at`,
      [userId, name, category || null, amount, currency, periodType, periodMonth || null, periodYear]
    );

    const budget = result.rows[0];

    res.status(201).json({
      success: true,
      budget: {
        id: budget.id,
        name: budget.name,
        category: budget.category,
        amount: parseFloat(budget.amount),
        currency: budget.currency,
        periodType: budget.period_type,
        periodMonth: budget.period_month,
        periodYear: budget.period_year,
        spent: parseFloat(budget.spent || 0),
        remaining: parseFloat(budget.amount) - parseFloat(budget.spent || 0),
        percentage: 0,
        createdAt: budget.created_at,
        updatedAt: budget.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Create budget error:', error);
    res.status(500).json({ message: 'Error creating budget', error: error.message });
  }
};

export const updateBudget = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { name, category, amount, currency, periodType, periodMonth, periodYear } = req.body;

    const result = await query(
      `UPDATE budgets
       SET name = COALESCE($1, name),
           category = COALESCE($2, category),
           amount = COALESCE($3, amount),
           currency = COALESCE($4, currency),
           period_type = COALESCE($5, period_type),
           period_month = COALESCE($6, period_month),
           period_year = COALESCE($7, period_year),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9
       RETURNING id, name, category, amount, currency, period_type, period_month, period_year, spent, created_at, updated_at`,
      [name, category, amount, currency, periodType, periodMonth, periodYear, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Budget not found' });
    }

    const budget = result.rows[0];

    res.json({
      success: true,
      budget: {
        id: budget.id,
        name: budget.name,
        category: budget.category,
        amount: parseFloat(budget.amount),
        currency: budget.currency,
        periodType: budget.period_type,
        periodMonth: budget.period_month,
        periodYear: budget.period_year,
        spent: parseFloat(budget.spent || 0),
        remaining: parseFloat(budget.amount) - parseFloat(budget.spent || 0),
        percentage: (parseFloat(budget.spent || 0) / parseFloat(budget.amount)) * 100,
        createdAt: budget.created_at,
        updatedAt: budget.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Update budget error:', error);
    res.status(500).json({ message: 'Error updating budget', error: error.message });
  }
};

export const deleteBudget = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Budget not found' });
    }

    res.json({
      success: true,
      message: 'Budget deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete budget error:', error);
    res.status(500).json({ message: 'Error deleting budget', error: error.message });
  }
};
