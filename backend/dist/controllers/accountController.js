"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccount = exports.updateAccount = exports.createAccount = exports.listBankAccountMovements = exports.getAccount = exports.getAccounts = void 0;
const database_1 = require("../config/database");
const accountBalance_1 = require("../services/accountBalance");
const BAL_EPS = 1e-9;
const getAccounts = async (req, res) => {
    try {
        const userId = req.userId;
        const { search, bank, kind } = req.query;
        let queryText = `
      SELECT id, bank_name, account_type, account_number, balance_dop, balance_usd,
              currency_type, account_kind, created_at, updated_at
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
        if (kind && (kind === 'bank' || kind === 'cash' || kind === 'wallet')) {
            queryText += ` AND account_kind = $${paramIndex}`;
            params.push(kind);
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
            accountKind: row.account_kind || 'bank',
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
        const isCashLike = (k) => k === 'cash' || k === 'wallet';
        const totalBankDop = accounts
            .filter((a) => a.accountKind === 'bank' && (a.currencyType === 'DOP' || a.currencyType === 'DUAL'))
            .reduce((s, a) => s + a.balanceDop, 0);
        const totalBankUsd = accounts
            .filter((a) => a.accountKind === 'bank' && (a.currencyType === 'USD' || a.currencyType === 'DUAL'))
            .reduce((s, a) => s + a.balanceUsd, 0);
        const totalCashDop = accounts
            .filter((a) => isCashLike(a.accountKind) && (a.currencyType === 'DOP' || a.currencyType === 'DUAL'))
            .reduce((s, a) => s + a.balanceDop, 0);
        const totalCashUsd = accounts
            .filter((a) => isCashLike(a.accountKind) && (a.currencyType === 'USD' || a.currencyType === 'DUAL'))
            .reduce((s, a) => s + a.balanceUsd, 0);
        res.json({
            success: true,
            accounts,
            summary: {
                totalBalanceDop,
                totalBalanceUsd,
                totalAccounts: accounts.length,
                totalBankDop,
                totalBankUsd,
                totalCashDop,
                totalCashUsd,
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
const listBankAccountMovements = async (req, res) => {
    try {
        const userId = req.userId;
        const accountId = parseInt(req.params.id);
        if (Number.isNaN(accountId)) {
            return res.status(400).json({ message: 'Invalid account id' });
        }
        const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
        const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);
        const own = await (0, database_1.query)('SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2', [
            accountId,
            userId,
        ]);
        if (own.rows.length === 0) {
            return res.status(404).json({ message: 'Account not found' });
        }
        const [result, countR] = await Promise.all([
            (0, database_1.query)(`SELECT id, amount, currency, direction, description, status, occurred_at
         FROM bank_account_movements
         WHERE user_id = $1 AND bank_account_id = $2
         ORDER BY occurred_at DESC, id DESC
         LIMIT $3 OFFSET $4`, [userId, accountId, limit, offset]),
            (0, database_1.query)(`SELECT COUNT(*)::int AS c FROM bank_account_movements WHERE user_id = $1 AND bank_account_id = $2`, [userId, accountId]),
        ]);
        res.json({
            success: true,
            movements: result.rows.map((r) => ({
                id: r.id,
                amount: parseFloat(r.amount),
                currency: r.currency,
                direction: r.direction,
                description: r.description,
                status: r.status,
                occurredAt: r.occurred_at,
            })),
            total: countR.rows[0]?.c ?? 0,
        });
    }
    catch (error) {
        console.error('List account movements error:', error);
        res.status(500).json({ message: 'Error listing movements', error: error.message });
    }
};
exports.listBankAccountMovements = listBankAccountMovements;
const createAccount = async (req, res) => {
    try {
        const userId = req.userId;
        const { bankName, accountType, accountNumber, balanceDop, balanceUsd, currencyType, accountKind } = req.body;
        if (!bankName || !accountType || !currencyType) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        const kind = accountKind === 'cash' || accountKind === 'wallet' || accountKind === 'bank' ? accountKind : 'bank';
        const result = await (0, database_1.query)(`INSERT INTO bank_accounts 
       (user_id, bank_name, account_type, account_number, balance_dop, balance_usd, currency_type, account_kind)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, bank_name, account_type, account_number, balance_dop, balance_usd,
                 currency_type, account_kind, created_at, updated_at`, [
            userId,
            bankName,
            accountType,
            accountNumber || null,
            balanceDop || 0,
            balanceUsd || 0,
            currencyType,
            kind,
        ]);
        const row = result.rows[0];
        const accId = row.id;
        const ct = row.currency_type;
        const bd = parseFloat(row.balance_dop || 0);
        const bu = parseFloat(row.balance_usd || 0);
        if ((0, accountBalance_1.isCurrencyAllowedForAccount)(ct, 'DOP') && bd > BAL_EPS) {
            await (0, accountBalance_1.recordBankAccountMovement)(userId, accId, 'DOP', 'IN', bd, 'Saldo inicial (DOP)');
        }
        if ((0, accountBalance_1.isCurrencyAllowedForAccount)(ct, 'USD') && bu > BAL_EPS) {
            await (0, accountBalance_1.recordBankAccountMovement)(userId, accId, 'USD', 'IN', bu, 'Saldo inicial (USD)');
        }
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
                accountKind: row.account_kind || 'bank',
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
        const { bankName, accountType, accountNumber, balanceDop, balanceUsd, currencyType, accountKind } = req.body;
        const checkResult = await (0, database_1.query)(`SELECT id, balance_dop, balance_usd, currency_type FROM bank_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Account not found' });
        }
        const prev = checkResult.rows[0];
        const oldDop = parseFloat(prev.balance_dop || 0);
        const oldUsd = parseFloat(prev.balance_usd || 0);
        const kindUpdate = accountKind === 'cash' || accountKind === 'wallet' || accountKind === 'bank' ? accountKind : null;
        const result = await (0, database_1.query)(`UPDATE bank_accounts
       SET bank_name = COALESCE($1, bank_name),
           account_type = COALESCE($2, account_type),
           account_number = COALESCE($3, account_number),
           balance_dop = COALESCE($4, balance_dop),
           balance_usd = COALESCE($5, balance_usd),
           currency_type = COALESCE($6, currency_type),
           account_kind = COALESCE($7, account_kind),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND user_id = $9
       RETURNING id, bank_name, account_type, account_number, balance_dop, balance_usd,
                 currency_type, account_kind, created_at, updated_at`, [
            bankName,
            accountType,
            accountNumber,
            balanceDop,
            balanceUsd,
            currencyType,
            kindUpdate,
            accountId,
            userId,
        ]);
        const row = result.rows[0];
        const ct = row.currency_type;
        const newDop = parseFloat(row.balance_dop || 0);
        const newUsd = parseFloat(row.balance_usd || 0);
        if ((0, accountBalance_1.isCurrencyAllowedForAccount)(ct, 'DOP')) {
            const dDop = newDop - oldDop;
            if (Math.abs(dDop) > BAL_EPS) {
                await (0, accountBalance_1.recordBankAccountMovement)(userId, accountId, 'DOP', dDop > 0 ? 'IN' : 'OUT', Math.abs(dDop), 'Ajuste manual de balance (DOP)');
            }
        }
        if ((0, accountBalance_1.isCurrencyAllowedForAccount)(ct, 'USD')) {
            const dUsd = newUsd - oldUsd;
            if (Math.abs(dUsd) > BAL_EPS) {
                await (0, accountBalance_1.recordBankAccountMovement)(userId, accountId, 'USD', dUsd > 0 ? 'IN' : 'OUT', Math.abs(dUsd), 'Ajuste manual de balance (USD)');
            }
        }
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
                accountKind: row.account_kind || 'bank',
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