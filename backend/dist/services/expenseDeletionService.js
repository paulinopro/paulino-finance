"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeExpenseForUser = removeExpenseForUser;
const database_1 = require("../config/database");
const incomeExpenseTaxonomy_1 = require("../constants/incomeExpenseTaxonomy");
const accountBalance_1 = require("./accountBalance");
const accountsPaymentLinkSync_1 = require("./accountsPaymentLinkSync");
/** Elimina un gasto y revierte saldo de cuenta; usado por DELETE /expenses y por gastos de vehículo vinculados. */
async function removeExpenseForUser(userId, expenseId) {
    const pre = await (0, database_1.query)(`SELECT recurrence_type, frequency, bank_account_id, amount, currency FROM expenses WHERE id = $1 AND user_id = $2`, [expenseId, userId]);
    if (pre.rows.length === 0) {
        return false;
    }
    const row = pre.rows[0];
    await (0, accountsPaymentLinkSync_1.deletePayablePaymentByExpenseId)(userId, expenseId);
    if ((0, incomeExpenseTaxonomy_1.expenseUsesImmediateBalance)(row) && row.bank_account_id) {
        try {
            await (0, accountBalance_1.applyBalanceDelta)(userId, row.bank_account_id, row.currency, parseFloat(row.amount));
        }
        catch (e) {
            console.error('Reverse balance on expense delete:', e);
        }
    }
    const result = await (0, database_1.query)('DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id', [expenseId, userId]);
    return result.rows.length > 0;
}
//# sourceMappingURL=expenseDeletionService.js.map