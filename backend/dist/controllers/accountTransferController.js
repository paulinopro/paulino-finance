"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAccountTransfer = exports.listAccountTransfers = void 0;
const database_1 = require("../config/database");
const accountBalance_1 = require("../services/accountBalance");
const listAccountTransfers = async (req, res) => {
    try {
        const userId = req.userId;
        const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
        const result = await (0, database_1.query)(`SELECT t.id, t.from_account_id, t.to_account_id, t.amount, t.currency, t.note, t.created_at,
              fa.bank_name AS from_bank_name, ta.bank_name AS to_bank_name
       FROM account_transfers t
       JOIN bank_accounts fa ON fa.id = t.from_account_id
       JOIN bank_accounts ta ON ta.id = t.to_account_id
       WHERE t.user_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2`, [userId, limit]);
        const transfers = result.rows.map((row) => ({
            id: row.id,
            fromAccountId: row.from_account_id,
            toAccountId: row.to_account_id,
            amount: parseFloat(row.amount),
            currency: row.currency,
            note: row.note,
            createdAt: row.created_at,
            fromBankName: row.from_bank_name,
            toBankName: row.to_bank_name,
        }));
        res.json({ success: true, transfers });
    }
    catch (error) {
        console.error('List transfers error:', error);
        res.status(500).json({ message: 'Error listing transfers', error: error.message });
    }
};
exports.listAccountTransfers = listAccountTransfers;
const createAccountTransfer = async (req, res) => {
    const userId = req.userId;
    const { fromAccountId, toAccountId, amount, currency, note } = req.body;
    const amt = parseFloat(String(amount));
    if (!fromAccountId || !toAccountId || !currency || amount == null || isNaN(amt) || amt <= 0) {
        return res.status(400).json({ message: 'fromAccountId, toAccountId, amount (>0) and currency are required' });
    }
    if (String(currency) !== 'DOP' && String(currency) !== 'USD') {
        return res.status(400).json({ message: 'currency must be DOP or USD' });
    }
    if (Number(fromAccountId) === Number(toAccountId)) {
        return res.status(400).json({ message: 'Source and destination accounts must differ' });
    }
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        const from = await (0, accountBalance_1.getAccountRow)(userId, Number(fromAccountId), client);
        const to = await (0, accountBalance_1.getAccountRow)(userId, Number(toAccountId), client);
        if (!from || !to) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Account not found' });
        }
        const fromBal = (0, accountBalance_1.parseBalanceForCurrency)(from, currency);
        if (fromBal + 1e-9 < amt) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Insufficient balance in the source account for this currency' });
        }
        await (0, accountBalance_1.applyBalanceDelta)(userId, Number(fromAccountId), currency, -amt, client);
        await (0, accountBalance_1.applyBalanceDelta)(userId, Number(toAccountId), currency, amt, client);
        const ins = await client.query(`INSERT INTO account_transfers (user_id, from_account_id, to_account_id, amount, currency, note)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`, [userId, Number(fromAccountId), Number(toAccountId), amt, currency, note ?? null]);
        await client.query('COMMIT');
        const row = ins.rows[0];
        res.status(201).json({
            success: true,
            message: 'Transfer completed',
            transfer: {
                id: row.id,
                fromAccountId: Number(fromAccountId),
                toAccountId: Number(toAccountId),
                amount: amt,
                currency,
                note: note ?? null,
                createdAt: row.created_at,
            },
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Create transfer error:', error);
        if (error.message === 'CURRENCY_MISMATCH') {
            return res.status(400).json({ message: 'Currency does not match one of the accounts' });
        }
        res.status(500).json({ message: 'Error creating transfer', error: error.message });
    }
    finally {
        client.release();
    }
};
exports.createAccountTransfer = createAccountTransfer;
//# sourceMappingURL=accountTransferController.js.map