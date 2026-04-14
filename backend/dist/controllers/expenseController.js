"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateExpensePaymentStatus = exports.deleteExpense = exports.updateExpense = exports.createExpense = exports.getExpense = exports.getExpenses = void 0;
const database_1 = require("../config/database");
const getExpenses = async (req, res) => {
    try {
        const userId = req.userId;
        const { type, month, year, search, category, page = '1', limit = '20' } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;
        let whereClause = 'WHERE user_id = $1';
        const params = [userId];
        let paramIndex = 2;
        if (search) {
            whereClause += ` AND description ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (type) {
            whereClause += ` AND expense_type = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }
        if (category) {
            whereClause += ` AND category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }
        if (month && year && type === 'RECURRING_MONTHLY') {
            // For recurring monthly expenses, we return all and let frontend filter by month
            // This is a simplified approach
        }
        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM expenses ${whereClause}`;
        const countResult = await (0, database_1.query)(countQuery, params);
        const total = parseInt(countResult.rows[0].total);
        // Save paramIndex before adding limit/offset for totals query
        const paramsBeforePagination = [...params];
        const paramIndexBeforePagination = paramIndex;
        // Get paginated results
        let queryText = `
      SELECT id, description, amount, currency, expense_type, category,
             payment_day, payment_month, date, is_paid, last_paid_month, last_paid_year,
             created_at, updated_at
      FROM expenses
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limitNum, offset);
        const result = await (0, database_1.query)(queryText, params);
        // Get current month and year for recurring expenses
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        const expenses = result.rows.map((row) => {
            // For recurring monthly expenses, check if paid this month
            let isPaid = row.is_paid;
            if (row.expense_type === 'RECURRING_MONTHLY') {
                // Reset to unpaid if last paid month/year is not current month/year
                if (row.last_paid_month !== currentMonth || row.last_paid_year !== currentYear) {
                    isPaid = false;
                }
            }
            return {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                expenseType: row.expense_type,
                category: row.category,
                paymentDay: row.payment_day,
                paymentMonth: row.payment_month,
                date: row.date,
                isPaid: isPaid,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
        });
        // Calculate totals for all expenses (not just current page)
        // Use params without limit and offset
        const allExpensesResult = await (0, database_1.query)(`SELECT amount, currency FROM expenses ${whereClause}`, paramsBeforePagination);
        const totalDop = allExpensesResult.rows
            .filter((row) => row.currency === 'DOP')
            .reduce((sum, row) => sum + parseFloat(row.amount), 0);
        const totalUsd = allExpensesResult.rows
            .filter((row) => row.currency === 'USD')
            .reduce((sum, row) => sum + parseFloat(row.amount), 0);
        // Get exchange rate for total calculation
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        const totalAmount = totalDop + (totalUsd * exchangeRate);
        const totalPages = Math.ceil(total / limitNum);
        res.json({
            success: true,
            expenses,
            summary: {
                totalDop,
                totalUsd,
                totalExpenses: total,
            },
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages,
            },
        });
    }
    catch (error) {
        console.error('Get expenses error:', error);
        res.status(500).json({ message: 'Error fetching expenses', error: error.message });
    }
};
exports.getExpenses = getExpenses;
const getExpense = async (req, res) => {
    try {
        const userId = req.userId;
        const expenseId = parseInt(req.params.id);
        const result = await (0, database_1.query)(`SELECT id, description, amount, currency, expense_type, category,
              payment_day, payment_month, date, is_paid, last_paid_month, last_paid_year,
              created_at, updated_at
       FROM expenses
       WHERE id = $1 AND user_id = $2`, [expenseId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Expense not found' });
        }
        const row = result.rows[0];
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        // For recurring monthly expenses, check if paid this month
        let isPaid = row.is_paid;
        if (row.expense_type === 'RECURRING_MONTHLY') {
            if (row.last_paid_month !== currentMonth || row.last_paid_year !== currentYear) {
                isPaid = false;
            }
        }
        res.json({
            success: true,
            expense: {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                expenseType: row.expense_type,
                category: row.category,
                paymentDay: row.payment_day,
                paymentMonth: row.payment_month,
                date: row.date,
                isPaid: isPaid,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Get expense error:', error);
        res.status(500).json({ message: 'Error fetching expense', error: error.message });
    }
};
exports.getExpense = getExpense;
const createExpense = async (req, res) => {
    try {
        const userId = req.userId;
        const { description, amount, currency, expenseType, category, paymentDay, paymentMonth, date } = req.body;
        if (!description || !amount || !expenseType) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        if (expenseType === 'RECURRING_MONTHLY' && !paymentDay) {
            return res.status(400).json({ message: 'Payment day is required for recurring monthly expenses' });
        }
        if (expenseType === 'ANNUAL' && !paymentMonth) {
            return res.status(400).json({ message: 'Payment month is required for annual expenses' });
        }
        if (expenseType === 'NON_RECURRING' && !date) {
            return res.status(400).json({ message: 'Date is required for non-recurring expenses' });
        }
        const result = await (0, database_1.query)(`INSERT INTO expenses 
       (user_id, description, amount, currency, expense_type, category, payment_day, payment_month, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, description, amount, currency, expense_type, category,
                 payment_day, payment_month, date, is_paid, created_at, updated_at`, [
            userId,
            description,
            amount,
            currency || 'DOP',
            expenseType,
            category || null,
            paymentDay || null,
            paymentMonth || null,
            date || null,
        ]);
        const row = result.rows[0];
        res.status(201).json({
            success: true,
            message: 'Expense created successfully',
            expense: {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                expenseType: row.expense_type,
                category: row.category,
                paymentDay: row.payment_day,
                paymentMonth: row.payment_month,
                date: row.date,
                isPaid: row.is_paid,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Create expense error:', error);
        res.status(500).json({ message: 'Error creating expense', error: error.message });
    }
};
exports.createExpense = createExpense;
const updateExpense = async (req, res) => {
    try {
        const userId = req.userId;
        const expenseId = parseInt(req.params.id);
        const { description, amount, currency, expenseType, category, paymentDay, paymentMonth, date, isPaid } = req.body;
        const checkResult = await (0, database_1.query)('SELECT id FROM expenses WHERE id = $1 AND user_id = $2', [expenseId, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Expense not found' });
        }
        const result = await (0, database_1.query)(`UPDATE expenses
       SET description = COALESCE($1, description),
           amount = COALESCE($2, amount),
           currency = COALESCE($3, currency),
           expense_type = COALESCE($4, expense_type),
           category = COALESCE($5, category),
           payment_day = COALESCE($6, payment_day),
           payment_month = COALESCE($7, payment_month),
           date = COALESCE($8, date),
           is_paid = COALESCE($9, is_paid),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $10 AND user_id = $11
       RETURNING id, description, amount, currency, expense_type, category,
                 payment_day, payment_month, date, is_paid, created_at, updated_at`, [
            description,
            amount,
            currency,
            expenseType,
            category,
            paymentDay,
            paymentMonth,
            date,
            isPaid,
            expenseId,
            userId,
        ]);
        const row = result.rows[0];
        res.json({
            success: true,
            message: 'Expense updated successfully',
            expense: {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                expenseType: row.expense_type,
                category: row.category,
                paymentDay: row.payment_day,
                paymentMonth: row.payment_month,
                date: row.date,
                isPaid: row.is_paid,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update expense error:', error);
        res.status(500).json({ message: 'Error updating expense', error: error.message });
    }
};
exports.updateExpense = updateExpense;
const deleteExpense = async (req, res) => {
    try {
        const userId = req.userId;
        const expenseId = parseInt(req.params.id);
        const result = await (0, database_1.query)('DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id', [expenseId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Expense not found' });
        }
        res.json({
            success: true,
            message: 'Expense deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete expense error:', error);
        res.status(500).json({ message: 'Error deleting expense', error: error.message });
    }
};
exports.deleteExpense = deleteExpense;
const updateExpensePaymentStatus = async (req, res) => {
    try {
        const userId = req.userId;
        const expenseId = parseInt(req.params.id);
        const { isPaid } = req.body;
        if (typeof isPaid !== 'boolean') {
            return res.status(400).json({ message: 'isPaid must be a boolean' });
        }
        // Get expense to check if it's recurring
        const checkResult = await (0, database_1.query)('SELECT id, expense_type FROM expenses WHERE id = $1 AND user_id = $2', [expenseId, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Expense not found' });
        }
        const expense = checkResult.rows[0];
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        // For recurring monthly expenses, update last_paid_month/year
        if (expense.expense_type === 'RECURRING_MONTHLY' && isPaid) {
            const result = await (0, database_1.query)(`UPDATE expenses
         SET is_paid = $1, 
             last_paid_month = $2,
             last_paid_year = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND user_id = $5
         RETURNING id, description, is_paid, last_paid_month, last_paid_year, updated_at`, [isPaid, currentMonth, currentYear, expenseId, userId]);
            res.json({
                success: true,
                message: 'Payment status updated successfully',
                expense: {
                    id: result.rows[0].id,
                    description: result.rows[0].description,
                    isPaid: result.rows[0].is_paid,
                    updatedAt: result.rows[0].updated_at,
                },
            });
        }
        else {
            // For non-recurring expenses, just update is_paid
            const result = await (0, database_1.query)(`UPDATE expenses
         SET is_paid = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3
         RETURNING id, description, is_paid, updated_at`, [isPaid, expenseId, userId]);
            res.json({
                success: true,
                message: 'Payment status updated successfully',
                expense: {
                    id: result.rows[0].id,
                    description: result.rows[0].description,
                    isPaid: result.rows[0].is_paid,
                    updatedAt: result.rows[0].updated_at,
                },
            });
        }
    }
    catch (error) {
        console.error('Update payment status error:', error);
        res.status(500).json({ message: 'Error updating payment status', error: error.message });
    }
};
exports.updateExpensePaymentStatus = updateExpensePaymentStatus;
//# sourceMappingURL=expenseController.js.map