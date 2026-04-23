"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccountReceivable = exports.receiveAccountReceivable = exports.updateAccountReceivable = exports.createAccountReceivable = exports.deleteAccountReceivablePayment = exports.updateAccountReceivablePayment = exports.addAccountReceivablePayment = exports.getAccountReceivablePayments = exports.getAccountsReceivable = void 0;
const database_1 = require("../config/database");
const accountBalance_1 = require("../services/accountBalance");
const accountsPaymentLinkSync_1 = require("../services/accountsPaymentLinkSync");
function optionalBankAccountId(body) {
    const v = body.bankAccountId;
    if (v == null || v === '')
        return null;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? null : n;
}
function parseBankAccountIdUpdate(body, previous) {
    if (!('bankAccountId' in body))
        return previous;
    return optionalBankAccountId(body);
}
const getAccountsReceivable = async (req, res) => {
    try {
        const userId = req.userId;
        const { status } = req.query;
        let queryText = `
      SELECT ar.id, ar.description, ar.amount, ar.currency, ar.due_date, ar.status, ar.category, ar.notes, ar.received_date, ar.created_at, ar.updated_at,
             COALESCE(rec.total_received, 0)::numeric as total_received
      FROM accounts_receivable ar
      LEFT JOIN (
        SELECT account_receivable_id, SUM(amount) AS total_received
        FROM accounts_receivable_payments
        GROUP BY account_receivable_id
      ) rec ON rec.account_receivable_id = ar.id
      WHERE ar.user_id = $1
    `;
        const params = [userId];
        if (status) {
            queryText += ' AND ar.status = $2';
            params.push(status);
        }
        queryText += ' ORDER BY ar.due_date ASC, ar.created_at DESC';
        const result = await (0, database_1.query)(queryText, params);
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
                totalReceived: (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(row.total_received)),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            })),
        });
    }
    catch (error) {
        console.error('Get accounts receivable error:', error);
        res.status(500).json({ message: 'Error fetching accounts receivable', error: error.message });
    }
};
exports.getAccountsReceivable = getAccountsReceivable;
const getAccountReceivablePayments = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const check = await (0, database_1.query)(`SELECT id FROM accounts_receivable WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (check.rows.length === 0) {
            return res.status(404).json({ message: 'Account receivable not found' });
        }
        const result = await (0, database_1.query)(`SELECT p.id, p.amount, p.payment_date, p.created_at,
              i.bank_account_id,
              ba.bank_name AS bank_account_name,
              ba.account_number AS bank_account_number
       FROM accounts_receivable_payments p
       LEFT JOIN income i ON i.id = p.income_id
       LEFT JOIN bank_accounts ba ON ba.id = i.bank_account_id AND ba.user_id = p.user_id
       WHERE p.account_receivable_id = $1 AND p.user_id = $2
       ORDER BY p.payment_date DESC, p.id DESC`, [id, userId]);
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
    }
    catch (error) {
        console.error('Get account receivable payments error:', error);
        res.status(500).json({ message: 'Error fetching payments', error: error.message });
    }
};
exports.getAccountReceivablePayments = getAccountReceivablePayments;
const addAccountReceivablePayment = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { amount, paymentDate } = req.body;
        if (amount == null || paymentDate == null || paymentDate === '') {
            return res.status(400).json({ message: 'amount and paymentDate are required' });
        }
        const payAmount = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(String(amount)));
        if (payAmount <= 0 || isNaN(payAmount)) {
            return res.status(400).json({ message: 'amount must be greater than zero' });
        }
        const accountResult = await (0, database_1.query)(`SELECT id, description, amount, currency, category, status
       FROM accounts_receivable
       WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ message: 'Account receivable not found' });
        }
        const account = accountResult.rows[0];
        if (account.status === 'RECEIVED') {
            return res.status(400).json({ message: 'Account receivable is already received' });
        }
        const totalReceived = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
        const totalDue = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.amount));
        const remaining = (0, accountsPaymentLinkSync_1.roundMoney)(totalDue - totalReceived);
        if (remaining <= 0) {
            return res.status(400).json({ message: 'No remaining balance' });
        }
        if (payAmount > remaining + 0.005) {
            return res.status(400).json({ message: `Amount exceeds remaining balance (${remaining})` });
        }
        const bankAccountId = optionalBankAccountId(req.body);
        const incomeResult = await (0, database_1.query)(`INSERT INTO income (user_id, description, amount, currency, nature, recurrence_type, frequency, date, bank_account_id, is_received)
       VALUES ($1, $2, $3, $4, 'variable', 'non_recurrent', NULL, $5, $6, true)
       RETURNING id`, [userId, `Abono: ${account.description}`, payAmount, account.currency, paymentDate, bankAccountId]);
        const incomeId = incomeResult.rows[0].id;
        if (bankAccountId) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, account.currency, payAmount);
            }
            catch (e) {
                console.error('AR payment balance:', e);
            }
        }
        await (0, database_1.query)(`INSERT INTO accounts_receivable_payments (account_receivable_id, user_id, amount, payment_date, income_id)
       VALUES ($1, $2, $3, $4, $5)`, [id, userId, payAmount, paymentDate, incomeId]);
        const newTotal = (0, accountsPaymentLinkSync_1.roundMoney)(totalReceived + payAmount);
        if (newTotal >= totalDue - 0.005) {
            await (0, database_1.query)(`UPDATE accounts_receivable
         SET status = 'RECEIVED',
             received_date = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3`, [paymentDate, id, userId]);
        }
        const totalReceivedAfter = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
        const rowResult = await (0, database_1.query)(`SELECT id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at
       FROM accounts_receivable WHERE id = $1 AND user_id = $2`, [id, userId]);
        const ar = rowResult.rows[0];
        res.status(201).json({
            success: true,
            message: 'Payment recorded',
            totalReceived: totalReceivedAfter,
            accountReceivable: {
                id: ar.id,
                description: ar.description,
                amount: parseFloat(ar.amount),
                currency: ar.currency,
                dueDate: ar.due_date,
                status: ar.status,
                category: ar.category,
                notes: ar.notes,
                receivedDate: ar.received_date,
                totalReceived: totalReceivedAfter,
                createdAt: ar.created_at,
                updatedAt: ar.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Add account receivable payment error:', error);
        res.status(500).json({ message: 'Error recording payment', error: error.message });
    }
};
exports.addAccountReceivablePayment = addAccountReceivablePayment;
const updateAccountReceivablePayment = async (req, res) => {
    try {
        const userId = req.userId;
        const { id, paymentId } = req.params;
        const { amount, paymentDate } = req.body;
        if (amount == null || paymentDate == null || paymentDate === '') {
            return res.status(400).json({ message: 'amount and paymentDate are required' });
        }
        const payAmount = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(String(amount)));
        if (payAmount <= 0 || isNaN(payAmount)) {
            return res.status(400).json({ message: 'amount must be greater than zero' });
        }
        const accountResult = await (0, database_1.query)(`SELECT id, description, amount, currency FROM accounts_receivable WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ message: 'Account receivable not found' });
        }
        const account = accountResult.rows[0];
        const payRow = await (0, database_1.query)(`SELECT id, amount, income_id FROM accounts_receivable_payments
       WHERE id = $1 AND account_receivable_id = $2 AND user_id = $3`, [paymentId, id, userId]);
        if (payRow.rows.length === 0) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        const prev = payRow.rows[0];
        const prevAmt = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(prev.amount));
        const totalDue = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.amount));
        const totalReceived = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
        const otherSum = (0, accountsPaymentLinkSync_1.roundMoney)(totalReceived - prevAmt);
        if (otherSum + payAmount > totalDue + 0.005) {
            return res.status(400).json({
                message: `El monto excede el saldo pendiente (${(0, accountsPaymentLinkSync_1.roundMoney)(totalDue - otherSum)})`,
            });
        }
        const incomeId = prev.income_id;
        let prevIncomeBank = null;
        if (incomeId) {
            const ir = await (0, database_1.query)(`SELECT bank_account_id FROM income WHERE id = $1 AND user_id = $2`, [
                incomeId,
                userId,
            ]);
            prevIncomeBank = ir.rows[0]?.bank_account_id != null ? ir.rows[0].bank_account_id : null;
        }
        const newBankId = parseBankAccountIdUpdate(req.body, prevIncomeBank);
        const client = await (0, database_1.getClient)();
        try {
            await client.query('BEGIN');
            await client.query(`UPDATE accounts_receivable_payments
         SET amount = $1, payment_date = $2
         WHERE id = $3 AND account_receivable_id = $4 AND user_id = $5`, [payAmount, paymentDate, paymentId, id, userId]);
            if (incomeId) {
                const cur = String(account.currency);
                if (prevIncomeBank) {
                    try {
                        await (0, accountBalance_1.applyBalanceDelta)(userId, prevIncomeBank, cur, -prevAmt, client);
                    }
                    catch (e) {
                        await client.query('ROLLBACK');
                        console.error('AR update revert balance:', e);
                        return res.status(500).json({ message: 'Error al ajustar saldo de la cuenta (reversión)' });
                    }
                }
                const desc = await (0, accountsPaymentLinkSync_1.incomeDescriptionForReceivable)(incomeId, userId, account.description);
                await client.query(`UPDATE income
           SET amount = $1, date = $2, description = $3, currency = $4,
               bank_account_id = $5,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $6 AND user_id = $7`, [payAmount, paymentDate, desc, account.currency, newBankId, incomeId, userId]);
                if (newBankId) {
                    try {
                        await (0, accountBalance_1.applyBalanceDelta)(userId, newBankId, cur, payAmount, client);
                    }
                    catch (e) {
                        await client.query('ROLLBACK');
                        if (e?.message === 'ACCOUNT_NOT_FOUND' || e?.message === 'CURRENCY_MISMATCH') {
                            return res.status(400).json({
                                message: e.message === 'CURRENCY_MISMATCH'
                                    ? 'La moneda no coincide con la cuenta seleccionada'
                                    : 'Cuenta no encontrada',
                            });
                        }
                        throw e;
                    }
                }
            }
            await client.query('COMMIT');
        }
        catch (e) {
            await client.query('ROLLBACK');
            console.error('Update AR payment tx:', e);
            return res.status(500).json({ message: 'Error al actualizar abono', error: e.message });
        }
        finally {
            client.release();
        }
        await (0, accountsPaymentLinkSync_1.recalculateReceivableStatus)(Number(id), userId);
        const totalReceivedAfter = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
        const rowResult = await (0, database_1.query)(`SELECT id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at
       FROM accounts_receivable WHERE id = $1 AND user_id = $2`, [id, userId]);
        const ar = rowResult.rows[0];
        res.json({
            success: true,
            message: 'Abono actualizado; ingreso sincronizado',
            totalReceived: totalReceivedAfter,
            accountReceivable: {
                id: ar.id,
                description: ar.description,
                amount: parseFloat(ar.amount),
                currency: ar.currency,
                dueDate: ar.due_date,
                status: ar.status,
                category: ar.category,
                notes: ar.notes,
                receivedDate: ar.received_date,
                totalReceived: totalReceivedAfter,
                createdAt: ar.created_at,
                updatedAt: ar.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update account receivable payment error:', error);
        res.status(500).json({ message: 'Error updating payment', error: error.message });
    }
};
exports.updateAccountReceivablePayment = updateAccountReceivablePayment;
const deleteAccountReceivablePayment = async (req, res) => {
    try {
        const userId = req.userId;
        const { id, paymentId } = req.params;
        const payRow = await (0, database_1.query)(`SELECT income_id FROM accounts_receivable_payments
       WHERE id = $1 AND account_receivable_id = $2 AND user_id = $3`, [paymentId, id, userId]);
        if (payRow.rows.length === 0) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        const incomeId = payRow.rows[0].income_id;
        if (incomeId) {
            await (0, database_1.query)(`DELETE FROM income WHERE id = $1 AND user_id = $2`, [incomeId, userId]);
        }
        await (0, database_1.query)(`DELETE FROM accounts_receivable_payments WHERE id = $1 AND account_receivable_id = $2 AND user_id = $3`, [paymentId, id, userId]);
        await (0, accountsPaymentLinkSync_1.recalculateReceivableStatus)(Number(id), userId);
        const totalReceivedAfter = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
        const rowResult = await (0, database_1.query)(`SELECT id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at
       FROM accounts_receivable WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (rowResult.rows.length === 0) {
            return res.json({ success: true, message: 'Abono eliminado', totalReceived: 0 });
        }
        const ar = rowResult.rows[0];
        res.json({
            success: true,
            message: 'Abono eliminado; ingreso eliminado en el módulo de ingresos',
            totalReceived: totalReceivedAfter,
            accountReceivable: {
                id: ar.id,
                description: ar.description,
                amount: parseFloat(ar.amount),
                currency: ar.currency,
                dueDate: ar.due_date,
                status: ar.status,
                category: ar.category,
                notes: ar.notes,
                receivedDate: ar.received_date,
                totalReceived: totalReceivedAfter,
                createdAt: ar.created_at,
                updatedAt: ar.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Delete account receivable payment error:', error);
        res.status(500).json({ message: 'Error deleting payment', error: error.message });
    }
};
exports.deleteAccountReceivablePayment = deleteAccountReceivablePayment;
const createAccountReceivable = async (req, res) => {
    try {
        const userId = req.userId;
        const { description, amount, currency, dueDate, category, notes } = req.body;
        if (!description || !amount || !currency || !dueDate) {
            return res.status(400).json({ message: 'Description, amount, currency, and due date are required' });
        }
        const result = await (0, database_1.query)(`INSERT INTO accounts_receivable (user_id, description, amount, currency, due_date, category, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at`, [userId, description, amount, currency, dueDate, category || null, notes || null]);
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
                totalReceived: 0,
                createdAt: account.created_at,
                updatedAt: account.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Create account receivable error:', error);
        res.status(500).json({ message: 'Error creating account receivable', error: error.message });
    }
};
exports.createAccountReceivable = createAccountReceivable;
const updateAccountReceivable = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { description, amount, currency, dueDate, category, notes } = req.body;
        if (amount != null) {
            const recv = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
            if ((0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(String(amount))) < recv - 0.005) {
                return res.status(400).json({
                    message: `Amount cannot be less than total received (${recv})`,
                });
            }
        }
        const result = await (0, database_1.query)(`UPDATE accounts_receivable
       SET description = COALESCE($1, description),
           amount = COALESCE($2, amount),
           currency = COALESCE($3, currency),
           due_date = COALESCE($4, due_date),
           category = COALESCE($5, category),
           notes = COALESCE($6, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8
       RETURNING id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at`, [description, amount, currency, dueDate, category, notes, id, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Account receivable not found' });
        }
        const account = result.rows[0];
        const totalReceived = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
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
                totalReceived,
                createdAt: account.created_at,
                updatedAt: account.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update account receivable error:', error);
        res.status(500).json({ message: 'Error updating account receivable', error: error.message });
    }
};
exports.updateAccountReceivable = updateAccountReceivable;
const receiveAccountReceivable = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { receivedDate, paymentDate, notes } = req.body;
        const dateStr = paymentDate ?? receivedDate;
        if (!dateStr || String(dateStr).trim() === '') {
            return res.status(400).json({ message: 'paymentDate is required (YYYY-MM-DD)' });
        }
        const accountResult = await (0, database_1.query)(`SELECT id, description, amount, currency, category, status
       FROM accounts_receivable
       WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (accountResult.rows.length === 0) {
            return res.status(404).json({ message: 'Account receivable not found' });
        }
        const account = accountResult.rows[0];
        if (account.status === 'RECEIVED') {
            return res.status(400).json({ message: 'Account receivable is already received' });
        }
        const totalReceived = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
        const totalDue = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.amount));
        const remaining = (0, accountsPaymentLinkSync_1.roundMoney)(totalDue - totalReceived);
        if (remaining <= 0) {
            return res.status(400).json({ message: 'No remaining balance' });
        }
        const bankAccountId = optionalBankAccountId(req.body);
        const incomeResult = await (0, database_1.query)(`INSERT INTO income (user_id, description, amount, currency, nature, recurrence_type, frequency, date, bank_account_id, is_received)
       VALUES ($1, $2, $3, $4, 'variable', 'non_recurrent', NULL, $5, $6, true)
       RETURNING id`, [
            userId,
            `Cobro: ${account.description}`,
            remaining,
            account.currency,
            dateStr,
            bankAccountId,
        ]);
        const incomeId = incomeResult.rows[0].id;
        if (bankAccountId) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, account.currency, remaining);
            }
            catch (e) {
                console.error('AR receive balance:', e);
            }
        }
        await (0, database_1.query)(`INSERT INTO accounts_receivable_payments (account_receivable_id, user_id, amount, payment_date, income_id)
       VALUES ($1, $2, $3, $4, $5)`, [id, userId, remaining, dateStr, incomeId]);
        const updateResult = await (0, database_1.query)(`UPDATE accounts_receivable
       SET status = 'RECEIVED',
           received_date = $1,
           notes = COALESCE($2, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at`, [dateStr, notes ?? null, id, userId]);
        const totalReceivedAfter = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
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
                totalReceived: totalReceivedAfter,
                createdAt: updateResult.rows[0].created_at,
                updatedAt: updateResult.rows[0].updated_at,
            },
        });
    }
    catch (error) {
        console.error('Receive account receivable error:', error);
        res.status(500).json({ message: 'Error receiving account receivable', error: error.message });
    }
};
exports.receiveAccountReceivable = receiveAccountReceivable;
const deleteAccountReceivable = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const incRows = await (0, database_1.query)(`SELECT income_id FROM accounts_receivable_payments
       WHERE account_receivable_id = $1 AND income_id IS NOT NULL`, [id]);
        for (const row of incRows.rows) {
            await (0, database_1.query)(`DELETE FROM income WHERE id = $1 AND user_id = $2`, [row.income_id, userId]);
        }
        const result = await (0, database_1.query)('DELETE FROM accounts_receivable WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Account receivable not found' });
        }
        res.json({
            success: true,
            message: 'Cuenta por cobrar eliminada; ingresos vinculados eliminados',
        });
    }
    catch (error) {
        console.error('Delete account receivable error:', error);
        res.status(500).json({ message: 'Error deleting account receivable', error: error.message });
    }
};
exports.deleteAccountReceivable = deleteAccountReceivable;
//# sourceMappingURL=accountsReceivableController.js.map