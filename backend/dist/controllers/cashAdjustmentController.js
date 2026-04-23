"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCashAdjustment = exports.listCashAdjustments = void 0;
const database_1 = require("../config/database");
const accountBalance_1 = require("../services/accountBalance");
const listCashAdjustments = async (req, res) => {
    try {
        const userId = req.userId;
        const limit = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);
        const result = await (0, database_1.query)(`SELECT c.id, c.bank_account_id, c.amount_delta, c.currency, c.reason, c.counted_total, c.created_at,
              b.bank_name, b.account_kind
       FROM cash_adjustments c
       JOIN bank_accounts b ON b.id = c.bank_account_id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC
       LIMIT $2`, [userId, limit]);
        const adjustments = result.rows.map((row) => ({
            id: row.id,
            bankAccountId: row.bank_account_id,
            amountDelta: parseFloat(row.amount_delta),
            currency: row.currency,
            reason: row.reason,
            countedTotal: row.counted_total != null ? parseFloat(row.counted_total) : null,
            createdAt: row.created_at,
            bankName: row.bank_name,
            accountKind: row.account_kind,
        }));
        res.json({ success: true, adjustments });
    }
    catch (error) {
        console.error('List cash adjustments error:', error);
        res.status(500).json({ message: 'Error listing adjustments', error: error.message });
    }
};
exports.listCashAdjustments = listCashAdjustments;
const createCashAdjustment = async (req, res) => {
    const userId = req.userId;
    const accountId = parseInt(req.params.id, 10);
    const { amountDelta, currency, reason, countedTotal } = req.body;
    if (amountDelta == null || !currency) {
        return res.status(400).json({ message: 'amountDelta and currency are required' });
    }
    const delta = parseFloat(String(amountDelta));
    if (isNaN(delta) || delta === 0) {
        return res.status(400).json({ message: 'amountDelta must be a non-zero number' });
    }
    if (String(currency) !== 'DOP' && String(currency) !== 'USD') {
        return res.status(400).json({ message: 'currency must be DOP or USD' });
    }
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        await (0, accountBalance_1.applyBalanceDelta)(userId, accountId, String(currency), delta, client);
        const ins = await client.query(`INSERT INTO cash_adjustments (user_id, bank_account_id, amount_delta, currency, reason, counted_total)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at`, [
            userId,
            accountId,
            delta,
            currency,
            reason ?? null,
            countedTotal != null && countedTotal !== '' ? parseFloat(String(countedTotal)) : null,
        ]);
        await client.query('COMMIT');
        const row = ins.rows[0];
        res.status(201).json({
            success: true,
            message: 'Adjustment recorded',
            adjustment: {
                id: row.id,
                bankAccountId: accountId,
                amountDelta: delta,
                currency,
                reason: reason ?? null,
                countedTotal: countedTotal != null && countedTotal !== '' ? parseFloat(String(countedTotal)) : null,
                createdAt: row.created_at,
            },
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Cash adjustment error:', error);
        if (error.message === 'ACCOUNT_NOT_FOUND') {
            return res.status(404).json({ message: 'Account not found' });
        }
        if (error.message === 'CURRENCY_MISMATCH') {
            return res.status(400).json({ message: 'Currency does not match the account' });
        }
        res.status(500).json({ message: 'Error recording adjustment', error: error.message });
    }
    finally {
        client.release();
    }
};
exports.createCashAdjustment = createCashAdjustment;
//# sourceMappingURL=cashAdjustmentController.js.map