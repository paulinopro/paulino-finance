"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFinancialGoal = exports.updateFinancialGoal = exports.createFinancialGoal = exports.getFinancialGoals = void 0;
const database_1 = require("../config/database");
const getFinancialGoals = async (req, res) => {
    try {
        const userId = req.userId;
        const { status } = req.query;
        let queryText = `
      SELECT id, name, description, target_amount, current_amount, currency, target_date, status, created_at, updated_at
      FROM financial_goals
      WHERE user_id = $1
    `;
        const params = [userId];
        if (status) {
            queryText += ' AND status = $2';
            params.push(status);
        }
        queryText += ' ORDER BY created_at DESC';
        const result = await (0, database_1.query)(queryText, params);
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
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            })),
        });
    }
    catch (error) {
        console.error('Get financial goals error:', error);
        res.status(500).json({ message: 'Error fetching financial goals', error: error.message });
    }
};
exports.getFinancialGoals = getFinancialGoals;
const createFinancialGoal = async (req, res) => {
    try {
        const userId = req.userId;
        const { name, description, targetAmount, currency, targetDate } = req.body;
        if (!name || !targetAmount || !currency) {
            return res.status(400).json({ message: 'Name, target amount, and currency are required' });
        }
        const result = await (0, database_1.query)(`INSERT INTO financial_goals (user_id, name, description, target_amount, currency, target_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, description, target_amount, current_amount, currency, target_date, status, created_at, updated_at`, [userId, name, description || null, targetAmount, currency, targetDate || null]);
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
                createdAt: goal.created_at,
                updatedAt: goal.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Create financial goal error:', error);
        res.status(500).json({ message: 'Error creating financial goal', error: error.message });
    }
};
exports.createFinancialGoal = createFinancialGoal;
const updateFinancialGoal = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { name, description, targetAmount, currency, targetDate, currentAmount, status } = req.body;
        const result = await (0, database_1.query)(`UPDATE financial_goals
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           target_amount = COALESCE($3, target_amount),
           currency = COALESCE($4, currency),
           target_date = COALESCE($5, target_date),
           current_amount = COALESCE($6, current_amount),
           status = COALESCE($7, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9
       RETURNING id, name, description, target_amount, current_amount, currency, target_date, status, created_at, updated_at`, [name, description, targetAmount, currency, targetDate, currentAmount, status, id, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Financial goal not found' });
        }
        const goal = result.rows[0];
        // Auto-complete if current amount >= target amount
        let finalStatus = goal.status;
        if (parseFloat(goal.current_amount || 0) >= parseFloat(goal.target_amount) && goal.status === 'ACTIVE') {
            finalStatus = 'COMPLETED';
            await (0, database_1.query)(`UPDATE financial_goals SET status = 'COMPLETED' WHERE id = $1`, [id]);
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
                createdAt: goal.created_at,
                updatedAt: goal.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update financial goal error:', error);
        res.status(500).json({ message: 'Error updating financial goal', error: error.message });
    }
};
exports.updateFinancialGoal = updateFinancialGoal;
const deleteFinancialGoal = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const result = await (0, database_1.query)('DELETE FROM financial_goals WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Financial goal not found' });
        }
        res.json({
            success: true,
            message: 'Financial goal deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete financial goal error:', error);
        res.status(500).json({ message: 'Error deleting financial goal', error: error.message });
    }
};
exports.deleteFinancialGoal = deleteFinancialGoal;
//# sourceMappingURL=financialGoalsController.js.map