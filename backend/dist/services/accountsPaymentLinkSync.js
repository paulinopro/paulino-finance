"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundMoney = void 0;
exports.getTotalPaidPayable = getTotalPaidPayable;
exports.recalculatePayableStatus = recalculatePayableStatus;
exports.expenseDescriptionForPayable = expenseDescriptionForPayable;
exports.getTotalReceivedReceivable = getTotalReceivedReceivable;
exports.recalculateReceivableStatus = recalculateReceivableStatus;
exports.incomeDescriptionForReceivable = incomeDescriptionForReceivable;
exports.validateExpenseUpdateForLinkedPayable = validateExpenseUpdateForLinkedPayable;
exports.syncPayablePaymentFromExpense = syncPayablePaymentFromExpense;
exports.deletePayablePaymentByExpenseId = deletePayablePaymentByExpenseId;
exports.validateIncomeUpdateForLinkedReceivable = validateIncomeUpdateForLinkedReceivable;
exports.syncReceivablePaymentFromIncome = syncReceivablePaymentFromIncome;
exports.deleteReceivablePaymentByIncomeId = deleteReceivablePaymentByIncomeId;
const database_1 = require("../config/database");
const roundMoney = (n) => Math.round(n * 100) / 100;
exports.roundMoney = roundMoney;
async function getTotalPaidPayable(accountPayableId) {
    const r = await (0, database_1.query)(`SELECT COALESCE(SUM(amount), 0)::numeric as total FROM accounts_payable_payments WHERE account_payable_id = $1`, [accountPayableId]);
    return (0, exports.roundMoney)(parseFloat(r.rows[0].total));
}
async function recalculatePayableStatus(accountPayableId, userId) {
    const acc = await (0, database_1.query)(`SELECT amount FROM accounts_payable WHERE id = $1 AND user_id = $2`, [accountPayableId, userId]);
    if (acc.rows.length === 0)
        return;
    const totalDue = (0, exports.roundMoney)(parseFloat(acc.rows[0].amount));
    const totalPaid = await getTotalPaidPayable(accountPayableId);
    if (totalPaid >= totalDue - 0.005) {
        const mx = await (0, database_1.query)(`SELECT MAX(payment_date)::date AS d FROM accounts_payable_payments WHERE account_payable_id = $1`, [accountPayableId]);
        const pd = mx.rows[0]?.d;
        await (0, database_1.query)(`UPDATE accounts_payable
       SET status = 'PAID', paid_date = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`, [pd, accountPayableId, userId]);
    }
    else {
        await (0, database_1.query)(`UPDATE accounts_payable
       SET status = 'PENDING', paid_date = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`, [accountPayableId, userId]);
    }
}
async function expenseDescriptionForPayable(expenseId, userId, accountDescription) {
    if (!expenseId)
        return `Abono: ${accountDescription}`;
    const r = await (0, database_1.query)(`SELECT description FROM expenses WHERE id = $1 AND user_id = $2`, [expenseId, userId]);
    if (r.rows.length === 0)
        return `Abono: ${accountDescription}`;
    const d = String(r.rows[0].description);
    const prefix = d.trimStart().startsWith('Pago:') ? 'Pago' : 'Abono';
    return `${prefix}: ${accountDescription}`;
}
async function getTotalReceivedReceivable(accountReceivableId) {
    const r = await (0, database_1.query)(`SELECT COALESCE(SUM(amount), 0)::numeric as total FROM accounts_receivable_payments WHERE account_receivable_id = $1`, [accountReceivableId]);
    return (0, exports.roundMoney)(parseFloat(r.rows[0].total));
}
async function recalculateReceivableStatus(accountReceivableId, userId) {
    const acc = await (0, database_1.query)(`SELECT amount FROM accounts_receivable WHERE id = $1 AND user_id = $2`, [accountReceivableId, userId]);
    if (acc.rows.length === 0)
        return;
    const totalDue = (0, exports.roundMoney)(parseFloat(acc.rows[0].amount));
    const totalReceived = await getTotalReceivedReceivable(accountReceivableId);
    if (totalReceived >= totalDue - 0.005) {
        const mx = await (0, database_1.query)(`SELECT MAX(payment_date)::date AS d FROM accounts_receivable_payments WHERE account_receivable_id = $1`, [accountReceivableId]);
        const rd = mx.rows[0]?.d;
        await (0, database_1.query)(`UPDATE accounts_receivable
       SET status = 'RECEIVED', received_date = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`, [rd, accountReceivableId, userId]);
    }
    else {
        await (0, database_1.query)(`UPDATE accounts_receivable
       SET status = 'PENDING', received_date = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`, [accountReceivableId, userId]);
    }
}
async function incomeDescriptionForReceivable(incomeId, userId, accountDescription) {
    if (!incomeId)
        return `Abono: ${accountDescription}`;
    const r = await (0, database_1.query)(`SELECT description FROM income WHERE id = $1 AND user_id = $2`, [incomeId, userId]);
    if (r.rows.length === 0)
        return `Abono: ${accountDescription}`;
    const d = String(r.rows[0].description);
    const prefix = d.trimStart().startsWith('Cobro:') ? 'Cobro' : 'Abono';
    return `${prefix}: ${accountDescription}`;
}
/** Valida PUT de gasto si está vinculado a un abono de cuenta por pagar. */
async function validateExpenseUpdateForLinkedPayable(userId, expenseId, body) {
    const link = await (0, database_1.query)(`SELECT p.id, p.account_payable_id FROM accounts_payable_payments p WHERE p.expense_id = $1 AND p.user_id = $2`, [expenseId, userId]);
    if (link.rows.length === 0)
        return null;
    const cur = await (0, database_1.query)(`SELECT amount, currency FROM expenses WHERE id = $1 AND user_id = $2`, [expenseId, userId]);
    if (cur.rows.length === 0)
        return null;
    const effectiveAmount = body.amount !== undefined && body.amount !== null && body.amount !== ''
        ? (0, exports.roundMoney)(parseFloat(String(body.amount)))
        : (0, exports.roundMoney)(parseFloat(cur.rows[0].amount));
    const apId = link.rows[0].account_payable_id;
    const payId = link.rows[0].id;
    const acc = await (0, database_1.query)(`SELECT amount, currency FROM accounts_payable WHERE id = $1 AND user_id = $2`, [apId, userId]);
    if (acc.rows.length === 0)
        return null;
    const totalDue = (0, exports.roundMoney)(parseFloat(acc.rows[0].amount));
    if (body.currency !== undefined &&
        body.currency !== null &&
        String(body.currency).trim() !== '' &&
        String(body.currency) !== acc.rows[0].currency) {
        return 'La moneda del gasto debe coincidir con la cuenta por pagar vinculada a este abono';
    }
    const other = await (0, database_1.query)(`SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM accounts_payable_payments WHERE account_payable_id = $1 AND id <> $2`, [apId, payId]);
    const otherSum = (0, exports.roundMoney)(parseFloat(other.rows[0].total));
    if (otherSum + effectiveAmount > totalDue + 0.005) {
        return `El monto del gasto no puede exceder el saldo pendiente de la cuenta por pagar (máximo ${(0, exports.roundMoney)(totalDue - otherSum)} ${acc.rows[0].currency})`;
    }
    return null;
}
/** Tras actualizar fila en expenses: sincroniza abono y estado de la cuenta. */
async function syncPayablePaymentFromExpense(userId, expenseId) {
    const link = await (0, database_1.query)(`SELECT id FROM accounts_payable_payments WHERE expense_id = $1 AND user_id = $2`, [expenseId, userId]);
    if (link.rows.length === 0)
        return;
    const exp = await (0, database_1.query)(`SELECT amount, date FROM expenses WHERE id = $1 AND user_id = $2`, [expenseId, userId]);
    if (exp.rows.length === 0)
        return;
    const newAmt = (0, exports.roundMoney)(parseFloat(exp.rows[0].amount));
    const payDate = exp.rows[0].date;
    await (0, database_1.query)(`UPDATE accounts_payable_payments
     SET amount = $1,
         payment_date = COALESCE($2::date, payment_date)
     WHERE expense_id = $3 AND user_id = $4`, [newAmt, payDate, expenseId, userId]);
    const apRow = await (0, database_1.query)(`SELECT account_payable_id FROM accounts_payable_payments WHERE expense_id = $1 AND user_id = $2`, [expenseId, userId]);
    if (apRow.rows.length > 0) {
        await recalculatePayableStatus(apRow.rows[0].account_payable_id, userId);
    }
}
/** Elimina el abono en BD antes de borrar el gasto. */
async function deletePayablePaymentByExpenseId(userId, expenseId) {
    const r = await (0, database_1.query)(`DELETE FROM accounts_payable_payments WHERE expense_id = $1 AND user_id = $2 RETURNING account_payable_id`, [expenseId, userId]);
    if (r.rows.length === 0)
        return;
    await recalculatePayableStatus(r.rows[0].account_payable_id, userId);
}
/** Valida PUT de ingreso si está vinculado a abono de cuenta por cobrar. */
async function validateIncomeUpdateForLinkedReceivable(userId, incomeId, body) {
    const link = await (0, database_1.query)(`SELECT p.id, p.account_receivable_id FROM accounts_receivable_payments p WHERE p.income_id = $1 AND p.user_id = $2`, [incomeId, userId]);
    if (link.rows.length === 0)
        return null;
    const cur = await (0, database_1.query)(`SELECT amount, currency FROM income WHERE id = $1 AND user_id = $2`, [incomeId, userId]);
    if (cur.rows.length === 0)
        return null;
    const effectiveAmount = body.amount !== undefined && body.amount !== null && body.amount !== ''
        ? (0, exports.roundMoney)(parseFloat(String(body.amount)))
        : (0, exports.roundMoney)(parseFloat(cur.rows[0].amount));
    const arId = link.rows[0].account_receivable_id;
    const payId = link.rows[0].id;
    const acc = await (0, database_1.query)(`SELECT amount, currency FROM accounts_receivable WHERE id = $1 AND user_id = $2`, [arId, userId]);
    if (acc.rows.length === 0)
        return null;
    const totalDue = (0, exports.roundMoney)(parseFloat(acc.rows[0].amount));
    if (body.currency !== undefined &&
        body.currency !== null &&
        String(body.currency).trim() !== '' &&
        String(body.currency) !== acc.rows[0].currency) {
        return 'La moneda del ingreso debe coincidir con la cuenta por cobrar vinculada a este abono';
    }
    const other = await (0, database_1.query)(`SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM accounts_receivable_payments WHERE account_receivable_id = $1 AND id <> $2`, [arId, payId]);
    const otherSum = (0, exports.roundMoney)(parseFloat(other.rows[0].total));
    if (otherSum + effectiveAmount > totalDue + 0.005) {
        return `El monto del ingreso no puede exceder el saldo pendiente de la cuenta por cobrar (máximo ${(0, exports.roundMoney)(totalDue - otherSum)} ${acc.rows[0].currency})`;
    }
    return null;
}
async function syncReceivablePaymentFromIncome(userId, incomeId) {
    const link = await (0, database_1.query)(`SELECT id FROM accounts_receivable_payments WHERE income_id = $1 AND user_id = $2`, [incomeId, userId]);
    if (link.rows.length === 0)
        return;
    const inc = await (0, database_1.query)(`SELECT amount, date FROM income WHERE id = $1 AND user_id = $2`, [incomeId, userId]);
    if (inc.rows.length === 0)
        return;
    const newAmt = (0, exports.roundMoney)(parseFloat(inc.rows[0].amount));
    const payDate = inc.rows[0].date;
    await (0, database_1.query)(`UPDATE accounts_receivable_payments
     SET amount = $1,
         payment_date = COALESCE($2::date, payment_date)
     WHERE income_id = $3 AND user_id = $4`, [newAmt, payDate, incomeId, userId]);
    const arRow = await (0, database_1.query)(`SELECT account_receivable_id FROM accounts_receivable_payments WHERE income_id = $1 AND user_id = $2`, [incomeId, userId]);
    if (arRow.rows.length > 0) {
        await recalculateReceivableStatus(arRow.rows[0].account_receivable_id, userId);
    }
}
async function deleteReceivablePaymentByIncomeId(userId, incomeId) {
    const r = await (0, database_1.query)(`DELETE FROM accounts_receivable_payments WHERE income_id = $1 AND user_id = $2 RETURNING account_receivable_id`, [incomeId, userId]);
    if (r.rows.length === 0)
        return;
    await recalculateReceivableStatus(r.rows[0].account_receivable_id, userId);
}
//# sourceMappingURL=accountsPaymentLinkSync.js.map