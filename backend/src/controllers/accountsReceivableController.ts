import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getAccountsReceivable = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { status } = req.query;

    let queryText = `
      SELECT id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at
      FROM accounts_receivable
      WHERE user_id = $1
    `;
    const params: any[] = [userId];

    if (status) {
      queryText += ' AND status = $2';
      params.push(status);
    }

    queryText += ' ORDER BY due_date ASC, created_at DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      accountsReceivable: result.rows.map((row) => ({
        id: row.id,
        description: row.description,
        amount: parseFloat(row.amount),
        currency: row.currency,
        dueDate: row.due_date,
        status: row.status,
        category: row.category,
        notes: row.notes,
        receivedDate: row.received_date,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('Get accounts receivable error:', error);
    res.status(500).json({ message: 'Error fetching accounts receivable', error: error.message });
  }
};

export const createAccountReceivable = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { description, amount, currency, dueDate, category, notes } = req.body;

    if (!description || !amount || !currency || !dueDate) {
      return res.status(400).json({ message: 'Description, amount, currency, and due date are required' });
    }

    const result = await query(
      `INSERT INTO accounts_receivable (user_id, description, amount, currency, due_date, category, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at`,
      [userId, description, amount, currency, dueDate, category || null, notes || null]
    );

    const account = result.rows[0];

    res.status(201).json({
      success: true,
      accountReceivable: {
        id: account.id,
        description: account.description,
        amount: parseFloat(account.amount),
        currency: account.currency,
        dueDate: account.due_date,
        status: account.status,
        category: account.category,
        notes: account.notes,
        receivedDate: account.received_date,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Create account receivable error:', error);
    res.status(500).json({ message: 'Error creating account receivable', error: error.message });
  }
};

export const updateAccountReceivable = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { description, amount, currency, dueDate, category, notes } = req.body;

    const result = await query(
      `UPDATE accounts_receivable
       SET description = COALESCE($1, description),
           amount = COALESCE($2, amount),
           currency = COALESCE($3, currency),
           due_date = COALESCE($4, due_date),
           category = COALESCE($5, category),
           notes = COALESCE($6, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8
       RETURNING id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at`,
      [description, amount, currency, dueDate, category, notes, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Account receivable not found' });
    }

    const account = result.rows[0];

    res.json({
      success: true,
      accountReceivable: {
        id: account.id,
        description: account.description,
        amount: parseFloat(account.amount),
        currency: account.currency,
        dueDate: account.due_date,
        status: account.status,
        category: account.category,
        notes: account.notes,
        receivedDate: account.received_date,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Update account receivable error:', error);
    res.status(500).json({ message: 'Error updating account receivable', error: error.message });
  }
};

export const receiveAccountReceivable = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { receivedDate, notes } = req.body;

    // Get the account receivable
    const accountResult = await query(
      `SELECT id, description, amount, currency, category, status
       FROM accounts_receivable
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: 'Account receivable not found' });
    }

    const account = accountResult.rows[0];

    if (account.status === 'RECEIVED') {
      return res.status(400).json({ message: 'Account receivable is already received' });
    }

    // Update account receivable status
    const updateResult = await query(
      `UPDATE accounts_receivable
       SET status = 'RECEIVED',
           received_date = COALESCE($1, CURRENT_DATE),
           notes = COALESCE($2, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at`,
      [receivedDate || new Date().toISOString().split('T')[0], notes, id, userId]
    );

    // Add to income as variable income
    await query(
      `INSERT INTO income (user_id, description, amount, currency, income_type, date)
       VALUES ($1, $2, $3, $4, 'VARIABLE', $5)`,
      [
        userId,
        `Cobro: ${account.description}`,
        account.amount,
        account.currency,
        receivedDate || new Date().toISOString().split('T')[0],
      ]
    );

    res.json({
      success: true,
      message: 'Account receivable marked as received and added to income',
      accountReceivable: {
        id: updateResult.rows[0].id,
        description: updateResult.rows[0].description,
        amount: parseFloat(updateResult.rows[0].amount),
        currency: updateResult.rows[0].currency,
        dueDate: updateResult.rows[0].due_date,
        status: updateResult.rows[0].status,
        category: updateResult.rows[0].category,
        notes: updateResult.rows[0].notes,
        receivedDate: updateResult.rows[0].received_date,
        createdAt: updateResult.rows[0].created_at,
        updatedAt: updateResult.rows[0].updated_at,
      },
    });
  } catch (error: any) {
    console.error('Receive account receivable error:', error);
    res.status(500).json({ message: 'Error receiving account receivable', error: error.message });
  }
};

export const deleteAccountReceivable = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const result = await query(
      'DELETE FROM accounts_receivable WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Account receivable not found' });
    }

    res.json({
      success: true,
      message: 'Account receivable deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete account receivable error:', error);
    res.status(500).json({ message: 'Error deleting account receivable', error: error.message });
  }
};
