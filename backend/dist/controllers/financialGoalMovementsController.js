"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteGoalMovement = exports.updateGoalMovement = exports.addGoalMovement = exports.getGoalMovements = void 0;
const database_1 = require("../config/database");
const accountBalance_1 = require("../services/accountBalance");
const roundMoney = (n) => Math.round(n * 100) / 100;
function runQuery(client, text, params) {
    if (client)
        return client.query(text, params);
    return (0, database_1.query)(text, params);
}
/** Fecha calendario YYYY-MM-DD para JSON. No usar String(Date).slice(0,10): da "Thu Apr 02" y rompe el cliente. */
function toYmd(d) {
    if (d == null || d === '')
        return '';
    if (d instanceof Date) {
        if (isNaN(d.getTime()))
            return '';
        const y = d.getFullYear();
        const mo = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${mo}-${day}`;
    }
    const s = String(d).trim();
    const head = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (head)
        return head[1];
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
    if (iso)
        return iso[1];
    const t = Date.parse(s);
    if (!isNaN(t)) {
        const dt = new Date(t);
        const y = dt.getFullYear();
        const mo = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${y}-${mo}-${day}`;
    }
    return '';
}
async function syncGoalStatusAfterAmountChange(goalId, userId, client) {
    const r = await runQuery(client, `SELECT target_amount, current_amount, status FROM financial_goals WHERE id = $1 AND user_id = $2`, [goalId, userId]);
    if (r.rows.length === 0)
        return;
    const target = roundMoney(parseFloat(r.rows[0].target_amount));
    const current = roundMoney(parseFloat(r.rows[0].current_amount || 0));
    const status = r.rows[0].status;
    if (current >= target - 0.005 && status === 'ACTIVE') {
        await runQuery(client, `UPDATE financial_goals SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [goalId, userId]);
    }
    else if (current < target - 0.005 && status === 'COMPLETED') {
        await runQuery(client, `UPDATE financial_goals SET status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [goalId, userId]);
    }
}
function parseOptionalAccountId(body, key) {
    if (!(key in body))
        return null;
    const v = body[key];
    if (v === null || v === undefined || v === '')
        return null;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? null : n;
}
function parseSourceBankUpdate(body, previous) {
    if (!('sourceBankAccountId' in body))
        return previous;
    return parseOptionalAccountId(body, 'sourceBankAccountId');
}
async function validateAccountForGoalCurrency(userId, accountId, currency) {
    if (!accountId)
        return null;
    const row = await (0, accountBalance_1.getAccountRow)(userId, accountId);
    if (!row)
        return 'Cuenta no encontrada';
    if (!(0, accountBalance_1.isCurrencyAllowedForAccount)(row.currency_type, currency)) {
        return 'La moneda debe coincidir con la cuenta (o usar cuenta DUAL)';
    }
    return null;
}
function mapMovementRow(row) {
    return {
        id: row.id,
        goalId: row.goal_id,
        amount: parseFloat(String(row.amount)),
        note: row.note,
        movementDate: row.movement_date ? toYmd(row.movement_date) : toYmd(row.created_at),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
        bankAccountName: row.bank_account_name != null ? String(row.bank_account_name) : null,
        bankAccountNumber: row.bank_account_number != null ? String(row.bank_account_number) : null,
        sourceBankAccountId: row.source_bank_account_id != null ? row.source_bank_account_id : null,
        sourceBankAccountName: row.source_bank_account_name != null ? String(row.source_bank_account_name) : null,
        sourceBankAccountNumber: row.source_bank_account_number != null ? String(row.source_bank_account_number) : null,
    };
}
const getGoalMovements = async (req, res) => {
    try {
        const userId = req.userId;
        const { goalId } = req.params;
        const result = await (0, database_1.query)(`SELECT m.id, m.goal_id, m.amount, m.note, m.movement_date, m.created_at, m.updated_at,
              m.bank_account_id, ba.bank_name AS bank_account_name, ba.account_number AS bank_account_number,
              m.source_bank_account_id, bs.bank_name AS source_bank_account_name, bs.account_number AS source_bank_account_number
       FROM financial_goal_movements m
       LEFT JOIN bank_accounts ba ON ba.id = m.bank_account_id AND ba.user_id = m.user_id
       LEFT JOIN bank_accounts bs ON bs.id = m.source_bank_account_id AND bs.user_id = m.user_id
       WHERE m.user_id = $1 AND m.goal_id = $2
       ORDER BY COALESCE(m.movement_date, m.created_at::date) DESC, m.created_at DESC`, [userId, goalId]);
        res.json({
            success: true,
            movements: result.rows.map((row) => mapMovementRow(row)),
        });
    }
    catch (error) {
        console.error('Get financial goal movements error:', error);
        res.status(500).json({ message: 'Error fetching financial goal movements', error: error.message });
    }
};
exports.getGoalMovements = getGoalMovements;
const addGoalMovement = async (req, res) => {
    const userId = req.userId;
    const { goalId } = req.params;
    const body = req.body;
    const { amount, note, movementDate } = req.body;
    const sourceBankId = parseOptionalAccountId(body, 'sourceBankAccountId');
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
        return res.status(400).json({ message: 'Amount is required and must be a number' });
    }
    if (movementDate === undefined || movementDate === null || String(movementDate).trim() === '') {
        return res.status(400).json({ message: 'movementDate is required' });
    }
    const numericAmount = roundMoney(parseFloat(String(amount)));
    const dateStr = String(movementDate).trim().slice(0, 10);
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        const goalResult = await client.query(`SELECT target_amount, current_amount, status, currency, bank_account_id
       FROM financial_goals WHERE id = $1 AND user_id = $2 FOR UPDATE`, [goalId, userId]);
        if (goalResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Financial goal not found' });
        }
        const g = goalResult.rows[0];
        if (g.status !== 'ACTIVE') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Solo se pueden agregar abonos a metas activas' });
        }
        const target = roundMoney(parseFloat(g.target_amount));
        const current = roundMoney(parseFloat(g.current_amount || 0));
        const remaining = roundMoney(target - current);
        const currency = String(g.currency);
        const snapBankId = g.bank_account_id ?? null;
        if (remaining <= 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'La meta ya no tiene saldo pendiente' });
        }
        if (numericAmount <= 0 || isNaN(numericAmount)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'El monto debe ser mayor que cero' });
        }
        if (numericAmount > remaining + 0.005) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `El monto no puede exceder el saldo pendiente (${remaining.toFixed(2)})`,
            });
        }
        const errSrc = await validateAccountForGoalCurrency(userId, sourceBankId, currency);
        if (errSrc) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: errSrc });
        }
        if (sourceBankId && snapBankId && sourceBankId === snapBankId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'La cuenta origen y la cuenta de la meta no pueden ser la misma' });
        }
        if (sourceBankId) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, sourceBankId, currency, -numericAmount, client);
            }
            catch (e) {
                await client.query('ROLLBACK');
                if (e?.message === 'ACCOUNT_NOT_FOUND') {
                    return res.status(400).json({ message: 'Cuenta origen no encontrada' });
                }
                if (e?.message === 'CURRENCY_MISMATCH') {
                    return res.status(400).json({ message: 'La moneda no coincide con la cuenta origen' });
                }
                throw e;
            }
        }
        if (snapBankId) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, snapBankId, currency, numericAmount, client);
            }
            catch (e) {
                await client.query('ROLLBACK');
                if (e?.message === 'ACCOUNT_NOT_FOUND') {
                    return res.status(400).json({ message: 'Cuenta enlazada no encontrada' });
                }
                if (e?.message === 'CURRENCY_MISMATCH') {
                    return res.status(400).json({ message: 'La moneda del abono no coincide con la cuenta' });
                }
                throw e;
            }
        }
        const movementResult = await client.query(`INSERT INTO financial_goal_movements (user_id, goal_id, amount, note, movement_date, bank_account_id, source_bank_account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, goal_id, amount, note, movement_date, created_at, updated_at, bank_account_id, source_bank_account_id`, [userId, goalId, numericAmount, note || null, dateStr, snapBankId, sourceBankId]);
        await client.query(`UPDATE financial_goals
       SET current_amount = COALESCE(current_amount, 0) + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`, [numericAmount, goalId, userId]);
        await syncGoalStatusAfterAmountChange(Number(goalId), userId, client);
        const row = movementResult.rows[0];
        let bankName = null;
        let bankNum = null;
        if (row.bank_account_id) {
            const bn = await client.query(`SELECT bank_name, account_number FROM bank_accounts WHERE id = $1 AND user_id = $2`, [row.bank_account_id, userId]);
            if (bn.rows.length > 0) {
                bankName = String(bn.rows[0].bank_name);
                bankNum = bn.rows[0].account_number != null ? String(bn.rows[0].account_number) : null;
            }
        }
        let srcName = null;
        let srcNum = null;
        if (row.source_bank_account_id) {
            const sn = await client.query(`SELECT bank_name, account_number FROM bank_accounts WHERE id = $1 AND user_id = $2`, [row.source_bank_account_id, userId]);
            if (sn.rows.length > 0) {
                srcName = String(sn.rows[0].bank_name);
                srcNum = sn.rows[0].account_number != null ? String(sn.rows[0].account_number) : null;
            }
        }
        await client.query('COMMIT');
        res.status(201).json({
            success: true,
            movement: {
                ...mapMovementRow({
                    ...row,
                    bank_account_name: bankName,
                    bank_account_number: bankNum,
                    source_bank_account_name: srcName,
                    source_bank_account_number: srcNum,
                }),
            },
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Add financial goal movement error:', error);
        res.status(500).json({ message: 'Error adding financial goal movement', error: error.message });
    }
    finally {
        client.release();
    }
};
exports.addGoalMovement = addGoalMovement;
const updateGoalMovement = async (req, res) => {
    const userId = req.userId;
    const { goalId, movementId } = req.params;
    const body = req.body;
    const { amount, note, movementDate } = body;
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
        return res.status(400).json({ message: 'Amount is required and must be a number' });
    }
    if (movementDate === undefined || movementDate === null || String(movementDate).trim() === '') {
        return res.status(400).json({ message: 'movementDate is required' });
    }
    const numericAmount = roundMoney(parseFloat(String(amount)));
    const dateStr = String(movementDate).trim().slice(0, 10);
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        const goalResult = await client.query(`SELECT target_amount, current_amount, status, currency FROM financial_goals WHERE id = $1 AND user_id = $2 FOR UPDATE`, [goalId, userId]);
        if (goalResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Financial goal not found' });
        }
        const goalRow = goalResult.rows[0];
        if (goalRow.status !== 'ACTIVE' && goalRow.status !== 'COMPLETED') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'No se puede editar el abono en el estado actual de la meta' });
        }
        const currency = String(goalRow.currency);
        const existingResult = await client.query(`SELECT amount, note, bank_account_id, source_bank_account_id
       FROM financial_goal_movements
       WHERE id = $1 AND goal_id = $2 AND user_id = $3`, [movementId, goalId, userId]);
        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Movement not found' });
        }
        const existingAmount = roundMoney(parseFloat(existingResult.rows[0].amount));
        const existingNote = existingResult.rows[0].note;
        const movBankId = existingResult.rows[0].bank_account_id;
        const prevSrcId = existingResult.rows[0].source_bank_account_id;
        const newSrcId = parseSourceBankUpdate(body, prevSrcId);
        const delta = roundMoney(numericAmount - existingAmount);
        const target = roundMoney(parseFloat(goalRow.target_amount));
        const current = roundMoney(parseFloat(goalRow.current_amount || 0));
        const hypothetical = roundMoney(current + delta);
        if (numericAmount <= 0 || isNaN(numericAmount)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'El monto debe ser mayor que cero' });
        }
        if (hypothetical > target + 0.005) {
            await client.query('ROLLBACK');
            const maxAllowed = roundMoney(target - (current - existingAmount));
            return res.status(400).json({
                message: `El monto no puede exceder el saldo máximo posible para este abono (${maxAllowed.toFixed(2)})`,
            });
        }
        const errNewSrc = await validateAccountForGoalCurrency(userId, newSrcId, currency);
        if (errNewSrc) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: errNewSrc });
        }
        if (newSrcId && movBankId && newSrcId === movBankId) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'La cuenta origen y la cuenta de la meta no pueden ser la misma' });
        }
        try {
            if (prevSrcId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, prevSrcId, currency, existingAmount, client);
            }
            if (movBankId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, movBankId, currency, -existingAmount, client);
            }
            if (newSrcId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, newSrcId, currency, -numericAmount, client);
            }
            if (movBankId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, movBankId, currency, numericAmount, client);
            }
        }
        catch (e) {
            await client.query('ROLLBACK');
            if (e?.message === 'ACCOUNT_NOT_FOUND') {
                return res.status(400).json({ message: 'Cuenta del abono no encontrada' });
            }
            if (e?.message === 'CURRENCY_MISMATCH') {
                return res.status(400).json({ message: 'La moneda no coincide con la cuenta del abono' });
            }
            throw e;
        }
        const noteForDb = note === undefined ? existingNote : note === null || note === '' ? null : String(note);
        const updateResult = await client.query(`UPDATE financial_goal_movements
       SET amount = $1,
           note = $2,
           movement_date = $3,
           source_bank_account_id = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND goal_id = $6 AND user_id = $7
       RETURNING id, goal_id, amount, note, movement_date, created_at, updated_at, bank_account_id, source_bank_account_id`, [numericAmount, noteForDb, dateStr, newSrcId, movementId, goalId, userId]);
        await client.query(`UPDATE financial_goals
       SET current_amount = COALESCE(current_amount, 0) + $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`, [delta, goalId, userId]);
        await syncGoalStatusAfterAmountChange(Number(goalId), userId, client);
        const row = updateResult.rows[0];
        let bankName = null;
        if (row.bank_account_id) {
            const bn = await client.query(`SELECT bank_name FROM bank_accounts WHERE id = $1 AND user_id = $2`, [
                row.bank_account_id,
                userId,
            ]);
            if (bn.rows.length > 0)
                bankName = String(bn.rows[0].bank_name);
        }
        await client.query('COMMIT');
        res.json({
            success: true,
            movement: {
                ...mapMovementRow({ ...row, bank_account_name: bankName }),
            },
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Update financial goal movement error:', error);
        res.status(500).json({ message: 'Error updating financial goal movement', error: error.message });
    }
    finally {
        client.release();
    }
};
exports.updateGoalMovement = updateGoalMovement;
const deleteGoalMovement = async (req, res) => {
    const userId = req.userId;
    const { goalId, movementId } = req.params;
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        const goalResult = await client.query(`SELECT currency FROM financial_goals WHERE id = $1 AND user_id = $2 FOR UPDATE`, [goalId, userId]);
        if (goalResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Financial goal not found' });
        }
        const currency = String(goalResult.rows[0].currency);
        const existingResult = await client.query(`SELECT amount, bank_account_id, source_bank_account_id
       FROM financial_goal_movements
       WHERE id = $1 AND goal_id = $2 AND user_id = $3`, [movementId, goalId, userId]);
        if (existingResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Movement not found' });
        }
        const existingAmount = roundMoney(parseFloat(existingResult.rows[0].amount));
        const movBankId = existingResult.rows[0].bank_account_id;
        const srcId = existingResult.rows[0].source_bank_account_id;
        try {
            if (srcId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, srcId, currency, existingAmount, client);
            }
            if (movBankId) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, movBankId, currency, -existingAmount, client);
            }
        }
        catch (e) {
            await client.query('ROLLBACK');
            if (e?.message === 'ACCOUNT_NOT_FOUND') {
                return res.status(400).json({ message: 'Cuenta del abono no encontrada' });
            }
            if (e?.message === 'CURRENCY_MISMATCH') {
                return res.status(400).json({ message: 'La moneda no coincide con la cuenta del abono' });
            }
            throw e;
        }
        await client.query(`DELETE FROM financial_goal_movements
       WHERE id = $1 AND goal_id = $2 AND user_id = $3`, [movementId, goalId, userId]);
        await client.query(`UPDATE financial_goals
       SET current_amount = COALESCE(current_amount, 0) - $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`, [existingAmount, goalId, userId]);
        await syncGoalStatusAfterAmountChange(Number(goalId), userId, client);
        await client.query('COMMIT');
        res.json({
            success: true,
            message: 'Movement deleted successfully',
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Delete financial goal movement error:', error);
        res.status(500).json({ message: 'Error deleting financial goal movement', error: error.message });
    }
    finally {
        client.release();
    }
};
exports.deleteGoalMovement = deleteGoalMovement;
//# sourceMappingURL=financialGoalMovementsController.js.map