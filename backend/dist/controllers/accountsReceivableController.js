"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccountReceivable = exports.receiveAccountReceivable = exports.updateAccountReceivable = exports.createAccountReceivable = exports.deleteAccountReceivablePayment = exports.updateAccountReceivablePayment = exports.addAccountReceivablePayment = exports.getAccountReceivablePayments = exports.getAccountsReceivable = void 0;
const activeEntityGuard_1 = require("./activeEntityGuard");
const entityActivation_1 = require("../services/entityActivation");
const database_1 = require("../config/database");
const accountBalance_1 = require("../services/accountBalance");
const accountsPaymentLinkSync_1 = require("../services/accountsPaymentLinkSync");
const calendarService_1 = require("../services/calendarService");
const userCurrencyPair_1 = require("../utils/userCurrencyPair");
const financialEntityMutation_1 = require("../services/financialEntityMutation");
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
async function recalculateReceivableWithinTransaction(client, accountReceivableId, userId, totalDue) {
    const totalResult = await client.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total
     FROM accounts_receivable_payments
     WHERE account_receivable_id = $1 AND user_id = $2`, [accountReceivableId, userId]);
    const totalReceived = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(totalResult.rows[0].total));
    const isReceived = totalReceived >= totalDue - 0.005;
    let receivedDate = null;
    if (isReceived) {
        const maxDate = await client.query(`SELECT MAX(payment_date)::date AS d
       FROM accounts_receivable_payments
       WHERE account_receivable_id = $1 AND user_id = $2`, [accountReceivableId, userId]);
        receivedDate = maxDate.rows[0]?.d ?? null;
    }
    const rowResult = await client.query(`UPDATE accounts_receivable
     SET status = $1, received_date = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND user_id = $4 AND is_active = TRUE
     RETURNING id, description, amount, currency, due_date, status, category, notes,
               received_date, created_at, updated_at`, [isReceived ? 'RECEIVED' : 'PENDING', receivedDate, accountReceivableId, userId]);
    if (rowResult.rows.length === 0)
        throw new entityActivation_1.InactiveEntityError();
    return { totalReceived, row: rowResult.rows[0] };
}
const getAccountsReceivable = async (req, res) => {
    try {
        const userId = req.userId;
        const { status } = req.query;
        let queryText = `
      SELECT ar.id, ar.description, ar.amount, ar.currency, ar.due_date, ar.status, ar.category, ar.notes, ar.received_date, ar.is_active, ar.created_at, ar.updated_at,
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
                isActive: row.is_active === true,
                totalReceived: (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(row.total_received)),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            })),
        });
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
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
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Get account receivable payments error:', error);
        res.status(500).json({ message: 'Error fetching payments', error: error.message });
    }
};
exports.getAccountReceivablePayments = getAccountReceivablePayments;
const addAccountReceivablePayment = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        if (!(await (0, activeEntityGuard_1.ensureActiveEntity)('accountsReceivable', Number(id), userId, res)))
            return;
        const { amount, paymentDate } = req.body;
        if (amount == null || paymentDate == null || paymentDate === '') {
            return res.status(400).json({ message: 'amount and paymentDate are required' });
        }
        const payAmount = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(String(amount)));
        if (payAmount <= 0 || isNaN(payAmount)) {
            return res.status(400).json({ message: 'amount must be greater than zero' });
        }
        const bankAccountId = optionalBankAccountId(req.body);
        const client = await (0, database_1.getClient)();
        try {
            await client.query('BEGIN');
            const accountResult = await client.query(`SELECT id, description, amount, currency, category, status, is_active
         FROM accounts_receivable
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`, [id, userId]);
            if (accountResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Account receivable not found' });
            }
            const account = accountResult.rows[0];
            if (account.is_active !== true) {
                throw new entityActivation_1.InactiveEntityError();
            }
            if (account.status === 'RECEIVED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Account receivable is already received' });
            }
            const totalResult = await client.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM accounts_receivable_payments
         WHERE account_receivable_id = $1 AND user_id = $2`, [id, userId]);
            const totalReceived = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(totalResult.rows[0].total));
            const totalDue = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.amount));
            const remaining = (0, accountsPaymentLinkSync_1.roundMoney)(totalDue - totalReceived);
            if (remaining <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'No remaining balance' });
            }
            if (payAmount > remaining + 0.005) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: `Amount exceeds remaining balance (${remaining})` });
            }
            const incomeResult = await client.query(`INSERT INTO income (user_id, description, amount, currency, nature, recurrence_type, frequency, date, bank_account_id, is_received)
         VALUES ($1, $2, $3, $4, 'variable', 'non_recurrent', NULL, $5, $6, true)
         RETURNING id`, [userId, `Abono: ${account.description}`, payAmount, account.currency, paymentDate, bankAccountId]);
            const incomeId = incomeResult.rows[0].id;
            if (bankAccountId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, account.currency, payAmount, client, {
                    description: `[CxC] Abono por cobrar · «${account.description}»`,
                });
            }
            await client.query(`INSERT INTO accounts_receivable_payments (account_receivable_id, user_id, amount, payment_date, income_id)
         VALUES ($1, $2, $3, $4, $5)`, [id, userId, payAmount, paymentDate, incomeId]);
            const totalReceivedAfter = (0, accountsPaymentLinkSync_1.roundMoney)(totalReceived + payAmount);
            const isReceived = totalReceivedAfter >= totalDue - 0.005;
            const rowResult = await client.query(`UPDATE accounts_receivable
         SET status = $1,
             received_date = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND user_id = $4 AND is_active = TRUE
         RETURNING id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at`, [isReceived ? 'RECEIVED' : 'PENDING', isReceived ? paymentDate : null, id, userId]);
            if (rowResult.rows.length === 0) {
                throw new entityActivation_1.InactiveEntityError();
            }
            await client.query('COMMIT');
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
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Add account receivable payment error:', error);
        res.status(500).json({ message: 'Error recording payment', error: error.message });
    }
};
exports.addAccountReceivablePayment = addAccountReceivablePayment;
const updateAccountReceivablePayment = async (req, res) => {
    let client = null;
    let transactionOpen = false;
    try {
        const userId = req.userId;
        const accountId = Number(req.params.id);
        const paymentId = Number(req.params.paymentId);
        const { amount, paymentDate } = req.body;
        if (amount == null || paymentDate == null || paymentDate === '') {
            return res.status(400).json({ message: 'amount and paymentDate are required' });
        }
        const payAmount = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(String(amount)));
        if (payAmount <= 0 || isNaN(payAmount)) {
            return res.status(400).json({ message: 'amount must be greater than zero' });
        }
        client = await (0, database_1.getClient)();
        await client.query('BEGIN');
        transactionOpen = true;
        const locked = await client.query(`SELECT ar.id, ar.description, ar.amount, ar.currency, ar.due_date, ar.status,
              ar.category, ar.notes, ar.received_date, ar.is_active, ar.created_at, ar.updated_at,
              p.amount AS payment_amount, p.payment_date, p.income_id AS derived_id
       FROM accounts_receivable ar
       INNER JOIN accounts_receivable_payments p
         ON p.account_receivable_id = ar.id AND p.user_id = ar.user_id
       WHERE ar.id = $1 AND ar.user_id = $2 AND p.id = $3
       FOR UPDATE OF ar, p`, [accountId, userId, paymentId]);
        if (locked.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return res.status(404).json({ message: 'Payment not found' });
        }
        const account = locked.rows[0];
        if (account.is_active !== true)
            throw new entityActivation_1.InactiveEntityError();
        const prevAmt = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.payment_amount));
        const totalDue = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.amount));
        const otherResult = await client.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM accounts_receivable_payments
       WHERE account_receivable_id = $1 AND user_id = $2 AND id <> $3`, [accountId, userId, paymentId]);
        const otherSum = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(otherResult.rows[0].total));
        if (otherSum + payAmount > totalDue + 0.005) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return res.status(400).json({
                message: `El monto excede el saldo pendiente (${(0, accountsPaymentLinkSync_1.roundMoney)(totalDue - otherSum)})`,
            });
        }
        const incomeId = account.derived_id;
        let previousBankId = null;
        let derivedDescription = '';
        if (incomeId) {
            const derived = await client.query('SELECT bank_account_id, description FROM income WHERE id = $1 AND user_id = $2 FOR UPDATE', [incomeId, userId]);
            previousBankId = derived.rows[0]?.bank_account_id ?? null;
            derivedDescription = String(derived.rows[0]?.description ?? '');
        }
        const newBankId = parseBankAccountIdUpdate(req.body, previousBankId);
        await client.query(`UPDATE accounts_receivable_payments
       SET amount = $1, payment_date = $2
       WHERE id = $3 AND account_receivable_id = $4 AND user_id = $5`, [payAmount, paymentDate, paymentId, accountId, userId]);
        if (incomeId) {
            if (previousBankId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, previousBankId, account.currency, -prevAmt, client, {
                    description: `[CxC] Ajuste de abono · reversión «${account.description}»`,
                });
            }
            const prefix = derivedDescription.trimStart().startsWith('Cobro:') ? 'Cobro' : 'Abono';
            await client.query(`UPDATE income
         SET amount = $1, date = $2, description = $3, currency = $4,
             bank_account_id = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 AND user_id = $7`, [payAmount, paymentDate, `${prefix}: ${account.description}`, account.currency,
                newBankId, incomeId, userId]);
            if (newBankId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, newBankId, account.currency, payAmount, client, {
                    description: `[CxC] Ajuste de abono · nueva acreditación «${account.description}»`,
                });
            }
        }
        const recalculated = await recalculateReceivableWithinTransaction(client, accountId, userId, totalDue);
        await client.query('COMMIT');
        transactionOpen = false;
        const row = recalculated.row;
        res.json({
            success: true,
            message: 'Abono actualizado; ingreso sincronizado',
            totalReceived: recalculated.totalReceived,
            accountReceivable: {
                id: row.id, description: row.description, amount: parseFloat(row.amount), currency: row.currency,
                dueDate: row.due_date, status: row.status, category: row.category, notes: row.notes,
                receivedDate: row.received_date, totalReceived: recalculated.totalReceived,
                createdAt: row.created_at, updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        if (client && transactionOpen)
            await client.query('ROLLBACK');
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        if (error.message === 'ACCOUNT_NOT_FOUND' || error.message === 'CURRENCY_MISMATCH') {
            return res.status(400).json({
                message: error.message === 'CURRENCY_MISMATCH'
                    ? 'La moneda no coincide con la cuenta seleccionada'
                    : 'Cuenta no encontrada',
            });
        }
        console.error('Update account receivable payment error:', error);
        res.status(500).json({ message: 'Error updating payment', error: error.message });
    }
    finally {
        client?.release();
    }
};
exports.updateAccountReceivablePayment = updateAccountReceivablePayment;
const deleteAccountReceivablePayment = async (req, res) => {
    let client = null;
    let transactionOpen = false;
    try {
        const userId = req.userId;
        const accountId = Number(req.params.id);
        const paymentId = Number(req.params.paymentId);
        client = await (0, database_1.getClient)();
        await client.query('BEGIN');
        transactionOpen = true;
        const locked = await client.query(`SELECT ar.id, ar.description, ar.amount, ar.currency, ar.due_date, ar.status,
              ar.category, ar.notes, ar.received_date, ar.is_active, ar.created_at, ar.updated_at,
              p.amount AS payment_amount, p.payment_date, p.income_id AS derived_id
       FROM accounts_receivable ar
       INNER JOIN accounts_receivable_payments p
         ON p.account_receivable_id = ar.id AND p.user_id = ar.user_id
       WHERE ar.id = $1 AND ar.user_id = $2 AND p.id = $3
       FOR UPDATE OF ar, p`, [accountId, userId, paymentId]);
        if (locked.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return res.status(404).json({ message: 'Payment not found' });
        }
        const account = locked.rows[0];
        if (account.is_active !== true)
            throw new entityActivation_1.InactiveEntityError();
        const incomeId = account.derived_id;
        if (incomeId) {
            const derived = await client.query('SELECT bank_account_id FROM income WHERE id = $1 AND user_id = $2 FOR UPDATE', [incomeId, userId]);
            const bankAccountId = derived.rows[0]?.bank_account_id ?? null;
            if (bankAccountId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, account.currency, -parseFloat(account.payment_amount), client, { description: `[CxC] Eliminación de abono · reversión «${account.description}»` });
            }
            await client.query(`UPDATE calendar_events
         SET show_on_calendar = false, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND related_id = $2
           AND event_type = ANY($3::varchar[])`, [userId, incomeId, ['INCOME']]);
            await client.query('DELETE FROM income WHERE id = $1 AND user_id = $2', [incomeId, userId]);
        }
        await client.query(`DELETE FROM accounts_receivable_payments
       WHERE id = $1 AND account_receivable_id = $2 AND user_id = $3`, [paymentId, accountId, userId]);
        const recalculated = await recalculateReceivableWithinTransaction(client, accountId, userId, (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.amount)));
        await client.query('COMMIT');
        transactionOpen = false;
        const row = recalculated.row;
        res.json({
            success: true,
            message: 'Abono eliminado; ingreso eliminado en el módulo de ingresos',
            totalReceived: recalculated.totalReceived,
            accountReceivable: {
                id: row.id, description: row.description, amount: parseFloat(row.amount), currency: row.currency,
                dueDate: row.due_date, status: row.status, category: row.category, notes: row.notes,
                receivedDate: row.received_date, totalReceived: recalculated.totalReceived,
                createdAt: row.created_at, updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        if (client && transactionOpen)
            await client.query('ROLLBACK');
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Delete account receivable payment error:', error);
        res.status(500).json({ message: 'Error deleting payment', error: error.message });
    }
    finally {
        client?.release();
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
        const pair = await (0, userCurrencyPair_1.getUserCurrencyPair)(userId);
        const cur = String(currency).trim().toUpperCase();
        if (!(0, userCurrencyPair_1.isCurrencyInUserPair)(pair, cur)) {
            return res.status(400).json({
                message: 'La moneda debe ser la principal o la secundaria de tu perfil (Configuración).',
            });
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
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
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
        const pair = await (0, userCurrencyPair_1.getUserCurrencyPair)(userId);
        const prevRow = await (0, database_1.query)('SELECT currency, is_active FROM accounts_receivable WHERE id = $1 AND user_id = $2', [id, userId]);
        if (prevRow.rows.length === 0)
            return res.status(404).json({ message: 'Account receivable not found' });
        const financialUpdate = (0, financialEntityMutation_1.financialEntityUpdateRequiresActive)('accountsReceivable', req.body);
        if (financialUpdate && prevRow.rows[0].is_active !== true)
            throw new entityActivation_1.InactiveEntityError();
        const mergedCur = currency !== undefined && currency !== null && String(currency).trim() !== ''
            ? String(currency).trim().toUpperCase()
            : String(prevRow.rows[0].currency || '').trim().toUpperCase();
        if (!(0, userCurrencyPair_1.isCurrencyInUserPair)(pair, mergedCur)) {
            return res.status(400).json({
                message: 'La moneda debe ser la principal o la secundaria de tu perfil (Configuración).',
            });
        }
        if (amount != null) {
            const received = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
            if ((0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(String(amount))) < received - 0.005) {
                return res.status(400).json({ message: `Amount cannot be less than total received (${received})` });
            }
        }
        const result = await (0, database_1.query)(`UPDATE accounts_receivable
       SET description = COALESCE($1, description), amount = COALESCE($2, amount),
           currency = COALESCE($3, currency), due_date = COALESCE($4, due_date),
           category = COALESCE($5, category), notes = COALESCE($6, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8 AND (is_active = TRUE OR $9::boolean = FALSE)
       RETURNING id, description, amount, currency, due_date, status, category, notes,
                 received_date, created_at, updated_at`, [description, amount, currency, dueDate, category, notes, id, userId, financialUpdate]);
        if (result.rows.length === 0) {
            if (!(await (0, activeEntityGuard_1.ensureActiveEntity)('accountsReceivable', Number(id), userId, res)))
                return;
            return res.status(404).json({ message: 'Account receivable not found' });
        }
        const account = result.rows[0];
        const totalReceived = await (0, accountsPaymentLinkSync_1.getTotalReceivedReceivable)(Number(id));
        res.json({ success: true, accountReceivable: {
                id: account.id, description: account.description, amount: parseFloat(account.amount),
                currency: account.currency, dueDate: account.due_date, status: account.status,
                category: account.category, notes: account.notes, receivedDate: account.received_date,
                totalReceived, createdAt: account.created_at, updatedAt: account.updated_at,
            } });
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Update account receivable error:', error);
        res.status(500).json({ message: 'Error updating account receivable', error: error.message });
    }
};
exports.updateAccountReceivable = updateAccountReceivable;
const receiveAccountReceivable = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        if (!(await (0, activeEntityGuard_1.ensureActiveEntity)('accountsReceivable', Number(id), userId, res)))
            return;
        const { receivedDate, paymentDate, notes } = req.body;
        const dateStr = paymentDate ?? receivedDate;
        if (!dateStr || String(dateStr).trim() === '') {
            return res.status(400).json({ message: 'paymentDate is required (YYYY-MM-DD)' });
        }
        const bankAccountId = optionalBankAccountId(req.body);
        const client = await (0, database_1.getClient)();
        try {
            await client.query('BEGIN');
            const accountResult = await client.query(`SELECT id, description, amount, currency, category, status, is_active
         FROM accounts_receivable
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`, [id, userId]);
            if (accountResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Account receivable not found' });
            }
            const account = accountResult.rows[0];
            if (account.is_active !== true) {
                throw new entityActivation_1.InactiveEntityError();
            }
            if (account.status === 'RECEIVED') {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Account receivable is already received' });
            }
            const totalResult = await client.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM accounts_receivable_payments
         WHERE account_receivable_id = $1 AND user_id = $2`, [id, userId]);
            const totalReceived = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(totalResult.rows[0].total));
            const totalDue = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.amount));
            const remaining = (0, accountsPaymentLinkSync_1.roundMoney)(totalDue - totalReceived);
            if (remaining <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'No remaining balance' });
            }
            const incomeResult = await client.query(`INSERT INTO income (user_id, description, amount, currency, nature, recurrence_type, frequency, date, bank_account_id, is_received)
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
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, account.currency, remaining, client, {
                    description: `[CxC] Cobro total por cobrar · «${account.description}»`,
                });
            }
            await client.query(`INSERT INTO accounts_receivable_payments (account_receivable_id, user_id, amount, payment_date, income_id)
         VALUES ($1, $2, $3, $4, $5)`, [id, userId, remaining, dateStr, incomeId]);
            const updateResult = await client.query(`UPDATE accounts_receivable
         SET status = 'RECEIVED',
             received_date = $1,
             notes = COALESCE($2, notes),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND user_id = $4 AND is_active = TRUE
         RETURNING id, description, amount, currency, due_date, status, category, notes, received_date, created_at, updated_at`, [dateStr, notes ?? null, id, userId]);
            if (updateResult.rows.length === 0) {
                throw new entityActivation_1.InactiveEntityError();
            }
            await client.query('COMMIT');
            const totalReceivedAfter = (0, accountsPaymentLinkSync_1.roundMoney)(totalReceived + remaining);
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
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
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
            const incId = row.income_id;
            await (0, database_1.query)(`DELETE FROM income WHERE id = $1 AND user_id = $2`, [incId, userId]);
            await (0, calendarService_1.deleteCalendarEventsForRelated)(userId, incId, ['INCOME']);
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
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Delete account receivable error:', error);
        res.status(500).json({ message: 'Error deleting account receivable', error: error.message });
    }
};
exports.deleteAccountReceivable = deleteAccountReceivable;
//# sourceMappingURL=accountsReceivableController.js.map