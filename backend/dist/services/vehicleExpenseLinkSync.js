"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncVehicleExpenseFromLinkedExpense = syncVehicleExpenseFromLinkedExpense;
exports.getExpenseCategoryNameForUser = getExpenseCategoryNameForUser;
const database_1 = require("../config/database");
/** Actualiza la fila de gasto de vehículo cuando se edita el gasto general vinculado. */
async function syncVehicleExpenseFromLinkedExpense(client, userId, expenseId, fields) {
    const check = await client.query(`SELECT ve.id FROM vehicle_expenses ve
     INNER JOIN vehicles v ON v.id = ve.vehicle_id AND v.user_id = $2
     WHERE ve.linked_expense_id = $1`, [expenseId, userId]);
    if (check.rows.length === 0) {
        return;
    }
    let categoryId = null;
    if (fields.category) {
        const cr = await client.query(`SELECT id FROM expense_categories WHERE user_id = $1 AND name = $2 LIMIT 1`, [userId, fields.category]);
        if (cr.rows.length > 0) {
            categoryId = cr.rows[0].id;
        }
    }
    await client.query(`UPDATE vehicle_expenses
     SET description = $1,
         amount = $2,
         currency = $3,
         date = $4,
         category = $5,
         category_id = $6,
         bank_account_id = $7,
         updated_at = CURRENT_TIMESTAMP
     WHERE linked_expense_id = $8`, [
        fields.description,
        fields.amount,
        fields.currency,
        fields.date,
        fields.category,
        categoryId,
        fields.bankAccountId,
        expenseId,
    ]);
}
/** Resuelve nombre de categoría por id (validación de pertenencia al usuario). */
async function getExpenseCategoryNameForUser(userId, categoryId) {
    const r = await (0, database_1.query)(`SELECT name FROM expense_categories WHERE id = $1 AND user_id = $2`, [categoryId, userId]);
    return r.rows.length > 0 ? String(r.rows[0].name) : null;
}
//# sourceMappingURL=vehicleExpenseLinkSync.js.map