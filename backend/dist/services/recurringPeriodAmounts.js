"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExpensePeriodAmount = getExpensePeriodAmount;
exports.upsertExpensePeriodAmount = upsertExpensePeriodAmount;
exports.deleteExpensePeriodAmount = deleteExpensePeriodAmount;
exports.getIncomePeriodAmount = getIncomePeriodAmount;
exports.upsertIncomePeriodAmount = upsertIncomePeriodAmount;
exports.deleteIncomePeriodAmount = deleteIncomePeriodAmount;
const database_1 = require("../config/database");
function run(client, text, params) {
    if (client)
        return client.query(text, params);
    return (0, database_1.query)(text, params);
}
async function getExpensePeriodAmount(userId, expenseId, year, month, client) {
    const r = await run(client, `SELECT amount FROM expense_period_amounts
     WHERE user_id = $1 AND expense_id = $2 AND year = $3 AND month = $4`, [userId, expenseId, year, month]);
    if (r.rows.length === 0)
        return null;
    return parseFloat(String(r.rows[0].amount));
}
async function upsertExpensePeriodAmount(client, userId, expenseId, year, month, amount) {
    await run(client, `INSERT INTO expense_period_amounts (expense_id, user_id, year, month, amount, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (expense_id, year, month)
     DO UPDATE SET amount = EXCLUDED.amount, updated_at = CURRENT_TIMESTAMP`, [expenseId, userId, year, month, amount]);
}
async function deleteExpensePeriodAmount(client, userId, expenseId, year, month) {
    await run(client, `DELETE FROM expense_period_amounts
     WHERE user_id = $1 AND expense_id = $2 AND year = $3 AND month = $4`, [userId, expenseId, year, month]);
}
async function getIncomePeriodAmount(userId, incomeId, year, month, client) {
    const r = await run(client, `SELECT amount FROM income_period_amounts
     WHERE user_id = $1 AND income_id = $2 AND year = $3 AND month = $4`, [userId, incomeId, year, month]);
    if (r.rows.length === 0)
        return null;
    return parseFloat(String(r.rows[0].amount));
}
async function upsertIncomePeriodAmount(client, userId, incomeId, year, month, amount) {
    await run(client, `INSERT INTO income_period_amounts (income_id, user_id, year, month, amount, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
     ON CONFLICT (income_id, year, month)
     DO UPDATE SET amount = EXCLUDED.amount, updated_at = CURRENT_TIMESTAMP`, [incomeId, userId, year, month, amount]);
}
async function deleteIncomePeriodAmount(client, userId, incomeId, year, month) {
    await run(client, `DELETE FROM income_period_amounts
     WHERE user_id = $1 AND income_id = $2 AND year = $3 AND month = $4`, [userId, incomeId, year, month]);
}
//# sourceMappingURL=recurringPeriodAmounts.js.map