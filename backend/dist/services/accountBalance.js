"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCurrencyAllowedForAccount = isCurrencyAllowedForAccount;
exports.getAccountRow = getAccountRow;
exports.parseBalanceForCurrency = parseBalanceForCurrency;
exports.applyBalanceDelta = applyBalanceDelta;
const database_1 = require("../config/database");
function isCurrencyAllowedForAccount(currencyType, currency) {
    if (currencyType === 'DUAL')
        return currency === 'DOP' || currency === 'USD';
    if (currencyType === 'DOP')
        return currency === 'DOP';
    if (currencyType === 'USD')
        return currency === 'USD';
    return false;
}
async function runQuery(text, params, client) {
    if (client)
        return client.query(text, params);
    return (0, database_1.query)(text, params);
}
async function getAccountRow(userId, accountId, client) {
    const r = await runQuery(`SELECT id, user_id, balance_dop, balance_usd, currency_type, account_kind
     FROM bank_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId], client);
    return r.rows[0];
}
function parseBalanceForCurrency(row, currency) {
    const v = currency === 'DOP' ? row.balance_dop : row.balance_usd;
    return parseFloat(v || '0');
}
/**
 * Adds delta to the balance in the given currency leg (DOP or USD).
 */
async function applyBalanceDelta(userId, accountId, currency, delta, client) {
    const acc = await getAccountRow(userId, accountId, client);
    if (!acc) {
        throw new Error('ACCOUNT_NOT_FOUND');
    }
    if (!isCurrencyAllowedForAccount(acc.currency_type, currency)) {
        throw new Error('CURRENCY_MISMATCH');
    }
    if (currency === 'DOP') {
        await runQuery(`UPDATE bank_accounts SET balance_dop = balance_dop + $1::numeric, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`, [delta, accountId, userId], client);
    }
    else if (currency === 'USD') {
        await runQuery(`UPDATE bank_accounts SET balance_usd = balance_usd + $1::numeric, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`, [delta, accountId, userId], client);
    }
    else {
        throw new Error('CURRENCY_MISMATCH');
    }
}
//# sourceMappingURL=accountBalance.js.map