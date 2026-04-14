"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccount = exports.updateAccount = exports.createAccount = exports.getAccount = exports.getAccounts = void 0;
const database_1 = require("../config/database");
const getAccounts = async (req, res) => {
    try {
        const userId = req.userId;
        const { search, bank } = req.query;
        let queryText = `
      SELECT id, bank_name, account_type, account_number, balance_dop, balance_usd,
              currency_type, created_at, updated_at
       FROM bank_accounts
       WHERE user_id = $1
    `;
        const params = [userId];
        let paramIndex = 2;
        if (search) {
            queryText += ` AND (bank_name ILIKE $${paramIndex} OR account_type ILIKE $${paramIndex} OR account_number ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (bank) {
            queryText += ` AND bank_name ILIKE $${paramIndex}`;
            params.push(`%${bank}%`);
            paramIndex++;
        }
        queryText += ` ORDER BY created_at DESC`;
        const result = await (0, database_1.query)(queryText, params);
        const accounts = result.rows.map((row) => ({
            id: row.id,
            bankName: row.bank_name,
            accountType: row.account_type,
            accountNumber: row.account_number,
            balanceDop: parseFloat(row.balance_dop || 0),
            balanceUsd: parseFloat(row.balance_usd || 0),
            currencyType: row.currency_type,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        // Calculate totals
        const totalBalanceDop = accounts.reduce((sum, a) => {
            if (a.currencyType === 'DOP' || a.currencyType === 'DUAL') {
                return sum + a.balanceDop;
            }
            return sum;
        }, 0);
        const totalBalanceUsd = accounts.reduce((sum, a) => {
            if (a.currencyType === 'USD' || a.currencyType === 'DUAL') {
                return sum + a.balanceUsd;
            }
            return sum;
        }, 0);
        res.json({
            success: true,
            accounts,
            summary: {
                totalBalanceDop,
                totalBalanceUsd,
                totalAccounts: accounts.length,
            },
        });
    }
    catch (error) {
        console.error('Get accounts error:', error);
        res.status(500).json({ message: 'Error fetching accounts', error: error.message });
    }
};
exports.getAccounts = getAccounts;
const getAccount = async (req, res) => {
    try {
        const userId = req.userId;
        const accountId = parseInt(req.params.id);
        const result = await (0, database_1.query)(`SELECT id, bank_name, account_type, account_number, balance_dop, balance_usd,
              currency_type, created_at, updated_at
       FROM bank_accounts
       WHERE id = $1 AND user_id = $2`, [accountId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Account not found' });
        }
        const row = result.rows[0];
        res.json({
            success: true,
            account: {
                id: row.id,
                bankName: row.bank_name,
                accountType: row.account_type,
                accountNumber: row.account_number,
                balanceDop: parseFloat(row.balance_dop || 0),
                balanceUsd: parseFloat(row.balance_usd || 0),
                currencyType: row.currency_type,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Get account error:', error);
        res.status(500).json({ message: 'Error fetching account', error: error.message });
    }
};
exports.getAccount = getAccount;
const createAccount = async (req, res) => {
    try {
        const userId = req.userId;
        const { bankName, accountType, accountNumber, balanceDop, balanceUsd, currencyType } = req.body;
        if (!bankName || !accountType || !currencyType) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        const result = await (0, database_1.query)(`INSERT INTO bank_accounts 
       (user_id, bank_name, account_type, account_number, balance_dop, balance_usd, currency_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, bank_name, account_type, account_number, balance_dop, balance_usd,
                 currency_type, created_at, updated_at`, [
            userId,
            bankName,
            accountType,
            accountNumber || null,
            balanceDop || 0,
            balanceUsd || 0,
            currencyType,
        ]);
        const row = result.rows[0];
        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            account: {
                id: row.id,
                bankName: row.bank_name,
                accountType: row.account_type,
                accountNumber: row.account_number,
                balanceDop: parseFloat(row.balance_dop || 0),
                balanceUsd: parseFloat(row.balance_usd || 0),
                currencyType: row.currency_type,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Create account error:', error);
        res.status(500).json({ message: 'Error creating account', error: error.message });
    }
};
exports.createAccount = createAccount;
const updateAccount = async (req, res) => {
    try {
        const userId = req.userId;
        const accountId = parseInt(req.params.id);
        const { bankName, accountType, accountNumber, balanceDop, balanceUsd, currencyType } = req.body;
        const checkResult = await (0, database_1.query)('SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2', [accountId, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Account not found' });
        }
        const result = await (0, database_1.query)(`UPDATE bank_accounts
       SET bank_name = COALESCE($1, bank_name),
           account_type = COALESCE($2, account_type),
           account_number = COALESCE($3, account_number),
           balance_dop = COALESCE($4, balance_dop),
           balance_usd = COALESCE($5, balance_usd),
           currency_type = COALESCE($6, currency_type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8
       RETURNING id, bank_name, account_type, account_number, balance_dop, balance_usd,
                 currency_type, created_at, updated_at`, [
            bankName,
            accountType,
            accountNumber,
            balanceDop,
            balanceUsd,
            currencyType,
            accountId,
            userId,
        ]);
        const row = result.rows[0];
        res.json({
            success: true,
            message: 'Account updated successfully',
            account: {
                id: row.id,
                bankName: row.bank_name,
                accountType: row.account_type,
                accountNumber: row.account_number,
                balanceDop: parseFloat(row.balance_dop || 0),
                balanceUsd: parseFloat(row.balance_usd || 0),
                currencyType: row.currency_type,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update account error:', error);
        res.status(500).json({ message: 'Error updating account', error: error.message });
    }
};
exports.updateAccount = updateAccount;
const deleteAccount = async (req, res) => {
    try {
        const userId = req.userId;
        const accountId = parseInt(req.params.id);
        const result = await (0, database_1.query)('DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2 RETURNING id', [accountId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Account not found' });
        }
        res.json({
            success: true,
            message: 'Account deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ message: 'Error deleting account', error: error.message });
    }
};
exports.deleteAccount = deleteAccount;
//# sourceMappingURL=accountController.js.map