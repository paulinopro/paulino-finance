"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateExpensePaymentStatus = exports.deleteExpense = exports.updateExpense = exports.createExpense = exports.getExpense = exports.getExpenses = void 0;
const activeEntityGuard_1 = require("./activeEntityGuard");
const database_1 = require("../config/database");
const userCurrencyConversion_1 = require("../services/userCurrencyConversion");
const accountBalance_1 = require("../services/accountBalance");
const accountsPaymentLinkSync_1 = require("../services/accountsPaymentLinkSync");
const expenseDeletionService_1 = require("../services/expenseDeletionService");
const vehicleExpenseLinkSync_1 = require("../services/vehicleExpenseLinkSync");
const incomeExpenseTaxonomy_1 = require("../constants/incomeExpenseTaxonomy");
const recurrenceBoundary_1 = require("../utils/recurrenceBoundary");
const dateUtils_1 = require("../utils/dateUtils");
const userCurrencyPair_1 = require("../utils/userCurrencyPair");
const recurringPeriodAmounts_1 = require("../services/recurringPeriodAmounts");
function validateExpenseSchedule(recurrenceType, frequency, paymentDay, paymentMonth, date) {
    if (recurrenceType === 'non_recurrent') {
        if (date === undefined || date === null || date === '') {
            return 'Date is required for non-recurring expenses';
        }
        return null;
    }
    if (!frequency || !incomeExpenseTaxonomy_1.FREQUENCY_VALUES.includes(frequency)) {
        return 'Frequency is required for recurrent expenses';
    }
    if (frequency === 'monthly') {
        if (paymentDay === undefined || paymentDay === null || paymentDay === '') {
            return 'Payment day is required for recurring monthly expenses';
        }
        return null;
    }
    if (frequency === 'annual') {
        if (paymentMonth === undefined || paymentMonth === null || paymentMonth === '') {
            return 'Payment month is required for annual expenses';
        }
        return null;
    }
    if (frequency === 'daily' ||
        frequency === 'weekly' ||
        frequency === 'biweekly' ||
        frequency === 'semi_monthly' ||
        frequency === 'quarterly' ||
        frequency === 'semi_annual') {
        if (date === undefined || date === null || date === '') {
            return 'Date is required for this expense frequency';
        }
    }
    return null;
}
function resolveExpenseTaxonomy(merged) {
    const natureVal = merged.nature;
    if (natureVal !== 'fixed' && natureVal !== 'variable')
        return null;
    const nature = natureVal;
    const rtRaw = merged.recurrenceType ?? merged.recurrence_type;
    if (rtRaw !== 'recurrent' && rtRaw !== 'non_recurrent')
        return null;
    const recurrenceType = rtRaw;
    let frequency = (0, incomeExpenseTaxonomy_1.normalizeFrequency)(merged.frequency);
    if (recurrenceType === 'non_recurrent') {
        frequency = null;
    }
    else {
        if (!frequency || !incomeExpenseTaxonomy_1.FREQUENCY_VALUES.includes(frequency))
            return null;
    }
    return { nature, recurrenceType, frequency };
}
function isMonthlyRecurringExpense(row) {
    return row.recurrence_type === 'recurrent' && (0, incomeExpenseTaxonomy_1.normalizeFrequency)(row.frequency ?? undefined) === 'monthly';
}
/** Monto efectivo del ciclo actual cuando hay variable recurrente mensual pagado/cobrado con fila en *_period_amounts. */
function amountForVariableMonthlyPeriodRow(row, slotPaidOrReceived, monthlyRec) {
    const base = parseFloat(String(row.amount));
    if (!monthlyRec || row.nature !== 'variable' || !slotPaidOrReceived)
        return base;
    const pv = row.period_amount;
    if (pv != null && pv !== '') {
        const n = parseFloat(String(pv));
        if (!Number.isNaN(n))
            return n;
    }
    return base;
}
function parseBankAccountIdFromBody(body, mode, previous) {
    if (!('bankAccountId' in body)) {
        return mode === 'create' ? null : previous;
    }
    const v = body.bankAccountId;
    if (v === null || v === undefined || v === '')
        return null;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? null : n;
}
const getExpenses = async (req, res) => {
    try {
        const userId = req.userId;
        const { month, year, search, category, nature, recurrenceType, frequency, page = '1', limit = '20', } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;
        let whereClause = 'WHERE e.user_id = $1';
        const params = [userId];
        let paramIndex = 2;
        if (search) {
            whereClause += ` AND e.description ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        const natureStr = nature != null && String(nature).trim() !== '' ? String(nature).trim() : '';
        const recurrenceStr = recurrenceType != null && String(recurrenceType).trim() !== '' ? String(recurrenceType).trim() : '';
        const frequencyStr = frequency != null && String(frequency).trim() !== '' ? String(frequency).trim().toLowerCase() : '';
        if (natureStr === 'fixed' || natureStr === 'variable') {
            whereClause += ` AND e.nature = $${paramIndex}`;
            params.push(natureStr);
            paramIndex++;
        }
        if (recurrenceStr === 'recurrent' || recurrenceStr === 'non_recurrent') {
            whereClause += ` AND e.recurrence_type = $${paramIndex}`;
            params.push(recurrenceStr);
            paramIndex++;
        }
        if (frequencyStr) {
            whereClause += ` AND LOWER(TRIM(COALESCE(e.frequency, ''))) = $${paramIndex}`;
            params.push(frequencyStr);
            paramIndex++;
        }
        if (category) {
            whereClause += ` AND e.category = $${paramIndex}`;
            params.push(category);
            paramIndex++;
        }
        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM expenses e ${whereClause}`;
        const countResult = await (0, database_1.query)(countQuery, params);
        const total = parseInt(countResult.rows[0].total);
        // Save paramIndex before adding limit/offset for totals query
        const paramsBeforePagination = [...params];
        const paramIndexBeforePagination = paramIndex;
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        // Get paginated results
        let queryText = `
      SELECT e.id, e.description, e.amount, e.currency, e.nature, e.recurrence_type, e.frequency,
             e.category,
             e.payment_day, e.payment_month, e.date, e.is_paid, e.last_paid_month, e.last_paid_year,
             e.bank_account_id, e.is_active, e.recurrence_start_date, e.recurrence_end_date, e.created_at, e.updated_at,
             v.id AS vehicle_id, v.make AS vehicle_make, v.model AS vehicle_model,
             (SELECT epa.amount FROM expense_period_amounts epa
              WHERE epa.expense_id = e.id AND epa.user_id = e.user_id
                AND epa.year = ${currentYear} AND epa.month = ${currentMonth}
              LIMIT 1) AS period_amount
      FROM expenses e
      LEFT JOIN vehicle_expenses ve ON ve.linked_expense_id = e.id
      LEFT JOIN vehicles v ON v.id = ve.vehicle_id AND v.user_id = e.user_id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
        params.push(limitNum, offset);
        const result = await (0, database_1.query)(queryText, params);
        const expenses = result.rows.map((row) => {
            // For recurring monthly expenses, check if paid this month
            let isPaid = row.is_paid;
            if (isMonthlyRecurringExpense(row)) {
                // Reset to unpaid if last paid month/year is not current month/year
                if (row.last_paid_month !== currentMonth || row.last_paid_year !== currentYear) {
                    isPaid = false;
                }
            }
            return {
                id: row.id,
                description: row.description,
                amount: amountForVariableMonthlyPeriodRow(row, isPaid, isMonthlyRecurringExpense(row)),
                currency: row.currency,
                nature: row.nature,
                recurrenceType: row.recurrence_type,
                frequency: row.frequency,
                category: row.category,
                paymentDay: row.payment_day,
                paymentMonth: row.payment_month,
                date: row.date,
                isPaid: isPaid,
                bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
                isActive: row.is_active === true,
                vehicleId: row.vehicle_id != null ? row.vehicle_id : null,
                vehicleLabel: row.vehicle_id != null
                    ? `${row.vehicle_make || ''} ${row.vehicle_model || ''}`.trim() || null
                    : null,
                recurrenceStartDate: row.recurrence_start_date ? (0, dateUtils_1.toYmdFromPgDate)(row.recurrence_start_date) : null,
                recurrenceEndDate: row.recurrence_end_date ? (0, dateUtils_1.toYmdFromPgDate)(row.recurrence_end_date) : null,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
        });
        // Calculate totals for all expenses (not just current page)
        // Use params without limit and offset
        const allExpensesResult = await (0, database_1.query)(`SELECT e.amount, e.currency FROM expenses e ${whereClause} AND e.is_active = TRUE`, paramsBeforePagination);
        const ctx = await (0, userCurrencyConversion_1.getConversionContextForUser)(userId);
        const totalsByCurrency = {};
        let totalInPrimary = 0;
        for (const row of allExpensesResult.rows) {
            const amt = parseFloat(row.amount);
            const c = String(row.currency || 'DOP').toUpperCase();
            totalsByCurrency[c] = (totalsByCurrency[c] || 0) + amt;
            totalInPrimary += (0, userCurrencyConversion_1.amountToPrimary)(amt, c, ctx);
        }
        const totalPrimary = totalsByCurrency[ctx.pair.primary] ?? 0;
        const totalSecondary = totalsByCurrency[ctx.pair.secondary] ?? 0;
        const totalPages = Math.ceil(total / limitNum);
        res.json({
            success: true,
            expenses,
            summary: {
                totalsByCurrency,
                totalInPrimary,
                totalPrimary,
                totalSecondary,
                primaryCurrency: ctx.pair.primary,
                secondaryCurrency: ctx.pair.secondary,
                exchangeRate: ctx.pairRateSecondaryPerPrimary,
                totalDop: totalsByCurrency.DOP ?? 0,
                totalUsd: totalsByCurrency.USD ?? 0,
                totalExpenses: allExpensesResult.rows.length,
            },
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages,
            },
        });
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Get expenses error:', error);
        res.status(500).json({ message: 'Error fetching expenses', error: error.message });
    }
};
exports.getExpenses = getExpenses;
const getExpense = async (req, res) => {
    try {
        const userId = req.userId;
        const expenseId = parseInt(req.params.id);
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        const result = await (0, database_1.query)(`SELECT e.id, e.description, e.amount, e.currency, e.nature, e.recurrence_type, e.frequency,
              e.category,
              e.payment_day, e.payment_month, e.date, e.is_paid, e.last_paid_month, e.last_paid_year,
              e.bank_account_id, e.is_active, e.recurrence_start_date, e.recurrence_end_date, e.created_at, e.updated_at,
              v.id AS vehicle_id, v.make AS vehicle_make, v.model AS vehicle_model,
              (SELECT epa.amount FROM expense_period_amounts epa
               WHERE epa.expense_id = e.id AND epa.user_id = e.user_id
                 AND epa.year = ${currentYear} AND epa.month = ${currentMonth}
               LIMIT 1) AS period_amount
       FROM expenses e
       LEFT JOIN vehicle_expenses ve ON ve.linked_expense_id = e.id
       LEFT JOIN vehicles v ON v.id = ve.vehicle_id AND v.user_id = e.user_id
       WHERE e.id = $1 AND e.user_id = $2`, [expenseId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Expense not found' });
        }
        const row = result.rows[0];
        // For recurring monthly expenses, check if paid this month
        let isPaid = row.is_paid;
        if (isMonthlyRecurringExpense(row)) {
            if (row.last_paid_month !== currentMonth || row.last_paid_year !== currentYear) {
                isPaid = false;
            }
        }
        res.json({
            success: true,
            expense: {
                id: row.id,
                description: row.description,
                amount: amountForVariableMonthlyPeriodRow(row, isPaid, isMonthlyRecurringExpense(row)),
                currency: row.currency,
                nature: row.nature,
                recurrenceType: row.recurrence_type,
                frequency: row.frequency,
                category: row.category,
                paymentDay: row.payment_day,
                paymentMonth: row.payment_month,
                date: row.date,
                isPaid: isPaid,
                bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
                isActive: row.is_active === true,
                vehicleId: row.vehicle_id != null ? row.vehicle_id : null,
                vehicleLabel: row.vehicle_id != null
                    ? `${row.vehicle_make || ''} ${row.vehicle_model || ''}`.trim() || null
                    : null,
                recurrenceStartDate: row.recurrence_start_date ? (0, dateUtils_1.toYmdFromPgDate)(row.recurrence_start_date) : null,
                recurrenceEndDate: row.recurrence_end_date ? (0, dateUtils_1.toYmdFromPgDate)(row.recurrence_end_date) : null,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Get expense error:', error);
        res.status(500).json({ message: 'Error fetching expense', error: error.message });
    }
};
exports.getExpense = getExpense;
const createExpense = async (req, res) => {
    const userId = req.userId;
    const { description, amount, currency, category, paymentDay, paymentMonth, date, isPaid } = req.body;
    if (!description || !amount) {
        return res.status(400).json({ message: 'Missing required fields' });
    }
    const body = req.body;
    const tx = resolveExpenseTaxonomy(body);
    if (!tx) {
        return res.status(400).json({
            message: 'Se requieren nature (fixed|variable), recurrenceType (recurrent|non_recurrent) y frequency cuando el gasto es recurrente',
        });
    }
    const schedErr = validateExpenseSchedule(tx.recurrenceType, tx.frequency, paymentDay, paymentMonth, date);
    if (schedErr) {
        return res.status(400).json({ message: schedErr });
    }
    const pair = await (0, userCurrencyPair_1.getUserCurrencyPair)(userId);
    const cur = currency != null && String(currency).trim() !== ''
        ? String(currency).trim().toUpperCase()
        : pair.primary;
    if (!(0, userCurrencyPair_1.isCurrencyInUserPair)(pair, cur)) {
        return res.status(400).json({
            message: 'La moneda debe ser la principal o la secundaria de tu perfil (Configuración).',
        });
    }
    const bankAccountId = parseBankAccountIdFromBody(req.body, 'create', null);
    if (bankAccountId) {
        const ledErr = (0, userCurrencyPair_1.validateLedgerCurrencyForUser)(pair, cur);
        if (ledErr) {
            return res.status(400).json({ message: ledErr });
        }
    }
    const amt = parseFloat(String(amount));
    const initialPaid = typeof isPaid === 'boolean' ? isPaid : false;
    const ledgerGastoDesc = `Gasto: ${String(description)}`;
    let recurrenceStartDate = null;
    let recurrenceEndDate = null;
    if (tx.recurrenceType === 'recurrent') {
        const rb = (0, recurrenceBoundary_1.parseRecurrenceBoundaryFromBody)(body);
        if (rb.error) {
            return res.status(400).json({ message: rb.error });
        }
        recurrenceStartDate = rb.start;
        recurrenceEndDate = rb.end;
    }
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        const result = await client.query(`INSERT INTO expenses 
       (user_id, description, amount, currency, nature, recurrence_type, frequency, category, payment_day, payment_month, date, bank_account_id, is_paid, recurrence_start_date, recurrence_end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, description, amount, currency, nature, recurrence_type, frequency, category,
                 payment_day, payment_month, date, is_paid, bank_account_id, recurrence_start_date, recurrence_end_date, created_at, updated_at, last_paid_month, last_paid_year`, [
            userId,
            description,
            amt,
            cur,
            tx.nature,
            tx.recurrenceType,
            tx.frequency,
            category || null,
            paymentDay || null,
            paymentMonth || null,
            date || null,
            bankAccountId,
            initialPaid,
            tx.recurrenceType === 'recurrent' ? recurrenceStartDate : null,
            tx.recurrenceType === 'recurrent' ? recurrenceEndDate : null,
        ]);
        const rowId = result.rows[0].id;
        if (initialPaid &&
            bankAccountId &&
            (0, incomeExpenseTaxonomy_1.expenseUsesImmediateBalance)({
                recurrence_type: tx.recurrenceType,
                frequency: tx.frequency,
            })) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, cur, -amt, client, {
                    description: ledgerGastoDesc,
                });
            }
            catch (e) {
                if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        message: e.message === 'CURRENCY_MISMATCH'
                            ? 'La moneda no coincide con la cuenta seleccionada'
                            : 'Cuenta no encontrada',
                    });
                }
                throw e;
            }
        }
        if (initialPaid && isMonthlyRecurringExpense({ recurrence_type: tx.recurrenceType, frequency: tx.frequency })) {
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();
            if (bankAccountId) {
                try {
                    await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, cur, -amt, client, {
                        description: ledgerGastoDesc,
                    });
                }
                catch (e) {
                    if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
                        await client.query('ROLLBACK');
                        return res.status(400).json({
                            message: e.message === 'CURRENCY_MISMATCH'
                                ? 'La moneda no coincide con la cuenta seleccionada'
                                : 'Cuenta no encontrada',
                        });
                    }
                    throw e;
                }
            }
            await client.query(`UPDATE expenses SET last_paid_month = $1, last_paid_year = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND user_id = $4`, [currentMonth, currentYear, rowId, userId]);
        }
        await client.query('COMMIT');
        const row = result.rows[0];
        res.status(201).json({
            success: true,
            message: 'Expense created successfully',
            expense: {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                nature: row.nature,
                recurrenceType: row.recurrence_type,
                frequency: row.frequency,
                category: row.category,
                paymentDay: row.payment_day,
                paymentMonth: row.payment_month,
                date: row.date,
                isPaid: row.is_paid,
                bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
                recurrenceStartDate: row.recurrence_start_date ? (0, dateUtils_1.toYmdFromPgDate)(row.recurrence_start_date) : null,
                recurrenceEndDate: row.recurrence_end_date ? (0, dateUtils_1.toYmdFromPgDate)(row.recurrence_end_date) : null,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Create expense error:', error);
        res.status(500).json({ message: 'Error creating expense', error: error.message });
    }
    finally {
        client.release();
    }
};
exports.createExpense = createExpense;
const updateExpense = async (req, res) => {
    const userId = req.userId;
    const expenseId = parseInt(req.params.id);
    const { description, amount, currency, category, paymentDay, paymentMonth, date, isPaid } = req.body;
    const oldResult = await (0, database_1.query)(`SELECT id, description, amount, currency, nature, recurrence_type, frequency, category,
            payment_day, payment_month, date, is_paid, bank_account_id, recurrence_start_date, recurrence_end_date
     FROM expenses WHERE id = $1 AND user_id = $2`, [expenseId, userId]);
    if (oldResult.rows.length === 0) {
        return res.status(404).json({ message: 'Expense not found' });
    }
    const payableErr = await (0, accountsPaymentLinkSync_1.validateExpenseUpdateForLinkedPayable)(userId, expenseId, {
        amount,
        currency,
    });
    if (payableErr) {
        return res.status(400).json({ message: payableErr });
    }
    const old = oldResult.rows[0];
    const body = req.body;
    const merged = {
        nature: body.nature !== undefined ? body.nature : old.nature,
        recurrenceType: body.recurrenceType !== undefined
            ? body.recurrenceType
            : body.recurrence_type !== undefined
                ? body.recurrence_type
                : old.recurrence_type,
        frequency: body.frequency !== undefined ? body.frequency : old.frequency,
    };
    const tx = resolveExpenseTaxonomy(merged);
    if (!tx) {
        return res.status(400).json({ message: 'Taxonomía inválida: nature, recurrenceType y frequency incompletos' });
    }
    const newDesc = description !== undefined ? description : old.description;
    const newAmount = amount !== undefined ? parseFloat(String(amount)) : parseFloat(old.amount);
    const newCurrency = currency !== undefined ? currency : old.currency;
    const pair = await (0, userCurrencyPair_1.getUserCurrencyPair)(userId);
    const curNorm = String(newCurrency).trim().toUpperCase();
    if (!(0, userCurrencyPair_1.isCurrencyInUserPair)(pair, curNorm)) {
        return res.status(400).json({
            message: 'La moneda debe ser la principal o la secundaria de tu perfil (Configuración).',
        });
    }
    const newCategory = category !== undefined ? category : old.category;
    const newPaymentDay = paymentDay !== undefined ? paymentDay : old.payment_day;
    const newPaymentMonth = paymentMonth !== undefined ? paymentMonth : old.payment_month;
    const newDate = date !== undefined ? date : old.date;
    const newIsPaid = isPaid !== undefined ? isPaid : old.is_paid;
    const newBankId = parseBankAccountIdFromBody(req.body, 'update', old.bank_account_id);
    if (newBankId) {
        const ledErr = (0, userCurrencyPair_1.validateLedgerCurrencyForUser)(pair, curNorm);
        if (ledErr) {
            return res.status(400).json({ message: ledErr });
        }
    }
    const schedErr = validateExpenseSchedule(tx.recurrenceType, tx.frequency, newPaymentDay, newPaymentMonth, newDate);
    if (schedErr) {
        return res.status(400).json({ message: schedErr });
    }
    const veLink = await (0, database_1.query)(`SELECT id FROM vehicle_expenses WHERE linked_expense_id = $1`, [expenseId]);
    if (veLink.rows.length > 0 && tx.recurrenceType !== 'non_recurrent') {
        return res.status(400).json({
            message: 'Un gasto vinculado a un vehículo debe ser puntual (no recurrente ni anual).',
        });
    }
    let recurrenceStartForDb = null;
    let recurrenceEndForDb = null;
    if (tx.recurrenceType === 'recurrent') {
        const rb = (0, recurrenceBoundary_1.parseRecurrenceBoundaryFromBody)(body);
        if (rb.error) {
            return res.status(400).json({ message: rb.error });
        }
        recurrenceStartForDb = rb.start;
        recurrenceEndForDb = rb.end;
    }
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        if ((0, incomeExpenseTaxonomy_1.expenseUsesImmediateBalance)({
            recurrence_type: old.recurrence_type,
            frequency: old.frequency,
        }) && old.bank_account_id) {
            await (0, accountBalance_1.applyBalanceDelta)(userId, old.bank_account_id, old.currency, parseFloat(old.amount), client, { description: `Reversión: «${old.description}»` });
        }
        const result = await client.query(`UPDATE expenses
       SET description = $1,
           amount = $2,
           currency = $3,
           nature = $4,
           recurrence_type = $5,
           frequency = $6,
           category = $7,
           payment_day = $8,
           payment_month = $9,
           date = $10,
           is_paid = $11,
           bank_account_id = $12,
           recurrence_start_date = $13,
           recurrence_end_date = $14,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $15 AND user_id = $16
       RETURNING id, description, amount, currency, nature, recurrence_type, frequency, category,
                 payment_day, payment_month, date, is_paid, bank_account_id, recurrence_start_date, recurrence_end_date, created_at, updated_at`, [
            newDesc,
            newAmount,
            newCurrency,
            tx.nature,
            tx.recurrenceType,
            tx.frequency,
            newCategory,
            newPaymentDay,
            newPaymentMonth,
            newDate,
            newIsPaid,
            newBankId,
            tx.recurrenceType === 'recurrent' ? recurrenceStartForDb : null,
            tx.recurrenceType === 'recurrent' ? recurrenceEndForDb : null,
            expenseId,
            userId,
        ]);
        if ((0, incomeExpenseTaxonomy_1.expenseUsesImmediateBalance)({
            recurrence_type: tx.recurrenceType,
            frequency: tx.frequency,
        }) &&
            newBankId) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, newBankId, newCurrency, -newAmount, client, {
                    description: `Gasto: ${newDesc}`,
                });
            }
            catch (e) {
                if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        message: e.message === 'CURRENCY_MISMATCH'
                            ? 'La moneda no coincide con la cuenta seleccionada'
                            : 'Cuenta no encontrada',
                    });
                }
                throw e;
            }
        }
        await (0, vehicleExpenseLinkSync_1.syncVehicleExpenseFromLinkedExpense)(client, userId, expenseId, {
            description: String(newDesc),
            amount: newAmount,
            currency: String(newCurrency),
            category: newCategory != null ? String(newCategory) : null,
            date: newDate != null ? String(newDate).slice(0, 10) : null,
            bankAccountId: newBankId,
        });
        await client.query('COMMIT');
        const row = result.rows[0];
        await (0, accountsPaymentLinkSync_1.syncPayablePaymentFromExpense)(userId, expenseId);
        res.json({
            success: true,
            message: 'Expense updated successfully',
            expense: {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                nature: row.nature,
                recurrenceType: row.recurrence_type,
                frequency: row.frequency,
                category: row.category,
                paymentDay: row.payment_day,
                paymentMonth: row.payment_month,
                date: row.date,
                isPaid: row.is_paid,
                bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
                recurrenceStartDate: row.recurrence_start_date ? (0, dateUtils_1.toYmdFromPgDate)(row.recurrence_start_date) : null,
                recurrenceEndDate: row.recurrence_end_date ? (0, dateUtils_1.toYmdFromPgDate)(row.recurrence_end_date) : null,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Update expense error:', error);
        res.status(500).json({ message: 'Error updating expense', error: error.message });
    }
    finally {
        client.release();
    }
};
exports.updateExpense = updateExpense;
const deleteExpense = async (req, res) => {
    try {
        const userId = req.userId;
        const expenseId = parseInt(req.params.id);
        const ok = await (0, expenseDeletionService_1.removeExpenseForUser)(userId, expenseId);
        if (!ok) {
            return res.status(404).json({ message: 'Expense not found' });
        }
        res.json({
            success: true,
            message: 'Expense deleted successfully',
        });
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Delete expense error:', error);
        res.status(500).json({ message: 'Error deleting expense', error: error.message });
    }
};
exports.deleteExpense = deleteExpense;
function resolveMonthlyPaymentAmount(expense, monthlyRec, actualAmountRaw) {
    const base = parseFloat(String(expense.amount));
    if (!monthlyRec || expense.nature !== 'variable')
        return base;
    if (actualAmountRaw === undefined || actualAmountRaw === null || actualAmountRaw === '')
        return base;
    const n = typeof actualAmountRaw === 'number' ? actualAmountRaw : parseFloat(String(actualAmountRaw));
    if (Number.isNaN(n) || n <= 0) {
        throw new Error('INVALID_ACTUAL_AMOUNT');
    }
    return n;
}
const updateExpensePaymentStatus = async (req, res) => {
    try {
        const userId = req.userId;
        const expenseId = parseInt(req.params.id);
        if (!(await (0, activeEntityGuard_1.ensureActiveEntity)('expenses', expenseId, userId, res)))
            return;
        const { isPaid } = req.body;
        const actualAmountRaw = req.body.actualAmount;
        if (typeof isPaid !== 'boolean') {
            return res.status(400).json({ message: 'isPaid must be a boolean' });
        }
        const checkResult = await (0, database_1.query)(`SELECT id, description, nature, recurrence_type, frequency, amount, currency, bank_account_id, last_paid_month, last_paid_year
       FROM expenses WHERE id = $1 AND user_id = $2`, [expenseId, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Expense not found' });
        }
        const expense = checkResult.rows[0];
        const monthlyRec = isMonthlyRecurringExpense(expense);
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        const alreadyMarkedPaidThisMonth = expense.last_paid_month === currentMonth && expense.last_paid_year === currentYear;
        const applyRecurringBalance = async (paid, ledgerAmount, client) => {
            if (!monthlyRec || !expense.bank_account_id)
                return;
            const delta = paid ? -ledgerAmount : ledgerAmount;
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, expense.bank_account_id, expense.currency, delta, client, {
                    description: delta < 0
                        ? `Pago recurrente (mes actual): «${expense.description}»`
                        : `Reversión de pago recurrente: «${expense.description}»`,
                });
            }
            catch (e) {
                console.error('Recurring expense balance:', e);
                throw e;
            }
        };
        if (monthlyRec) {
            let payAmount;
            try {
                payAmount = resolveMonthlyPaymentAmount(expense, monthlyRec, actualAmountRaw);
            }
            catch {
                return res.status(400).json({ message: 'actualAmount must be a positive number' });
            }
            const reverseLedgerAmount = async () => {
                const base = parseFloat(String(expense.amount));
                if (expense.nature !== 'variable')
                    return base;
                const v = await (0, recurringPeriodAmounts_1.getExpensePeriodAmount)(userId, expenseId, currentYear, currentMonth);
                return v != null ? v : base;
            };
            const client = await (0, database_1.getClient)();
            try {
                await client.query('BEGIN');
                if (isPaid) {
                    if (!alreadyMarkedPaidThisMonth) {
                        if (expense.nature === 'variable') {
                            await (0, recurringPeriodAmounts_1.upsertExpensePeriodAmount)(client, userId, expenseId, currentYear, currentMonth, payAmount);
                        }
                        await applyRecurringBalance(true, payAmount, client);
                    }
                    const result = await client.query(`UPDATE expenses
             SET is_paid = $1,
                 last_paid_month = $2,
                 last_paid_year = $3,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4 AND user_id = $5
             RETURNING id, description, is_paid, last_paid_month, last_paid_year, updated_at`, [isPaid, currentMonth, currentYear, expenseId, userId]);
                    await client.query('COMMIT');
                    res.json({
                        success: true,
                        message: 'Payment status updated successfully',
                        expense: {
                            id: result.rows[0].id,
                            description: result.rows[0].description,
                            isPaid: result.rows[0].is_paid,
                            updatedAt: result.rows[0].updated_at,
                        },
                    });
                }
                else {
                    if (alreadyMarkedPaidThisMonth) {
                        const rev = await reverseLedgerAmount();
                        await applyRecurringBalance(false, rev, client);
                        if (expense.nature === 'variable') {
                            await (0, recurringPeriodAmounts_1.deleteExpensePeriodAmount)(client, userId, expenseId, currentYear, currentMonth);
                        }
                    }
                    const result = await client.query(`UPDATE expenses
             SET is_paid = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2 AND user_id = $3
             RETURNING id, description, is_paid, updated_at`, [isPaid, expenseId, userId]);
                    await client.query('COMMIT');
                    res.json({
                        success: true,
                        message: 'Payment status updated successfully',
                        expense: {
                            id: result.rows[0].id,
                            description: result.rows[0].description,
                            isPaid: result.rows[0].is_paid,
                            updatedAt: result.rows[0].updated_at,
                        },
                    });
                }
            }
            catch (e) {
                await client.query('ROLLBACK');
                if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
                    return res.status(400).json({
                        message: e.message === 'CURRENCY_MISMATCH'
                            ? 'La moneda no coincide con la cuenta seleccionada'
                            : 'Cuenta no encontrada',
                    });
                }
                throw e;
            }
            finally {
                client.release();
            }
        }
        else {
            const result = await (0, database_1.query)(`UPDATE expenses
         SET is_paid = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND user_id = $3
         RETURNING id, description, is_paid, updated_at`, [isPaid, expenseId, userId]);
            res.json({
                success: true,
                message: 'Payment status updated successfully',
                expense: {
                    id: result.rows[0].id,
                    description: result.rows[0].description,
                    isPaid: result.rows[0].is_paid,
                    updatedAt: result.rows[0].updated_at,
                },
            });
        }
    }
    catch (error) {
        if ((0, activeEntityGuard_1.respondInactiveEntityError)(error, res))
            return;
        console.error('Update payment status error:', error);
        res.status(500).json({ message: 'Error updating payment status', error: error.message });
    }
};
exports.updateExpensePaymentStatus = updateExpensePaymentStatus;
//# sourceMappingURL=expenseController.js.map