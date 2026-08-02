"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InactiveEntityError = void 0;
exports.setEntityActiveStatus = setEntityActiveStatus;
exports.requireEntityActive = requireEntityActive;
const database_1 = require("../config/database");
const ENTITY_TABLES = {
    accounts: 'bank_accounts',
    income: 'income',
    expenses: 'expenses',
    cards: 'credit_cards',
    loans: 'loans',
    accountsPayable: 'accounts_payable',
    accountsReceivable: 'accounts_receivable',
};
const defaultExecutor = (sql, params) => (0, database_1.query)(sql, params);
class InactiveEntityError extends Error {
    constructor(message = 'La entidad está inactiva') {
        super(message);
        this.code = 'ENTITY_INACTIVE';
        this.name = 'InactiveEntityError';
    }
}
exports.InactiveEntityError = InactiveEntityError;
async function setEntityActiveStatus(entity, id, userId, isActive, executor = defaultExecutor) {
    const table = ENTITY_TABLES[entity];
    const result = await executor(`UPDATE ${table}
     SET is_active = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND user_id = $3
     RETURNING id, is_active`, [isActive, id, userId]);
    const row = result.rows[0];
    return row ? { id: Number(row.id), isActive: row.is_active === true } : null;
}
async function requireEntityActive(entity, id, userId, executor = defaultExecutor) {
    const table = ENTITY_TABLES[entity];
    const result = await executor(`SELECT is_active FROM ${table} WHERE id = $1 AND user_id = $2`, [id, userId]);
    const row = result.rows[0];
    if (!row)
        return false;
    if (row.is_active !== true)
        throw new InactiveEntityError();
}
//# sourceMappingURL=entityActivation.js.map