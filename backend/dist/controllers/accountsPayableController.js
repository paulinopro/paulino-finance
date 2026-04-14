"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccountPayable = exports.payAccountPayable = exports.updateAccountPayable = exports.createAccountPayable = exports.getAccountsPayable = void 0;
const database_1 = require("../config/database");
const getAccountsPayable = async (req, res) => {
    try {
        const userId = req.userId;
        const { status } = req.query;
        let queryText = `
      SELECT id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at
      FROM accounts_payable
      WHERE user_id = $1
    `;
        const params = [userId];
        if (status) {
            queryText += ' AND status = $2';
            params.push(status);
        }
        queryText += ' ORDER BY due_date ASC, created_at DESC';
        const result = await (0, database_1.query)(queryText, params);
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
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            })),
        });
    }
    catch (error) {
        console.error('Get accounts payable error:', error);
        res.status(500).json({ message: 'Error fetching accounts payable', error: error.message });
    }
};
exports.getAccountsPayable = getAccountsPayable;
const createAccountPayable = async (req, res) => {
    try {
        const userId = req.userId;
        const { description, amount, currency, dueDate, category, notes } = req.body;
        if (!description || !amount || !currency || !dueDate) {
            return res.status(400).json({ message: 'Description, amount, currency, and due date are required' });
        }
        const result = await (0, database_1.query)(`INSERT INTO accounts_payable (user_id, description, amount, currency, due_date, category, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at`, [userId, description, amount, currency, dueDate, category || null, notes || null]);
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
                createdAt: account.created_at,
                updatedAt: account.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Create account payable error:', error);
        res.status(500).json({ message: 'Error creating account payable', error: error.message });
    }
};
exports.createAccountPayable = createAccountPayable;
const updateAccountPayable = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { description, amount, currency, dueDate, category, notes } = req.body;
        const result = await (0, database_1.query)(`UPDATE accounts_payable
       SET description = COALESCE($1, description),
           amount = COALESCE($2, amount),
           currency = COALESCE($3, currency),
           due_date = COALESCE($4, due_date),
           category = COALESCE($5, category),
           notes = COALESCE($6, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8
       RETURNING id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at`, [description, amount, currency, dueDate, category, notes, id, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Account payable not found' });
        }
        const account = result.rows[0];
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
                createdAt: account.created_at,
                updatedAt: account.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update account payable error:', error);
        res.status(500).json({ message: 'Error updating account payable', error: error.message });
    }
};
exports.updateAccountPayable = updateAccountPayable;
const payAccountPayable = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { paidDate, notes } = req.body;
        // Get the account payable
        const accountResult = await (0, database_1.query)(`SELECT id, description, amount, currency, category, status
       FROM accounts_payable
       WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ message: 'Account payable not found' });
        }
        const account = accountResult.rows[0];
        if (account.status === 'PAID') {
            return res.status(400).json({ message: 'Account payable is already paid' });
        }
        // Update account payable status
        const updateResult = await (0, database_1.query)(`UPDATE accounts_payable
       SET status = 'PAID',
           paid_date = COALESCE($1, CURRENT_DATE),
           notes = COALESCE($2, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at`, [paidDate || new Date().toISOString().split('T')[0], notes, id, userId]);
        // Add to expenses as non-recurring expense
        await (0, database_1.query)(`INSERT INTO expenses (user_id, description, amount, currency, expense_type, category, date, is_paid)
       VALUES ($1, $2, $3, $4, 'NON_RECURRING', $5, $6, true)`, [
            userId,
            `Pago: ${account.description}`,
            account.amount,
            account.currency,
            account.category || 'Cuentas por Pagar',
            paidDate || new Date().toISOString().split('T')[0],
        ]);
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
                createdAt: updateResult.rows[0].created_at,
                updatedAt: updateResult.rows[0].updated_at,
            },
        });
    }
    catch (error) {
        console.error('Pay account payable error:', error);
        res.status(500).json({ message: 'Error paying account payable', error: error.message });
    }
};
exports.payAccountPayable = payAccountPayable;
const deleteAccountPayable = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const result = await (0, database_1.query)('DELETE FROM accounts_payable WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Account payable not found' });
        }
        res.json({
            success: true,
            message: 'Account payable deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete account payable error:', error);
        res.status(500).json({ message: 'Error deleting account payable', error: error.message });
    }
};
exports.deleteAccountPayable = deleteAccountPayable;
//# sourceMappingURL=accountsPayableController.js.map