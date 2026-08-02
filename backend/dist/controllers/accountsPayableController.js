"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAccountPayable = exports.payAccountPayable = exports.updateAccountPayable = exports.createAccountPayable = exports.deleteAccountPayablePayment = exports.updateAccountPayablePayment = exports.addAccountPayablePayment = exports.getAccountPayablePayments = exports.getAccountsPayable = void 0;
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
async function recalculatePayableWithinTransaction(client, accountPayableId, userId, totalDue) {
    const totalResult = await client.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total
     FROM accounts_payable_payments
     WHERE account_payable_id = $1 AND user_id = $2`, [accountPayableId, userId]);
    const totalPaid = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(totalResult.rows[0].total));
    const isPaid = totalPaid >= totalDue - 0.005;
    let paidDate = null;
    if (isPaid) {
        const maxDate = await client.query(`SELECT MAX(payment_date)::date AS d
       FROM accounts_payable_payments
       WHERE account_payable_id = $1 AND user_id = $2`, [accountPayableId, userId]);
        paidDate = maxDate.rows[0]?.d ?? null;
    }
    const rowResult = await client.query(`UPDATE accounts_payable
     SET status = $1, paid_date = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND user_id = $4 AND is_active = TRUE
     RETURNING id, description, amount, currency, due_date, status, category, notes,
               paid_date, created_at, updated_at`, [isPaid ? 'PAID' : 'PENDING', paidDate, accountPayableId, userId]);
    if (rowResult.rows.length === 0)
        throw new entityActivation_1.InactiveEntityError();
    return { totalPaid, row: rowResult.rows[0] };
}
const getAccountsPayable = async (req, res) => {
    try {
        const userId = req.userId;
        const { status } = req.query;
        let queryText = `
      SELECT ap.id, ap.description, ap.amount, ap.currency, ap.due_date, ap.status, ap.category, ap.notes, ap.paid_date, ap.is_active, ap.created_at, ap.updated_at,
             COALESCE(pay.total_paid, 0)::numeric as total_paid
      FROM accounts_payable ap
      LEFT JOIN (
        SELECT account_payable_id, SUM(amount) AS total_paid
        FROM accounts_payable_payments
        GROUP BY account_payable_id
      ) pay ON pay.account_payable_id = ap.id
      WHERE ap.user_id = $1
    `;
        const params = [userId];
        if (status) {
            queryText += ' AND ap.status = $2';
            params.push(status);
        }
        queryText += ' ORDER BY ap.due_date ASC, ap.created_at DESC';
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
                isActive: row.is_active === true,
                totalPaid: (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(row.total_paid)),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            })),
        });
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Get accounts payable error:', error);
        res.status(500).json({ message: 'Error fetching accounts payable', error: error.message });
    }
};
exports.getAccountsPayable = getAccountsPayable;
const getAccountPayablePayments = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const check = await (0, database_1.query)(`SELECT id FROM accounts_payable WHERE id = $1 AND user_id = $2`, [id, userId]);
        if (check.rows.length === 0) {
            return res.status(404).json({ message: 'Account payable not found' });
        }
        const result = await (0, database_1.query)(`SELECT p.id, p.amount, p.payment_date, p.created_at,
              e.bank_account_id,
              ba.bank_name AS bank_account_name,
              ba.account_number AS bank_account_number
       FROM accounts_payable_payments p
       LEFT JOIN expenses e ON e.id = p.expense_id
       LEFT JOIN bank_accounts ba ON ba.id = e.bank_account_id AND ba.user_id = p.user_id
       WHERE p.account_payable_id = $1 AND p.user_id = $2
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
        console.error('Get account payable payments error:', error);
        res.status(500).json({ message: 'Error fetching payments', error: error.message });
    }
};
exports.getAccountPayablePayments = getAccountPayablePayments;
const addAccountPayablePayment = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        if (!(await (0, activeEntityGuard_1.ensureActiveEntity)('accountsPayable', Number(id), userId, res)))
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
         FROM accounts_payable
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`, [id, userId]);
            if (accountResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Account payable not found' });
            }
            const account = accountResult.rows[0];
            if (account.is_active !== true) {
                throw new entityActivation_1.InactiveEntityError();
            }
            if (account.status === 'PAID') {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Account payable is already paid' });
            }
            const totalResult = await client.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM accounts_payable_payments
         WHERE account_payable_id = $1 AND user_id = $2`, [id, userId]);
            const totalPaid = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(totalResult.rows[0].total));
            const totalDue = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.amount));
            const remaining = (0, accountsPaymentLinkSync_1.roundMoney)(totalDue - totalPaid);
            if (remaining <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'No remaining balance' });
            }
            if (payAmount > remaining + 0.005) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: `Amount exceeds remaining balance (${remaining})` });
            }
            const expenseResult = await client.query(`INSERT INTO expenses (user_id, description, amount, currency, nature, recurrence_type, frequency, category, date, is_paid, bank_account_id)
         VALUES ($1, $2, $3, $4, 'variable', 'non_recurrent', NULL, $5, $6, true, $7)
         RETURNING id`, [
                userId,
                `Abono: ${account.description}`,
                payAmount,
                account.currency,
                account.category || 'Cuentas por Pagar',
                paymentDate,
                bankAccountId,
            ]);
            const expenseId = expenseResult.rows[0].id;
            if (bankAccountId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, account.currency, -payAmount, client, {
                    description: `[CxP] Abono · «${account.description}»`,
                });
            }
            await client.query(`INSERT INTO accounts_payable_payments (account_payable_id, user_id, amount, payment_date, expense_id)
         VALUES ($1, $2, $3, $4, $5)`, [id, userId, payAmount, paymentDate, expenseId]);
            const totalPaidAfter = (0, accountsPaymentLinkSync_1.roundMoney)(totalPaid + payAmount);
            const isPaid = totalPaidAfter >= totalDue - 0.005;
            const rowResult = await client.query(`UPDATE accounts_payable
         SET status = $1,
             paid_date = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND user_id = $4 AND is_active = TRUE
         RETURNING id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at`, [isPaid ? 'PAID' : 'PENDING', isPaid ? paymentDate : null, id, userId]);
            if (rowResult.rows.length === 0) {
                throw new entityActivation_1.InactiveEntityError();
            }
            await client.query('COMMIT');
            const ar = rowResult.rows[0];
            res.status(201).json({
                success: true,
                message: 'Payment recorded',
                totalPaid: totalPaidAfter,
                accountPayable: {
                    id: ar.id,
                    description: ar.description,
                    amount: parseFloat(ar.amount),
                    currency: ar.currency,
                    dueDate: ar.due_date,
                    status: ar.status,
                    category: ar.category,
                    notes: ar.notes,
                    paidDate: ar.paid_date,
                    totalPaid: totalPaidAfter,
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
        console.error('Add account payable payment error:', error);
        res.status(500).json({ message: 'Error recording payment', error: error.message });
    }
};
exports.addAccountPayablePayment = addAccountPayablePayment;
const updateAccountPayablePayment = async (req, res) => {
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
        const locked = await client.query(`SELECT ap.id, ap.description, ap.amount, ap.currency, ap.due_date, ap.status,
              ap.category, ap.notes, ap.paid_date, ap.is_active, ap.created_at, ap.updated_at,
              p.amount AS payment_amount, p.payment_date, p.expense_id AS derived_id
       FROM accounts_payable ap
       INNER JOIN accounts_payable_payments p
         ON p.account_payable_id = ap.id AND p.user_id = ap.user_id
       WHERE ap.id = $1 AND ap.user_id = $2 AND p.id = $3
       FOR UPDATE OF ap, p`, [accountId, userId, paymentId]);
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
       FROM accounts_payable_payments
       WHERE account_payable_id = $1 AND user_id = $2 AND id <> $3`, [accountId, userId, paymentId]);
        const otherSum = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(otherResult.rows[0].total));
        if (otherSum + payAmount > totalDue + 0.005) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return res.status(400).json({
                message: `El monto excede el saldo pendiente (${(0, accountsPaymentLinkSync_1.roundMoney)(totalDue - otherSum)})`,
            });
        }
        const expenseId = account.derived_id;
        let previousBankId = null;
        let derivedDescription = '';
        if (expenseId) {
            const derived = await client.query('SELECT bank_account_id, description FROM expenses WHERE id = $1 AND user_id = $2 FOR UPDATE', [expenseId, userId]);
            previousBankId = derived.rows[0]?.bank_account_id ?? null;
            derivedDescription = String(derived.rows[0]?.description ?? '');
        }
        const newBankId = parseBankAccountIdUpdate(req.body, previousBankId);
        await client.query(`UPDATE accounts_payable_payments
       SET amount = $1, payment_date = $2
       WHERE id = $3 AND account_payable_id = $4 AND user_id = $5`, [payAmount, paymentDate, paymentId, accountId, userId]);
        if (expenseId) {
            if (previousBankId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, previousBankId, account.currency, prevAmt, client, {
                    description: `[CxP] Ajuste de abono · reversión «${account.description}»`,
                });
            }
            const prefix = derivedDescription.trimStart().startsWith('Pago:') ? 'Pago' : 'Abono';
            await client.query(`UPDATE expenses
         SET amount = $1, date = $2, description = $3, currency = $4,
             category = COALESCE($5, category), bank_account_id = $6,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $7 AND user_id = $8`, [payAmount, paymentDate, `${prefix}: ${account.description}`, account.currency,
                account.category || 'Cuentas por Pagar', newBankId, expenseId, userId]);
            if (newBankId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, newBankId, account.currency, -payAmount, client, {
                    description: `[CxP] Ajuste de abono · nuevo cargo «${account.description}»`,
                });
            }
        }
        const recalculated = await recalculatePayableWithinTransaction(client, accountId, userId, totalDue);
        await client.query('COMMIT');
        transactionOpen = false;
        const row = recalculated.row;
        res.json({
            success: true,
            message: 'Abono actualizado; gasto sincronizado',
            totalPaid: recalculated.totalPaid,
            accountPayable: {
                id: row.id, description: row.description, amount: parseFloat(row.amount), currency: row.currency,
                dueDate: row.due_date, status: row.status, category: row.category, notes: row.notes,
                paidDate: row.paid_date, totalPaid: recalculated.totalPaid,
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
        console.error('Update account payable payment error:', error);
        res.status(500).json({ message: 'Error updating payment', error: error.message });
    }
    finally {
        client?.release();
    }
};
exports.updateAccountPayablePayment = updateAccountPayablePayment;
const deleteAccountPayablePayment = async (req, res) => {
    let client = null;
    let transactionOpen = false;
    try {
        const userId = req.userId;
        const accountId = Number(req.params.id);
        const paymentId = Number(req.params.paymentId);
        client = await (0, database_1.getClient)();
        await client.query('BEGIN');
        transactionOpen = true;
        const locked = await client.query(`SELECT ap.id, ap.description, ap.amount, ap.currency, ap.due_date, ap.status,
              ap.category, ap.notes, ap.paid_date, ap.is_active, ap.created_at, ap.updated_at,
              p.amount AS payment_amount, p.payment_date, p.expense_id AS derived_id
       FROM accounts_payable ap
       INNER JOIN accounts_payable_payments p
         ON p.account_payable_id = ap.id AND p.user_id = ap.user_id
       WHERE ap.id = $1 AND ap.user_id = $2 AND p.id = $3
       FOR UPDATE OF ap, p`, [accountId, userId, paymentId]);
        if (locked.rows.length === 0) {
            await client.query('ROLLBACK');
            transactionOpen = false;
            return res.status(404).json({ message: 'Payment not found' });
        }
        const account = locked.rows[0];
        if (account.is_active !== true)
            throw new entityActivation_1.InactiveEntityError();
        const expenseId = account.derived_id;
        if (expenseId) {
            const derived = await client.query('SELECT bank_account_id FROM expenses WHERE id = $1 AND user_id = $2 FOR UPDATE', [expenseId, userId]);
            const bankAccountId = derived.rows[0]?.bank_account_id ?? null;
            if (bankAccountId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, account.currency, parseFloat(account.payment_amount), client, { description: `[CxP] Eliminación de abono · reversión «${account.description}»` });
            }
            await client.query(`UPDATE calendar_events
         SET show_on_calendar = false, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND related_id = $2
           AND event_type = ANY($3::varchar[])`, [userId, expenseId, ['RECURRING_EXPENSE', 'EXPENSE']]);
            await client.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [expenseId, userId]);
        }
        await client.query(`DELETE FROM accounts_payable_payments
       WHERE id = $1 AND account_payable_id = $2 AND user_id = $3`, [paymentId, accountId, userId]);
        const recalculated = await recalculatePayableWithinTransaction(client, accountId, userId, (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.amount)));
        await client.query('COMMIT');
        transactionOpen = false;
        const row = recalculated.row;
        res.json({
            success: true,
            message: 'Abono eliminado; gasto eliminado en el módulo de gastos',
            totalPaid: recalculated.totalPaid,
            accountPayable: {
                id: row.id, description: row.description, amount: parseFloat(row.amount), currency: row.currency,
                dueDate: row.due_date, status: row.status, category: row.category, notes: row.notes,
                paidDate: row.paid_date, totalPaid: recalculated.totalPaid,
                createdAt: row.created_at, updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        if (client && transactionOpen)
            await client.query('ROLLBACK');
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Delete account payable payment error:', error);
        res.status(500).json({ message: 'Error deleting payment', error: error.message });
    }
    finally {
        client?.release();
    }
};
exports.deleteAccountPayablePayment = deleteAccountPayablePayment;
const createAccountPayable = async (req, res) => {
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
                totalPaid: 0,
                createdAt: account.created_at,
                updatedAt: account.updated_at,
            },
        });
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
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
        const pair = await (0, userCurrencyPair_1.getUserCurrencyPair)(userId);
        const prevRow = await (0, database_1.query)('SELECT currency, is_active FROM accounts_payable WHERE id = $1 AND user_id = $2', [id, userId]);
        if (prevRow.rows.length === 0)
            return res.status(404).json({ message: 'Account payable not found' });
        const financialUpdate = (0, financialEntityMutation_1.financialEntityUpdateRequiresActive)('accountsPayable', req.body);
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
            const paid = await (0, accountsPaymentLinkSync_1.getTotalPaidPayable)(Number(id));
            if ((0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(String(amount))) < paid - 0.005) {
                return res.status(400).json({ message: `Amount cannot be less than total paid (${paid})` });
            }
        }
        const result = await (0, database_1.query)(`UPDATE accounts_payable
       SET description = COALESCE($1, description), amount = COALESCE($2, amount),
           currency = COALESCE($3, currency), due_date = COALESCE($4, due_date),
           category = COALESCE($5, category), notes = COALESCE($6, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND user_id = $8 AND (is_active = TRUE OR $9::boolean = FALSE)
       RETURNING id, description, amount, currency, due_date, status, category, notes,
                 paid_date, created_at, updated_at`, [description, amount, currency, dueDate, category, notes, id, userId, financialUpdate]);
        if (result.rows.length === 0) {
            if (!(await (0, activeEntityGuard_1.ensureActiveEntity)('accountsPayable', Number(id), userId, res)))
                return;
            return res.status(404).json({ message: 'Account payable not found' });
        }
        const account = result.rows[0];
        const totalPaid = await (0, accountsPaymentLinkSync_1.getTotalPaidPayable)(Number(id));
        res.json({ success: true, accountPayable: {
                id: account.id, description: account.description, amount: parseFloat(account.amount),
                currency: account.currency, dueDate: account.due_date, status: account.status,
                category: account.category, notes: account.notes, paidDate: account.paid_date,
                totalPaid, createdAt: account.created_at, updatedAt: account.updated_at,
            } });
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Update account payable error:', error);
        res.status(500).json({ message: 'Error updating account payable', error: error.message });
    }
};
exports.updateAccountPayable = updateAccountPayable;
const payAccountPayable = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        if (!(await (0, activeEntityGuard_1.ensureActiveEntity)('accountsPayable', Number(id), userId, res)))
            return;
        const { paidDate, paymentDate, notes } = req.body;
        const dateStr = paymentDate ?? paidDate;
        if (!dateStr || String(dateStr).trim() === '') {
            return res.status(400).json({ message: 'paymentDate is required (YYYY-MM-DD)' });
        }
        const bankAccountId = optionalBankAccountId(req.body);
        const client = await (0, database_1.getClient)();
        try {
            await client.query('BEGIN');
            const accountResult = await client.query(`SELECT id, description, amount, currency, category, status, is_active
         FROM accounts_payable
         WHERE id = $1 AND user_id = $2
         FOR UPDATE`, [id, userId]);
            if (accountResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Account payable not found' });
            }
            const account = accountResult.rows[0];
            if (account.is_active !== true) {
                throw new entityActivation_1.InactiveEntityError();
            }
            if (account.status === 'PAID') {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Account payable is already paid' });
            }
            const totalResult = await client.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM accounts_payable_payments
         WHERE account_payable_id = $1 AND user_id = $2`, [id, userId]);
            const totalPaid = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(totalResult.rows[0].total));
            const totalDue = (0, accountsPaymentLinkSync_1.roundMoney)(parseFloat(account.amount));
            const remaining = (0, accountsPaymentLinkSync_1.roundMoney)(totalDue - totalPaid);
            if (remaining <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'No remaining balance' });
            }
            const expenseResult = await client.query(`INSERT INTO expenses (user_id, description, amount, currency, nature, recurrence_type, frequency, category, date, is_paid, bank_account_id)
         VALUES ($1, $2, $3, $4, 'variable', 'non_recurrent', NULL, $5, $6, true, $7)
         RETURNING id`, [
                userId,
                `Pago: ${account.description}`,
                remaining,
                account.currency,
                account.category || 'Cuentas por Pagar',
                dateStr,
                bankAccountId,
            ]);
            const expenseId = expenseResult.rows[0].id;
            if (bankAccountId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, account.currency, -remaining, client, {
                    description: `[CxP] Liquidación por pagar · «${account.description}»`,
                });
            }
            await client.query(`INSERT INTO accounts_payable_payments (account_payable_id, user_id, amount, payment_date, expense_id)
         VALUES ($1, $2, $3, $4, $5)`, [id, userId, remaining, dateStr, expenseId]);
            const updateResult = await client.query(`UPDATE accounts_payable
         SET status = 'PAID',
             paid_date = $1,
             notes = COALESCE($2, notes),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND user_id = $4 AND is_active = TRUE
         RETURNING id, description, amount, currency, due_date, status, category, notes, paid_date, created_at, updated_at`, [dateStr, notes ?? null, id, userId]);
            if (updateResult.rows.length === 0) {
                throw new entityActivation_1.InactiveEntityError();
            }
            await client.query('COMMIT');
            const totalPaidAfter = (0, accountsPaymentLinkSync_1.roundMoney)(totalPaid + remaining);
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
                    totalPaid: totalPaidAfter,
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
        console.error('Pay account payable error:', error);
        res.status(500).json({ message: 'Error paying account payable', error: error.message });
    }
};
exports.payAccountPayable = payAccountPayable;
const deleteAccountPayable = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const expRows = await (0, database_1.query)(`SELECT expense_id FROM accounts_payable_payments
       WHERE account_payable_id = $1 AND expense_id IS NOT NULL`, [id]);
        for (const row of expRows.rows) {
            const expId = row.expense_id;
            await (0, database_1.query)(`DELETE FROM expenses WHERE id = $1 AND user_id = $2`, [expId, userId]);
            await (0, calendarService_1.deleteCalendarEventsForRelated)(userId, expId, ['RECURRING_EXPENSE', 'EXPENSE']);
        }
        const result = await (0, database_1.query)('DELETE FROM accounts_payable WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Account payable not found' });
        }
        res.json({
            success: true,
            message: 'Cuenta por pagar eliminada; gastos vinculados eliminados',
        });
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Delete account payable error:', error);
        res.status(500).json({ message: 'Error deleting account payable', error: error.message });
    }
};
exports.deleteAccountPayable = deleteAccountPayable;
//# sourceMappingURL=accountsPayableController.js.map