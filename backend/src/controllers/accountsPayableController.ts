import { Response } from 'express';
import { getClient, query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { applyBalanceDelta } from '../services/accountBalance';
import {
  roundMoney,
  getTotalPaidPayable,
  recalculatePayableStatus,
  expenseDescriptionForPayable,
} from '../services/accountsPaymentLinkSync';

function optionalBankAccountId(body: Record<string, unknown>): number | null {
  const v = body.bankAccountId;
  if (v == null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

function parseBankAccountIdUpdate(body: Record<string, unknown>, previous: number | null): number | null {
  if (!('bankAccountId' in body)) return previous;
  return optionalBankAccountId(body);
}

export const getAccountsPayable = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { status } = req.query;

    let queryText = `
      SELECT ap.id, ap.description, ap.amount, ap.currency, ap.due_date, ap.status, ap.category, ap.notes, ap.paid_date, ap.created_at, ap.updated_at,
             COALESCE(pay.total_paid, 0)::numeric as total_paid
      FROM accounts_payable ap
      LEFT JOIN (
        SELECT account_payable_id, SUM(amount) AS total_paid
        FROM accounts_payable_payments
        GROUP BY account_payable_id
      ) pay ON pay.account_payable_id = ap.id
      WHERE ap.user_id = $1
    `;
    const params: any[] = [userId];

    if (status) {
      queryText += ' AND ap.status = $2';
      params.push(status);
    }

    queryText += ' ORDER BY ap.due_date ASC, ap.created_at DESC';

    const result = await query(queryText, params);

    res.json({
      success: true,
      accountsPayable: result.rows.map((row) => ({
        id: row.id,
        description: row.description,
        amount: parseFloat(row.amount),
        currency: row.currency,
        dueDate: row.due_date,
        status: row.status,
        category: row.category,
        notes: row.notes,
        paidDate: row.paid_date,
        totalPaid: roundMoney(parseFloat(row.total_paid)),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('Get accounts payable error:', error);
    res.status(500).json({ message: 'Error fetching accounts payable', error: error.message });
  }
};

export const getAccountPayablePayments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const check = await query(
      `SELECT id FROM accounts_payable WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Account payable not found' });
    }

    const result = await query(
      `SELECT p.id, p.amount, p.payment_date, p.created_at,
              e.bank_account_id,
              ba.bank_name AS bank_account_name,
              ba.account_number AS bank_account_number
       FROM accounts_payable_payments p
       LEFT JOIN expenses e ON e.id = p.expense_id
       LEFT JOIN bank_accounts ba ON ba.id = e.bank_account_id AND ba.user_id = p.user_id
       WHERE p.account_payable_id = $1 AND p.user_id = $2
       ORDER BY p.payment_date DESC, p.id DESC`,
      [id, userId]
    );

    res.json({
      success: true,
      payments: result.rows.map((row) => ({
        id: row.id,
        amount: parseFloat(row.amount),
        paymentDate: row.payment_date,
        createdAt: row.created_at,
        bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
        bankAccountName: row.bank_account_name != null ? String(row.bank_account_name) : null,
        bankAccountNumber: row.bank_account_number != null ? String(row.bank_account_number) : null,
      })),
    });
  } catch (error: any) {
    console.error('Get account payable payments error:', error);
    res.status(500).json({ message: 'Error fetching payments', error: error.message });
  }
};

export const addAccountPayablePayment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { amount, paymentDate } = req.body;

    if (amount == null || paymentDate == null || paymentDate === '') {
      return res.status(400).json({ message: 'amount and paymentDate are required' });
    }

    const payAmount = roundMoney(parseFloat(String(amount)));
    if (payAmount <= 0 || isNaN(payAmount)) {
      return res.status(400).json({ message: 'amount must be greater than zero' });
    }

    const accountResult = await query(
      `SELECT id, description, amount, currency, category, status
       FROM accounts_payable
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: 'Account payable not found' });
    }

    const account = accountResult.rows[0];

    if (account.status === 'PAID') {
      return res.status(400).json({ message: 'Account payable is already paid' });
    }

    const totalPaid = await getTotalPaidPayable(Number(id));
    const totalDue = roundMoney(parseFloat(account.amount));
    const remaining = roundMoney(totalDue - totalPaid);

    if (remaining <= 0) {
      return res.status(400).json({ message: 'No remaining balance' });
    }

    if (payAmount > remaining + 0.005) {
      return res.status(400).json({ message: `Amount exceeds remaining balance (${remaining})` });
    }

    const bankAccountId = optionalBankAccountId(req.body as Record<string, unknown>);

    const expenseResult = await query(
      `INSERT INTO expenses (user_id, description, amount, currency, nature, recurrence_type, frequency, category, date, is_paid, bank_account_id)
       VALUES ($1, $2, $3, $4, 'variable', 'non_recurrent', NULL, $5, $6, true, $7)
       RETURNING id`,
      [
        userId,
        `Abono: ${account.description}`,
        payAmount,
        account.currency,
        account.category || 'Cuentas por Pagar',
        paymentDate,
        bankAccountId,
      ]
    );

    const expenseId = expenseResult.rows[0].id;

    if (bankAccountId) {
      try {
        await applyBalanceDelta(userId, bankAccountId, account.currency, -payAmount);
      } catch (e: any) {
        console.error('AP payment balance:', e);
      }
    }

    await query(
      `INSERT INTO accounts_payable_payments (account_payable_id, user_id, amount, payment_date, expense_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, payAmount, paymentDate, expenseId]
    );

    const newTotalPaid = roundMoney(totalPaid + payAmount);

    if (newTotalPaid >= totalDue - 0.005) {
      await query(
        `UPDATE accounts_payable
         SET status = 'PAID',
             paid_date = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3`,
        [paymentDate, id, userId]
      );
    }

    const totalPaidAfter = await getTotalPaidPayable(Number(id));

    const rowResult = await query(
      `SELECT id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at
       FROM accounts_payable WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    const ar = rowResult.rows[0];

    res.status(201).json({
      success: true,
      message: 'Payment recorded',
      totalPaid: totalPaidAfter,
      accountPayable: {
        id: ar.id,
        description: ar.description,
        amount: parseFloat(ar.amount),
        currency: ar.currency,
        dueDate: ar.due_date,
        status: ar.status,
        category: ar.category,
        notes: ar.notes,
        paidDate: ar.paid_date,
        totalPaid: totalPaidAfter,
        createdAt: ar.created_at,
        updatedAt: ar.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Add account payable payment error:', error);
    res.status(500).json({ message: 'Error recording payment', error: error.message });
  }
};

export const updateAccountPayablePayment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id, paymentId } = req.params;
    const { amount, paymentDate } = req.body;

    if (amount == null || paymentDate == null || paymentDate === '') {
      return res.status(400).json({ message: 'amount and paymentDate are required' });
    }

    const payAmount = roundMoney(parseFloat(String(amount)));
    if (payAmount <= 0 || isNaN(payAmount)) {
      return res.status(400).json({ message: 'amount must be greater than zero' });
    }

    const accountResult = await query(
      `SELECT id, description, amount, currency, category
       FROM accounts_payable WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: 'Account payable not found' });
    }
    const account = accountResult.rows[0];

    const payRow = await query(
      `SELECT id, amount, expense_id FROM accounts_payable_payments
       WHERE id = $1 AND account_payable_id = $2 AND user_id = $3`,
      [paymentId, id, userId]
    );
    if (payRow.rows.length === 0) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const prev = payRow.rows[0];
    const prevAmt = roundMoney(parseFloat(prev.amount));
    const totalDue = roundMoney(parseFloat(account.amount));
    const totalPaid = await getTotalPaidPayable(Number(id));
    const otherSum = roundMoney(totalPaid - prevAmt);
    if (otherSum + payAmount > totalDue + 0.005) {
      return res.status(400).json({
        message: `El monto excede el saldo pendiente (${roundMoney(totalDue - otherSum)})`,
      });
    }

    const expenseId = prev.expense_id as number | null;

    let prevExpenseBank: number | null = null;
    if (expenseId) {
      const er = await query(`SELECT bank_account_id FROM expenses WHERE id = $1 AND user_id = $2`, [
        expenseId,
        userId,
      ]);
      prevExpenseBank = er.rows[0]?.bank_account_id != null ? (er.rows[0].bank_account_id as number) : null;
    }
    const newBankId = parseBankAccountIdUpdate(req.body as Record<string, unknown>, prevExpenseBank);

    const client = await getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE accounts_payable_payments
         SET amount = $1, payment_date = $2
         WHERE id = $3 AND account_payable_id = $4 AND user_id = $5`,
        [payAmount, paymentDate, paymentId, id, userId]
      );

      if (expenseId) {
        const cur = String(account.currency);

        if (prevExpenseBank) {
          try {
            await applyBalanceDelta(userId, prevExpenseBank, cur, prevAmt, client);
          } catch (e: any) {
            await client.query('ROLLBACK');
            console.error('AP update revert balance:', e);
            return res.status(500).json({ message: 'Error al ajustar saldo de la cuenta (reversión)' });
          }
        }

        const desc = await expenseDescriptionForPayable(expenseId, userId, account.description);
        await client.query(
          `UPDATE expenses
           SET amount = $1, date = $2, description = $3, currency = $4,
               category = COALESCE($5, category),
               bank_account_id = $6,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $7 AND user_id = $8`,
          [
            payAmount,
            paymentDate,
            desc,
            account.currency,
            account.category || 'Cuentas por Pagar',
            newBankId,
            expenseId,
            userId,
          ]
        );

        if (newBankId) {
          try {
            await applyBalanceDelta(userId, newBankId, cur, -payAmount, client);
          } catch (e: any) {
            await client.query('ROLLBACK');
            if (e?.message === 'ACCOUNT_NOT_FOUND' || e?.message === 'CURRENCY_MISMATCH') {
              return res.status(400).json({
                message:
                  e.message === 'CURRENCY_MISMATCH'
                    ? 'La moneda no coincide con la cuenta seleccionada'
                    : 'Cuenta no encontrada',
              });
            }
            throw e;
          }
        }
      }

      await client.query('COMMIT');
    } catch (e: any) {
      await client.query('ROLLBACK');
      console.error('Update AP payment tx:', e);
      return res.status(500).json({ message: 'Error al actualizar abono', error: e.message });
    } finally {
      client.release();
    }

    await recalculatePayableStatus(Number(id), userId);
    const totalPaidAfter = await getTotalPaidPayable(Number(id));
    const rowResult = await query(
      `SELECT id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at
       FROM accounts_payable WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    const ar = rowResult.rows[0];

    res.json({
      success: true,
      message: 'Abono actualizado; gasto sincronizado',
      totalPaid: totalPaidAfter,
      accountPayable: {
        id: ar.id,
        description: ar.description,
        amount: parseFloat(ar.amount),
        currency: ar.currency,
        dueDate: ar.due_date,
        status: ar.status,
        category: ar.category,
        notes: ar.notes,
        paidDate: ar.paid_date,
        totalPaid: totalPaidAfter,
        createdAt: ar.created_at,
        updatedAt: ar.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Update account payable payment error:', error);
    res.status(500).json({ message: 'Error updating payment', error: error.message });
  }
};

export const deleteAccountPayablePayment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id, paymentId } = req.params;

    const payRow = await query(
      `SELECT expense_id FROM accounts_payable_payments
       WHERE id = $1 AND account_payable_id = $2 AND user_id = $3`,
      [paymentId, id, userId]
    );
    if (payRow.rows.length === 0) {
      return res.status(404).json({ message: 'Payment not found' });
    }

    const expenseId = payRow.rows[0].expense_id as number | null;
    if (expenseId) {
      await query(`DELETE FROM expenses WHERE id = $1 AND user_id = $2`, [expenseId, userId]);
    }

    await query(
      `DELETE FROM accounts_payable_payments WHERE id = $1 AND account_payable_id = $2 AND user_id = $3`,
      [paymentId, id, userId]
    );

    await recalculatePayableStatus(Number(id), userId);
    const totalPaidAfter = await getTotalPaidPayable(Number(id));
    const rowResult = await query(
      `SELECT id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at
       FROM accounts_payable WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (rowResult.rows.length === 0) {
      return res.json({ success: true, message: 'Abono eliminado', totalPaid: 0 });
    }
    const ar = rowResult.rows[0];

    res.json({
      success: true,
      message: 'Abono eliminado; gasto eliminado en el módulo de gastos',
      totalPaid: totalPaidAfter,
      accountPayable: {
        id: ar.id,
        description: ar.description,
        amount: parseFloat(ar.amount),
        currency: ar.currency,
        dueDate: ar.due_date,
        status: ar.status,
        category: ar.category,
        notes: ar.notes,
        paidDate: ar.paid_date,
        totalPaid: totalPaidAfter,
        createdAt: ar.created_at,
        updatedAt: ar.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Delete account payable payment error:', error);
    res.status(500).json({ message: 'Error deleting payment', error: error.message });
  }
};

export const createAccountPayable = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { description, amount, currency, dueDate, category, notes } = req.body;

    if (!description || !amount || !currency || !dueDate) {
      return res.status(400).json({ message: 'Description, amount, currency, and due date are required' });
    }

    const result = await query(
      `INSERT INTO accounts_payable (user_id, description, amount, currency, due_date, category, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at`,
      [userId, description, amount, currency, dueDate, category || null, notes || null]
    );

    const account = result.rows[0];

    res.status(201).json({
      success: true,
      accountPayable: {
        id: account.id,
        description: account.description,
        amount: parseFloat(account.amount),
        currency: account.currency,
        dueDate: account.due_date,
        status: account.status,
        category: account.category,
        notes: account.notes,
        paidDate: account.paid_date,
        totalPaid: 0,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Create account payable error:', error);
    res.status(500).json({ message: 'Error creating account payable', error: error.message });
  }
};

export const updateAccountPayable = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { description, amount, currency, dueDate, category, notes } = req.body;

    if (amount != null) {
      const paid = await getTotalPaidPayable(Number(id));
      if (roundMoney(parseFloat(String(amount))) < paid - 0.005) {
        return res.status(400).json({
          message: `Amount cannot be less than total paid (${paid})`,
        });
      }
    }

    const result = await query(
      `UPDATE accounts_payable
       SET description = COALESCE($1, description),
           amount = COALESCE($2, amount),
           currency = COALESCE($3, currency),
           due_date = COALESCE($4, due_date),
           category = COALESCE($5, category),
           notes = COALESCE($6, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8
       RETURNING id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at`,
      [description, amount, currency, dueDate, category, notes, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Account payable not found' });
    }

    const account = result.rows[0];
    const totalPaid = await getTotalPaidPayable(Number(id));

    res.json({
      success: true,
      accountPayable: {
        id: account.id,
        description: account.description,
        amount: parseFloat(account.amount),
        currency: account.currency,
        dueDate: account.due_date,
        status: account.status,
        category: account.category,
        notes: account.notes,
        paidDate: account.paid_date,
        totalPaid,
        createdAt: account.created_at,
        updatedAt: account.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Update account payable error:', error);
    res.status(500).json({ message: 'Error updating account payable', error: error.message });
  }
};

export const payAccountPayable = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;
    const { paidDate, paymentDate, notes } = req.body;
    const dateStr = paymentDate ?? paidDate;

    if (!dateStr || String(dateStr).trim() === '') {
      return res.status(400).json({ message: 'paymentDate is required (YYYY-MM-DD)' });
    }

    const accountResult = await query(
      `SELECT id, description, amount, currency, category, status
       FROM accounts_payable
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (accountResult.rows.length === 0) {
      return res.status(404).json({ message: 'Account payable not found' });
    }

    const account = accountResult.rows[0];

    if (account.status === 'PAID') {
      return res.status(400).json({ message: 'Account payable is already paid' });
    }

    const totalPaid = await getTotalPaidPayable(Number(id));
    const totalDue = roundMoney(parseFloat(account.amount));
    const remaining = roundMoney(totalDue - totalPaid);

    if (remaining <= 0) {
      return res.status(400).json({ message: 'No remaining balance' });
    }

    const bankAccountId = optionalBankAccountId(req.body as Record<string, unknown>);

    const expenseResult = await query(
      `INSERT INTO expenses (user_id, description, amount, currency, nature, recurrence_type, frequency, category, date, is_paid, bank_account_id)
       VALUES ($1, $2, $3, $4, 'variable', 'non_recurrent', NULL, $5, $6, true, $7)
       RETURNING id`,
      [
        userId,
        `Pago: ${account.description}`,
        remaining,
        account.currency,
        account.category || 'Cuentas por Pagar',
        dateStr,
        bankAccountId,
      ]
    );

    const expenseId = expenseResult.rows[0].id;

    if (bankAccountId) {
      try {
        await applyBalanceDelta(userId, bankAccountId, account.currency, -remaining);
      } catch (e: any) {
        console.error('AP pay balance:', e);
      }
    }

    await query(
      `INSERT INTO accounts_payable_payments (account_payable_id, user_id, amount, payment_date, expense_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, userId, remaining, dateStr, expenseId]
    );

    const updateResult = await query(
      `UPDATE accounts_payable
       SET status = 'PAID',
           paid_date = $1,
           notes = COALESCE($2, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at`,
      [dateStr, notes ?? null, id, userId]
    );

    const totalPaidAfter = await getTotalPaidPayable(Number(id));

    res.json({
      success: true,
      message: 'Account payable marked as paid and added to expenses',
      accountPayable: {
        id: updateResult.rows[0].id,
        description: updateResult.rows[0].description,
        amount: parseFloat(updateResult.rows[0].amount),
        currency: updateResult.rows[0].currency,
        dueDate: updateResult.rows[0].due_date,
        status: updateResult.rows[0].status,
        category: updateResult.rows[0].category,
        notes: updateResult.rows[0].notes,
        paidDate: updateResult.rows[0].paid_date,
        totalPaid: totalPaidAfter,
        createdAt: updateResult.rows[0].created_at,
        updatedAt: updateResult.rows[0].updated_at,
      },
    });
  } catch (error: any) {
    console.error('Pay account payable error:', error);
    res.status(500).json({ message: 'Error paying account payable', error: error.message });
  }
};

export const deleteAccountPayable = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const expRows = await query(
      `SELECT expense_id FROM accounts_payable_payments
       WHERE account_payable_id = $1 AND expense_id IS NOT NULL`,
      [id]
    );
    for (const row of expRows.rows) {
      await query(`DELETE FROM expenses WHERE id = $1 AND user_id = $2`, [row.expense_id, userId]);
    }

    const result = await query(
      'DELETE FROM accounts_payable WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Account payable not found' });
    }

    res.json({
      success: true,
      message: 'Cuenta por pagar eliminada; gastos vinculados eliminados',
    });
  } catch (error: any) {
    console.error('Delete account payable error:', error);
    res.status(500).json({ message: 'Error deleting account payable', error: error.message });
  }
};
