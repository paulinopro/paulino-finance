"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteIncome = exports.updateIncome = exports.createIncome = exports.getIncomeItem = exports.getIncome = void 0;
const database_1 = require("../config/database");
const getIncome = async (req, res) => {
    try {
        const userId = req.userId;
        const { search, type, page = '1', limit = '20' } = req.query;
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
            whereClause += ` AND income_type = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }
        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM income ${whereClause}`;
        const countResult = await (0, database_1.query)(countQuery, params);
        const total = parseInt(countResult.rows[0].total);
        // Save params before adding limit/offset for totals query
        const paramsBeforePagination = [...params];
        // Get paginated results
        let queryText = `
      SELECT id, description, amount, currency, income_type, frequency,
              receipt_day, date, created_at, updated_at
       FROM income
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limitNum, offset);
        const result = await (0, database_1.query)(queryText, params);
        const income = result.rows.map((row) => ({
            id: row.id,
            description: row.description,
            amount: parseFloat(row.amount),
            currency: row.currency,
            incomeType: row.income_type,
            frequency: row.frequency,
            receiptDay: row.receipt_day,
            date: row.date,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        // Calculate totals for all income (not just current page)
        // Use params without limit and offset
        const allIncomeResult = await (0, database_1.query)(`SELECT amount, currency FROM income ${whereClause}`, paramsBeforePagination);
        const totalDop = allIncomeResult.rows
            .filter((row) => row.currency === 'DOP')
            .reduce((sum, row) => sum + parseFloat(row.amount), 0);
        const totalUsd = allIncomeResult.rows
            .filter((row) => row.currency === 'USD')
            .reduce((sum, row) => sum + parseFloat(row.amount), 0);
        // Get exchange rate for total calculation
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        const totalAmount = totalDop + (totalUsd * exchangeRate);
        const totalPages = Math.ceil(total / limitNum);
        res.json({
            success: true,
            income,
            summary: {
                totalDop,
                totalUsd,
                totalIncome: total,
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
        console.error('Get income error:', error);
        res.status(500).json({ message: 'Error fetching income', error: error.message });
    }
};
exports.getIncome = getIncome;
const getIncomeItem = async (req, res) => {
    try {
        const userId = req.userId;
        const incomeId = parseInt(req.params.id);
        const result = await (0, database_1.query)(`SELECT id, description, amount, currency, income_type, frequency,
              receipt_day, date, created_at, updated_at
       FROM income
       WHERE id = $1 AND user_id = $2`, [incomeId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Income item not found' });
        }
        const row = result.rows[0];
        res.json({
            success: true,
            income: {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                incomeType: row.income_type,
                frequency: row.frequency,
                receiptDay: row.receipt_day,
                date: row.date,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Get income item error:', error);
        res.status(500).json({ message: 'Error fetching income item', error: error.message });
    }
};
exports.getIncomeItem = getIncomeItem;
const createIncome = async (req, res) => {
    try {
        const userId = req.userId;
        const { description, amount, currency, incomeType, frequency, receiptDay, date } = req.body;
        if (!description || !amount || !incomeType) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        if (incomeType === 'FIXED') {
            if (frequency === 'MONTHLY' && !receiptDay) {
                return res.status(400).json({ message: 'Receipt day is required for monthly fixed income' });
            }
            if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && !date) {
                return res.status(400).json({ message: 'Start date is required for weekly/biweekly fixed income' });
            }
            // For MONTHLY: use receipt_day (day of month)
            // For WEEKLY/BIWEEKLY: use date as start date
        }
        if (incomeType === 'VARIABLE' && !date) {
            return res.status(400).json({ message: 'Date is required for variable income' });
        }
        const result = await (0, database_1.query)(`INSERT INTO income 
       (user_id, description, amount, currency, income_type, frequency, receipt_day, date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, description, amount, currency, income_type, frequency,
                 receipt_day, date, created_at, updated_at`, [
            userId,
            description,
            amount,
            currency || 'DOP',
            incomeType,
            frequency || null,
            receiptDay || null,
            date || null,
        ]);
        const row = result.rows[0];
        res.status(201).json({
            success: true,
            message: 'Income created successfully',
            income: {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                incomeType: row.income_type,
                frequency: row.frequency,
                receiptDay: row.receipt_day,
                date: row.date,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Create income error:', error);
        res.status(500).json({ message: 'Error creating income', error: error.message });
    }
};
exports.createIncome = createIncome;
const updateIncome = async (req, res) => {
    try {
        const userId = req.userId;
        const incomeId = parseInt(req.params.id);
        const { description, amount, currency, incomeType, frequency, receiptDay, date } = req.body;
        const checkResult = await (0, database_1.query)('SELECT id FROM income WHERE id = $1 AND user_id = $2', [incomeId, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Income item not found' });
        }
        const result = await (0, database_1.query)(`UPDATE income
       SET description = COALESCE($1, description),
           amount = COALESCE($2, amount),
           currency = COALESCE($3, currency),
           income_type = COALESCE($4, income_type),
           frequency = COALESCE($5, frequency),
           receipt_day = COALESCE($6, receipt_day),
           date = COALESCE($7, date),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9
       RETURNING id, description, amount, currency, income_type, frequency,
                 receipt_day, date, created_at, updated_at`, [
            description,
            amount,
            currency,
            incomeType,
            frequency,
            receiptDay,
            date,
            incomeId,
            userId,
        ]);
        const row = result.rows[0];
        res.json({
            success: true,
            message: 'Income updated successfully',
            income: {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                incomeType: row.income_type,
                frequency: row.frequency,
                receiptDay: row.receipt_day,
                date: row.date,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update income error:', error);
        res.status(500).json({ message: 'Error updating income', error: error.message });
    }
};
exports.updateIncome = updateIncome;
const deleteIncome = async (req, res) => {
    try {
        const userId = req.userId;
        const incomeId = parseInt(req.params.id);
        const result = await (0, database_1.query)('DELETE FROM income WHERE id = $1 AND user_id = $2 RETURNING id', [incomeId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Income item not found' });
        }
        res.json({
            success: true,
            message: 'Income deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete income error:', error);
        res.status(500).json({ message: 'Error deleting income', error: error.message });
    }
};
exports.deleteIncome = deleteIncome;
//# sourceMappingURL=incomeController.js.map