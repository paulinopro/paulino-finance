"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFinancialSummary = exports.updateEventStatus = exports.generateCalendarEvents = exports.getCalendarEvents = exports.getHiddenCalendarEvents = void 0;
exports.deleteCalendarEventsForRelated = deleteCalendarEventsForRelated;
exports.hideOrphanCalendarEvents = hideOrphanCalendarEvents;
exports.listOrphanCalendarEvents = listOrphanCalendarEvents;
const database_1 = require("../config/database");
const incomeExpenseTaxonomy_1 = require("../constants/incomeExpenseTaxonomy");
const dateUtils_1 = require("../utils/dateUtils");
const exchangeRate_1 = require("../utils/exchangeRate");
/** Alinea la fila del calendario con el origen (título, montos, colores y estado derivado del sistema). */
async function replaceCalendarEventFromSource(userId, eventId, b) {
    await (0, database_1.query)(`UPDATE calendar_events
     SET title = $1,
         amount = $2,
         currency = $3,
         color = $4,
         status = $5,
         show_on_calendar = true,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $6 AND user_id = $7`, [b.title, b.amount, b.currency, b.color, b.status, eventId, userId]);
}
function recurringExpenseSlotStatus(dateStr, expense, today) {
    const eventDate = new Date(dateStr + 'T12:00:00');
    const y = eventDate.getFullYear();
    const m = eventDate.getMonth() + 1;
    const monthly = expense.recurrence_type === 'recurrent' &&
        (0, incomeExpenseTaxonomy_1.normalizeFrequency)(expense.frequency ?? undefined) === 'monthly';
    if (monthly && expense.is_paid && expense.last_paid_month === m && expense.last_paid_year === y) {
        return { status: 'PAID', color: '#10b981' };
    }
    if (eventDate < today) {
        return { status: 'OVERDUE', color: '#ef4444' };
    }
    return { status: 'PENDING', color: '#f59e0b' };
}
/**
 * Tras cambiar estado en el calendario, refleja en ingresos/gastos para que la próxima generación sea coherente.
 */
async function syncSourceFinancialFromCalendarStatus(userId, row, status) {
    if (status === 'CANCELLED') {
        if (row.event_type === 'INCOME') {
            await (0, database_1.query)(`UPDATE income SET is_received = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [row.related_id, userId]);
        }
        else if (row.event_type === 'EXPENSE' || row.event_type === 'RECURRING_EXPENSE') {
            await (0, database_1.query)(`UPDATE expenses SET is_paid = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [row.related_id, userId]);
        }
        return;
    }
    const ymd = (0, dateUtils_1.toYmdFromPgDate)(row.event_date);
    if (!ymd)
        return;
    const d = (0, dateUtils_1.parseYmdLocal)(ymd);
    if (row.event_type === 'INCOME') {
        if (status === 'RECEIVED') {
            await (0, database_1.query)(`UPDATE income SET is_received = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [row.related_id, userId]);
        }
        else if (status === 'PENDING') {
            await (0, database_1.query)(`UPDATE income SET is_received = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [row.related_id, userId]);
        }
        return;
    }
    if (row.event_type === 'EXPENSE') {
        if (status === 'PAID') {
            await (0, database_1.query)(`UPDATE expenses SET is_paid = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [row.related_id, userId]);
        }
        else if (status === 'PENDING' || status === 'OVERDUE') {
            await (0, database_1.query)(`UPDATE expenses SET is_paid = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [row.related_id, userId]);
        }
        return;
    }
    if (row.event_type === 'RECURRING_EXPENSE') {
        if (status === 'PAID') {
            await (0, database_1.query)(`UPDATE expenses
         SET is_paid = true,
             last_paid_month = $1,
             last_paid_year = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND user_id = $4`, [d.getMonth() + 1, d.getFullYear(), row.related_id, userId]);
        }
        else if (status === 'PENDING' || status === 'OVERDUE') {
            await (0, database_1.query)(`UPDATE expenses SET is_paid = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2`, [row.related_id, userId]);
        }
    }
}
/** Alinea filas del calendario con las fechas calculadas de la serie (elimina huérfanas al acortar vigencia). */
async function syncRecurringCalendarSlotRange(userId, eventType, relatedType, relatedId, rangeStartStr, rangeEndStr, datesInRange, buildRow) {
    const existing = await (0, database_1.query)(`SELECT id, event_date FROM calendar_events
     WHERE user_id = $1 AND event_type = $2 AND related_id = $3
       AND event_date >= $4::date AND event_date <= $5::date`, [userId, eventType, relatedId, rangeStartStr, rangeEndStr]);
    const want = new Set(datesInRange);
    for (const r of existing.rows) {
        const ed = (0, dateUtils_1.toYmdFromPgDate)(r.event_date);
        if (!want.has(ed)) {
            await (0, database_1.query)(`DELETE FROM calendar_events WHERE id = $1`, [r.id]);
        }
    }
    for (const dateStr of datesInRange) {
        const existingEvent = await (0, database_1.query)(`SELECT id FROM calendar_events
       WHERE user_id = $1 AND event_type = $2 AND related_id = $3 AND event_date = $4::date`, [userId, eventType, relatedId, dateStr]);
        const b = buildRow(dateStr);
        if (existingEvent.rows.length === 0) {
            await (0, database_1.query)(`INSERT INTO calendar_events
         (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color, is_recurring)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, true)
         ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`, [
                userId,
                eventType,
                relatedId,
                relatedType,
                dateStr,
                b.title,
                b.amount,
                b.currency,
                b.status,
                b.color,
            ]);
        }
        else {
            await replaceCalendarEventFromSource(userId, existingEvent.rows[0].id, b);
        }
    }
}
/**
 * Deja de mostrar en el calendario financiero las filas ligadas al origen (p. ej. al borrar un ingreso).
 * Los registros permanecen en la base para historial (`show_on_calendar = false`).
 */
async function deleteCalendarEventsForRelated(userId, relatedId, eventTypes) {
    if (eventTypes.length === 0)
        return;
    await (0, database_1.query)(`UPDATE calendar_events
     SET show_on_calendar = false, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND related_id = $2 AND event_type = ANY($3::varchar[])`, [userId, relatedId, eventTypes]);
}
/** Condición SQL: fila de calendario cuyo origen (ingreso/gasto/préstamo/tarjeta) ya no existe para ese usuario. */
function orphanCalendarEventPredicate() {
    return `(
    (ce.event_type = 'INCOME' AND NOT EXISTS (
      SELECT 1 FROM income i WHERE i.id = ce.related_id AND i.user_id = ce.user_id
    ))
    OR (ce.event_type IN ('RECURRING_EXPENSE', 'EXPENSE') AND NOT EXISTS (
      SELECT 1 FROM expenses e WHERE e.id = ce.related_id AND e.user_id = ce.user_id
    ))
    OR (ce.event_type = 'LOAN_PAYMENT' AND NOT EXISTS (
      SELECT 1 FROM loans l WHERE l.id = ce.related_id AND l.user_id = ce.user_id
    ))
    OR (ce.event_type = 'CARD_PAYMENT' AND NOT EXISTS (
      SELECT 1 FROM credit_cards c WHERE c.id = ce.related_id AND c.user_id = ce.user_id
    ))
  )`;
}
/**
 * Oculta del calendario financiero los eventos cuyo origen ya no existe (mantiene la fila para historial).
 */
async function hideOrphanCalendarEvents(userId) {
    const r = await (0, database_1.query)(`UPDATE calendar_events ce
     SET show_on_calendar = false, updated_at = CURRENT_TIMESTAMP
     WHERE ce.user_id = $1 AND ce.show_on_calendar = true AND ${orphanCalendarEventPredicate()}`, [userId]);
    return r.rowCount ?? 0;
}
/**
 * Eventos aún huérfanos respecto al origen (el registro fuente no existe).
 * Pueden seguir en historial con show_on_calendar = false.
 */
async function listOrphanCalendarEvents(userId) {
    const r = await (0, database_1.query)(`SELECT ce.id, ce.event_type, ce.related_id, ce.related_type, ce.event_date, ce.title, ce.amount, ce.currency, ce.status
     FROM calendar_events ce
     WHERE ce.user_id = $1 AND ${orphanCalendarEventPredicate()}
     ORDER BY ce.event_date ASC NULLS LAST, ce.id ASC`, [userId]);
    return r.rows;
}
/** Eventos archivados: no se muestran en el calendario pero conservan datos para historial. */
const getHiddenCalendarEvents = async (userId, startDate, endDate) => {
    try {
        const result = await (0, database_1.query)(`SELECT * FROM calendar_events
       WHERE user_id = $1 AND show_on_calendar = false
         AND event_date >= $2 AND event_date <= $3
       ORDER BY event_date ASC, amount DESC`, [userId, startDate, endDate]);
        return result.rows.map((row) => ({
            id: row.id,
            eventType: row.event_type,
            relatedId: row.related_id,
            relatedType: row.related_type,
            eventDate: (0, dateUtils_1.toYmdFromPgDate)(row.event_date),
            title: row.title,
            amount: parseFloat(row.amount),
            currency: row.currency || 'DOP',
            status: row.status,
            isRecurring: row.is_recurring || false,
            recurrencePattern: row.recurrence_pattern,
            color: row.color || '#3b82f6',
            notes: row.notes,
        }));
    }
    catch (error) {
        console.error('Error getting hidden calendar events:', error);
        throw error;
    }
};
exports.getHiddenCalendarEvents = getHiddenCalendarEvents;
/**
 * Get calendar events for a date range
 */
const getCalendarEvents = async (userId, startDate, endDate, filters) => {
    try {
        let queryText = `
      SELECT * FROM calendar_events
      WHERE user_id = $1 
        AND show_on_calendar = true
        AND event_date >= $2 
        AND event_date <= $3
    `;
        const params = [userId, startDate, endDate];
        let paramIndex = 4;
        if (filters?.eventTypes && filters.eventTypes.length > 0) {
            queryText += ` AND event_type = ANY($${paramIndex})`;
            params.push(filters.eventTypes);
            paramIndex++;
        }
        if (filters?.status && filters.status.length > 0) {
            queryText += ` AND status = ANY($${paramIndex})`;
            params.push(filters.status);
            paramIndex++;
        }
        if (filters?.showPaid === false) {
            queryText += ` AND status NOT IN ('PAID', 'RECEIVED')`;
        }
        queryText += ` ORDER BY event_date ASC, amount DESC`;
        const result = await (0, database_1.query)(queryText, params);
        return result.rows.map((row) => ({
            id: row.id,
            eventType: row.event_type,
            relatedId: row.related_id,
            relatedType: row.related_type,
            eventDate: (0, dateUtils_1.toYmdFromPgDate)(row.event_date),
            title: row.title,
            amount: parseFloat(row.amount),
            currency: row.currency || 'DOP',
            status: row.status,
            isRecurring: row.is_recurring || false,
            recurrencePattern: row.recurrence_pattern,
            color: row.color || '#3b82f6',
            notes: row.notes,
        }));
    }
    catch (error) {
        console.error('Error getting calendar events:', error);
        throw error;
    }
};
exports.getCalendarEvents = getCalendarEvents;
/**
 * Generate calendar events from existing financial data
 */
const generateCalendarEvents = async (userId, startDate, endDate) => {
    try {
        const orphansHidden = await hideOrphanCalendarEvents(userId);
        const start = (0, dateUtils_1.parseYmdLocal)(startDate);
        const end = (0, dateUtils_1.parseYmdLocal)(endDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        // Get credit cards with payment due dates
        const cardsResult = await (0, database_1.query)(`SELECT id, bank_name, card_name, payment_due_day, current_debt_dop, current_debt_usd, currency_type
       FROM credit_cards
       WHERE user_id = $1`, [userId]);
        for (const card of cardsResult.rows) {
            const dueDay = card.payment_due_day;
            const currentMonth = start.getMonth();
            const currentYear = start.getFullYear();
            // Generate events for each month in range
            let checkDate = new Date(currentYear, currentMonth, dueDay);
            while (checkDate <= end) {
                const eventDate = (0, dateUtils_1.dateToYmdLocal)(checkDate);
                const isOverdue = checkDate < today;
                const debtAmount = card.currency_type === 'USD'
                    ? parseFloat(card.current_debt_usd || 0)
                    : parseFloat(card.current_debt_dop || 0);
                const currency = card.currency_type === 'USD' ? 'USD' : 'DOP';
                // Check if event already exists
                const existingEvent = await (0, database_1.query)(`SELECT id FROM calendar_events 
           WHERE user_id = $1 AND event_type = 'CARD_PAYMENT' 
           AND related_id = $2 AND event_date = $3`, [userId, card.id, eventDate]);
                const cardTitle = `Pago ${card.card_name} - ${card.bank_name}`;
                const cardStatus = isOverdue ? 'OVERDUE' : 'PENDING';
                const cardColor = isOverdue ? '#ef4444' : '#f59e0b';
                if (debtAmount > 0) {
                    if (existingEvent.rows.length === 0) {
                        await (0, database_1.query)(`INSERT INTO calendar_events 
               (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color, is_recurring)
               VALUES ($1, 'CARD_PAYMENT', $2, 'CARD', $3, $4, $5, $6, $7, $8, true)
               ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`, [
                            userId,
                            card.id,
                            eventDate,
                            cardTitle,
                            debtAmount,
                            currency,
                            cardStatus,
                            cardColor,
                        ]);
                    }
                    else {
                        await replaceCalendarEventFromSource(userId, existingEvent.rows[0].id, {
                            title: cardTitle,
                            amount: debtAmount,
                            currency,
                            status: cardStatus,
                            color: cardColor,
                        });
                    }
                }
                // Move to next month
                checkDate.setMonth(checkDate.getMonth() + 1);
            }
        }
        // Get loans with payment dates
        const loansResult = await (0, database_1.query)(`SELECT l.id, l.loan_name, l.bank_name, l.start_date, l.payment_day, 
              l.installment_amount, l.currency, l.total_installments, l.paid_installments
       FROM loans l
       WHERE l.user_id = $1 AND l.status = 'ACTIVE'`, [userId]);
        for (const loan of loansResult.rows) {
            const startDate = new Date(loan.start_date);
            const paymentDay = loan.payment_day || startDate.getDate();
            const installmentAmount = parseFloat(loan.installment_amount);
            const totalInstallments = loan.total_installments;
            const paidInstallments = loan.paid_installments || 0;
            // Generate events for remaining installments
            for (let i = paidInstallments + 1; i <= totalInstallments; i++) {
                const paymentDate = new Date(startDate);
                paymentDate.setMonth(paymentDate.getMonth() + i - 1);
                paymentDate.setDate(paymentDay);
                if (paymentDate >= start && paymentDate <= end) {
                    const eventDate = (0, dateUtils_1.dateToYmdLocal)(paymentDate);
                    const isOverdue = paymentDate < today;
                    // Check if event already exists
                    const existingEvent = await (0, database_1.query)(`SELECT id FROM calendar_events 
             WHERE user_id = $1 AND event_type = 'LOAN_PAYMENT' 
             AND related_id = $2 AND event_date = $3`, [userId, loan.id, eventDate]);
                    const loanTitle = `Cuota ${i} - ${loan.loan_name}`;
                    const loanStatus = isOverdue ? 'OVERDUE' : 'PENDING';
                    const loanColor = isOverdue ? '#ef4444' : '#f59e0b';
                    if (existingEvent.rows.length === 0) {
                        await (0, database_1.query)(`INSERT INTO calendar_events 
               (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color, is_recurring)
               VALUES ($1, 'LOAN_PAYMENT', $2, 'LOAN', $3, $4, $5, $6, $7, $8, true)
               ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`, [
                            userId,
                            loan.id,
                            eventDate,
                            loanTitle,
                            installmentAmount,
                            loan.currency,
                            loanStatus,
                            loanColor,
                        ]);
                    }
                    else {
                        await replaceCalendarEventFromSource(userId, existingEvent.rows[0].id, {
                            title: loanTitle,
                            amount: installmentAmount,
                            currency: loan.currency,
                            status: loanStatus,
                            color: loanColor,
                        });
                    }
                }
            }
        }
        // Get income events
        const incomeResult = await (0, database_1.query)(`SELECT id, description, amount, currency, date, frequency, receipt_day, recurrence_type,
              recurrence_start_date, recurrence_end_date, is_received
       FROM income
       WHERE user_id = $1 AND (date >= $2 OR recurrence_type = 'recurrent')`, [userId, startDate]);
        for (const income of incomeResult.rows) {
            if (income.recurrence_type === 'recurrent' && income.frequency) {
                const dates = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({
                    frequency: income.frequency,
                    receipt_day: income.receipt_day,
                    date: income.date,
                    recurrence_start_date: income.recurrence_start_date,
                    recurrence_end_date: income.recurrence_end_date,
                }, start, end);
                await syncRecurringCalendarSlotRange(userId, 'INCOME', 'INCOME', income.id, startDate, endDate, dates, (dateStr) => {
                    const eventDate = new Date(dateStr + 'T12:00:00');
                    const received = Boolean(income.is_received) || eventDate < today;
                    return {
                        title: income.description,
                        amount: parseFloat(income.amount),
                        currency: income.currency,
                        status: received ? 'RECEIVED' : 'PENDING',
                        color: '#10b981',
                    };
                });
            }
            else if (income.date) {
                // One-time income
                const eventDate = (0, dateUtils_1.toYmdFromPgDate)(income.date);
                if (eventDate >= startDate && eventDate <= endDate) {
                    await (0, database_1.query)(`DELETE FROM calendar_events
             WHERE user_id = $1 AND event_type = 'INCOME' AND related_id = $2 AND event_date <> $3::date`, [userId, income.id, eventDate]);
                    const existingEvent = await (0, database_1.query)(`SELECT id FROM calendar_events 
             WHERE user_id = $1 AND event_type = 'INCOME' 
             AND related_id = $2 AND event_date = $3`, [userId, income.id, eventDate]);
                    const oneTimeIncome = {
                        title: income.description,
                        amount: parseFloat(income.amount),
                        currency: income.currency,
                        status: income.is_received ? 'RECEIVED' : 'PENDING',
                        color: '#10b981',
                    };
                    if (existingEvent.rows.length === 0) {
                        await (0, database_1.query)(`INSERT INTO calendar_events 
               (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color)
               VALUES ($1, 'INCOME', $2, 'INCOME', $3, $4, $5, $6, $7, $8)
               ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`, [
                            userId,
                            income.id,
                            eventDate,
                            oneTimeIncome.title,
                            oneTimeIncome.amount,
                            oneTimeIncome.currency,
                            oneTimeIncome.status,
                            oneTimeIncome.color,
                        ]);
                    }
                    else {
                        await replaceCalendarEventFromSource(userId, existingEvent.rows[0].id, oneTimeIncome);
                    }
                }
            }
        }
        // Gastos recurrentes (todas las frecuencias con la misma expansión que flujo de caja)
        const expensesResult = await (0, database_1.query)(`SELECT id, description, amount, currency, payment_day, payment_month, frequency, recurrence_type, date,
              recurrence_start_date, recurrence_end_date, is_paid, last_paid_month, last_paid_year, category
       FROM expenses
       WHERE user_id = $1 AND recurrence_type = 'recurrent'`, [userId]);
        for (const expense of expensesResult.rows) {
            const dates = (0, dateUtils_1.getExpenseOccurrenceDatesInPeriod)({
                frequency: expense.frequency,
                payment_day: expense.payment_day,
                payment_month: expense.payment_month,
                date: expense.date,
                recurrence_start_date: expense.recurrence_start_date,
                recurrence_end_date: expense.recurrence_end_date,
            }, start, end);
            await syncRecurringCalendarSlotRange(userId, 'RECURRING_EXPENSE', 'EXPENSE', expense.id, startDate, endDate, dates, (dateStr) => {
                const { status, color } = recurringExpenseSlotStatus(dateStr, {
                    is_paid: Boolean(expense.is_paid),
                    last_paid_month: expense.last_paid_month,
                    last_paid_year: expense.last_paid_year,
                    frequency: expense.frequency,
                    recurrence_type: expense.recurrence_type,
                }, today);
                return {
                    title: expense.category
                        ? `${expense.description} (${expense.category})`
                        : expense.description,
                    amount: parseFloat(expense.amount),
                    currency: expense.currency,
                    status: status,
                    color,
                };
            });
        }
        // Gastos puntuales (un solo día en el calendario)
        const oneTimeExpensesResult = await (0, database_1.query)(`SELECT id, description, amount, currency, date, is_paid, category
       FROM expenses
       WHERE user_id = $1 AND recurrence_type = 'non_recurrent' AND date IS NOT NULL`, [userId]);
        for (const expense of oneTimeExpensesResult.rows) {
            const eventDate = (0, dateUtils_1.toYmdFromPgDate)(expense.date);
            if (!eventDate || eventDate < startDate || eventDate > endDate)
                continue;
            await (0, database_1.query)(`DELETE FROM calendar_events
         WHERE user_id = $1 AND event_type = 'EXPENSE' AND related_id = $2 AND event_date <> $3::date`, [userId, expense.id, eventDate]);
            const existingEvent = await (0, database_1.query)(`SELECT id FROM calendar_events
         WHERE user_id = $1 AND event_type = 'EXPENSE' AND related_id = $2 AND event_date = $3`, [userId, expense.id, eventDate]);
            const day = (0, dateUtils_1.parseYmdLocal)(eventDate);
            const isOverdue = day < today && !expense.is_paid;
            const row = {
                title: expense.category ? `${expense.description} (${expense.category})` : expense.description,
                amount: parseFloat(expense.amount),
                currency: expense.currency,
                status: expense.is_paid ? 'PAID' : isOverdue ? 'OVERDUE' : 'PENDING',
                color: expense.is_paid ? '#10b981' : isOverdue ? '#ef4444' : '#f59e0b',
            };
            if (existingEvent.rows.length === 0) {
                await (0, database_1.query)(`INSERT INTO calendar_events
           (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color)
           VALUES ($1, 'EXPENSE', $2, 'EXPENSE', $3::date, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`, [
                    userId,
                    expense.id,
                    eventDate,
                    row.title,
                    row.amount,
                    row.currency,
                    row.status,
                    row.color,
                ]);
            }
            else {
                await replaceCalendarEventFromSource(userId, existingEvent.rows[0].id, row);
            }
        }
        return { orphansHidden };
    }
    catch (error) {
        console.error('Error generating calendar events:', error);
        throw error;
    }
};
exports.generateCalendarEvents = generateCalendarEvents;
/**
 * Update event status
 */
const updateEventStatus = async (userId, eventId, status) => {
    try {
        const result = await (0, database_1.query)(`UPDATE calendar_events 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3 AND show_on_calendar = true
       RETURNING *`, [status, eventId, userId]);
        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
        await syncSourceFinancialFromCalendarStatus(userId, row, status);
        return {
            id: row.id,
            eventType: row.event_type,
            relatedId: row.related_id,
            relatedType: row.related_type,
            eventDate: (0, dateUtils_1.toYmdFromPgDate)(row.event_date),
            title: row.title,
            amount: parseFloat(row.amount),
            currency: row.currency || 'DOP',
            status: row.status,
            isRecurring: row.is_recurring || false,
            recurrencePattern: row.recurrence_pattern,
            color: row.color || '#3b82f6',
            notes: row.notes,
        };
    }
    catch (error) {
        console.error('Error updating event status:', error);
        throw error;
    }
};
exports.updateEventStatus = updateEventStatus;
/**
 * Get financial summary for a date range
 */
const getFinancialSummary = async (userId, startDate, endDate) => {
    try {
        const userRate = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const rate = (0, exchangeRate_1.resolveExchangeRateDopUsd)(userRate.rows[0]?.exchange_rate_dop_usd);
        const toDop = `CASE WHEN UPPER(TRIM(COALESCE(currency, 'DOP'))) = 'USD' THEN amount * $4::numeric ELSE amount END`;
        const result = await (0, database_1.query)(`SELECT 
        COALESCE(SUM(CASE WHEN event_type IN ('INCOME') AND status = 'RECEIVED' THEN ${toDop} ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN event_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'EXPENSE', 'RECURRING_EXPENSE') AND status = 'PAID' THEN ${toDop} ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN event_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'EXPENSE', 'RECURRING_EXPENSE') AND status = 'PENDING' AND event_date >= CURRENT_DATE THEN ${toDop} ELSE 0 END), 0) as pending_payments,
        COALESCE(SUM(CASE WHEN event_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'EXPENSE', 'RECURRING_EXPENSE') AND (status = 'OVERDUE' OR (status = 'PENDING' AND event_date < CURRENT_DATE)) THEN ${toDop} ELSE 0 END), 0) as overdue_payments
       FROM calendar_events
       WHERE user_id = $1 AND show_on_calendar = true AND event_date >= $2::date AND event_date <= $3::date`, [userId, startDate, endDate, rate]);
        const row = result.rows[0];
        const totalIncome = parseFloat(row.total_income || 0);
        const totalExpenses = parseFloat(row.total_expenses || 0);
        const balance = totalIncome - totalExpenses;
        return {
            totalIncome,
            totalExpenses,
            balance,
            pendingPayments: parseFloat(row.pending_payments || 0),
            overduePayments: parseFloat(row.overdue_payments || 0),
            displayCurrency: 'DOP',
        };
    }
    catch (error) {
        console.error('Error getting financial summary:', error);
        throw error;
    }
};
exports.getFinancialSummary = getFinancialSummary;
//# sourceMappingURL=calendarService.js.map