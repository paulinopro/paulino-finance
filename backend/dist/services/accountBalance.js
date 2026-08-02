"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCurrencyAllowedForAccount = isCurrencyAllowedForAccount;
exports.getAccountRow = getAccountRow;
exports.parseBalanceForCurrency = parseBalanceForCurrency;
exports.applyBalanceDelta = applyBalanceDelta;
exports.recordBankAccountMovement = recordBankAccountMovement;
const database_1 = require("../config/database");
const entityActivation_1 = require("./entityActivation");
const userCurrencyPair_1 = require("../utils/userCurrencyPair");
/**
 * `currency_type` en BD: DOP = solo primer riel (moneda principal del usuario), USD = solo segundo riel
 * (secundaria), DUAL = ambos. Los nombres del enum son legado; el riel 1 va en `balance_dop`, el 2 en `balance_usd`.
 */
function isCurrencyAllowedForAccount(currencyType, currency, pair) {
    const c = currency.trim().toUpperCase();
    const p = pair.primary;
    const s = pair.secondary;
    if (currencyType === 'DUAL')
        return c === p || c === s;
    if (currencyType === 'DOP')
        return c === p;
    if (currencyType === 'USD')
        return c === s;
    return false;
}
async function runQuery(text, params, client) {
    if (client)
        return client.query(text, params);
    return (0, database_1.query)(text, params);
}
async function getAccountRow(userId, accountId, client) {
    const r = await runQuery(`SELECT id, user_id, balance_dop, balance_usd, currency_type, account_kind, bank_name, is_active
     FROM bank_accounts WHERE id = $1 AND user_id = $2`, [accountId, userId], client);
    return r.rows[0];
}
const EPS_BAL = 1e-9;
async function insertBankAccountMovementLedger(userId, accountId, currency, direction, magnitude, description, status, client) {
    const mag = Math.abs(magnitude);
    if (!(mag > EPS_BAL))
        return;
    const run = client != null
        ? (text, params) => client.query(text, params)
        : (text, params) => (0, database_1.query)(text, params);
    await run(`INSERT INTO bank_account_movements
     (user_id, bank_account_id, amount, currency, direction, description, status, occurred_at)
     VALUES ($1, $2, $3::numeric, $4, $5, $6, $7, CURRENT_TIMESTAMP)`, [userId, accountId, mag, currency.toUpperCase(), direction, description, status]);
}
function parseBalanceForCurrency(row, currency, pair) {
    const c = currency.trim().toUpperCase();
    if (c === pair.primary)
        return parseFloat(row.balance_dop || '0');
    if (c === pair.secondary)
        return parseFloat(row.balance_usd || '0');
    return 0;
}
/**
 * Adds delta to the balance in the given currency leg (DOP or USD).
 */
async function applyBalanceDelta(userId, accountId, currency, delta, client, movement) {
    const acc = await getAccountRow(userId, accountId, client);
    if (!acc) {
        throw new Error('ACCOUNT_NOT_FOUND');
    }
    if (acc.is_active !== true) {
        throw new entityActivation_1.InactiveEntityError('La cuenta bancaria está inactiva');
    }
    const pair = await (0, userCurrencyPair_1.getUserCurrencyPair)(userId);
    if (!isCurrencyAllowedForAccount(acc.currency_type, currency, pair)) {
        throw new Error('CURRENCY_MISMATCH');
    }
    const c = currency.trim().toUpperCase();
    if (c === pair.primary) {
        const updated = await runQuery(`UPDATE bank_accounts SET balance_dop = balance_dop + $1::numeric, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3 AND is_active = TRUE
       RETURNING id`, [delta, accountId, userId], client);
        if (updated.rows.length === 0) {
            throw new entityActivation_1.InactiveEntityError('La cuenta bancaria está inactiva');
        }
    }
    else if (c === pair.secondary) {
        const updated = await runQuery(`UPDATE bank_accounts SET balance_usd = balance_usd + $1::numeric, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3 AND is_active = TRUE
       RETURNING id`, [delta, accountId, userId], client);
        if (updated.rows.length === 0) {
            throw new entityActivation_1.InactiveEntityError('La cuenta bancaria está inactiva');
        }
    }
    else {
        throw new Error('CURRENCY_MISMATCH');
    }
    if (Math.abs(delta) > EPS_BAL) {
        const direction = delta > 0 ? 'IN' : 'OUT';
        const description = (movement?.description && movement.description.trim())
            ? movement.description.trim()
            : 'Movimiento de cuenta';
        const stat = movement?.status ?? 'completed';
        await insertBankAccountMovementLedger(userId, accountId, currency, direction, Math.abs(delta), description, stat, client);
    }
}
/** Registra un movimiento en el libro de la cuenta sin modificar saldo (p. ej. saldo inicial o ajuste manual ya reflejado en `bank_accounts`). */
async function recordBankAccountMovement(userId, accountId, currency, direction, amount, description, status = 'completed', client) {
    await insertBankAccountMovementLedger(userId, accountId, currency, direction, amount, description, status, client);
}
//# sourceMappingURL=accountBalance.js.map