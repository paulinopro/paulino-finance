"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFinancialSummary = exports.updateEventStatus = exports.generateCalendarEvents = exports.getCalendarEvents = void 0;
const database_1 = require("../config/database");
const dateUtils_1 = require("../utils/dateUtils");
/**
 * Get calendar events for a date range
 */
const getCalendarEvents = async (userId, startDate, endDate, filters) => {
    try {
        let queryText = `
      SELECT * FROM calendar_events
      WHERE user_id = $1 
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
        const start = new Date(startDate);
        const end = new Date(endDate);
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
                if (existingEvent.rows.length === 0 && debtAmount > 0) {
                    await (0, database_1.query)(`INSERT INTO calendar_events 
             (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color, is_recurring)
             VALUES ($1, 'CARD_PAYMENT', $2, 'CARD', $3, $4, $5, $6, $7, $8, true)
             ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`, [
                        userId,
                        card.id,
                        eventDate,
                        `Pago ${card.card_name} - ${card.bank_name}`,
                        debtAmount,
                        currency,
                        isOverdue ? 'OVERDUE' : 'PENDING',
                        isOverdue ? '#ef4444' : '#f59e0b',
                    ]);
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
                    if (existingEvent.rows.length === 0) {
                        await (0, database_1.query)(`INSERT INTO calendar_events 
               (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color, is_recurring)
               VALUES ($1, 'LOAN_PAYMENT', $2, 'LOAN', $3, $4, $5, $6, $7, $8, true)
               ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`, [
                            userId,
                            loan.id,
                            eventDate,
                            `Cuota ${i} - ${loan.loan_name}`,
                            installmentAmount,
                            loan.currency,
                            isOverdue ? 'OVERDUE' : 'PENDING',
                            isOverdue ? '#ef4444' : '#f59e0b',
                        ]);
                    }
                }
            }
        }
        // Get income events
        const incomeResult = await (0, database_1.query)(`SELECT id, description, amount, currency, date, frequency, receipt_day, recurrence_type
       FROM income
       WHERE user_id = $1 AND (date >= $2 OR recurrence_type = 'recurrent')`, [userId, startDate]);
        for (const income of incomeResult.rows) {
            if (income.recurrence_type === 'recurrent' && income.frequency) {
                // Recurring income
                let dates = [];
                dates = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({
                    frequency: income.frequency,
                    receipt_day: income.receipt_day,
                    date: income.date,
                }, start, end);
                for (const dateStr of dates) {
                    const eventDate = new Date(dateStr);
                    const isReceived = eventDate < today;
                    const existingEvent = await (0, database_1.query)(`SELECT id FROM calendar_events 
             WHERE user_id = $1 AND event_type = 'INCOME' 
             AND related_id = $2 AND event_date = $3`, [userId, income.id, dateStr]);
                    if (existingEvent.rows.length === 0) {
                        await (0, database_1.query)(`INSERT INTO calendar_events 
               (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color, is_recurring)
               VALUES ($1, 'INCOME', $2, 'INCOME', $3, $4, $5, $6, $7, $8, true)
               ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`, [
                            userId,
                            income.id,
                            dateStr,
                            income.description,
                            parseFloat(income.amount),
                            income.currency,
                            isReceived ? 'RECEIVED' : 'PENDING',
                            '#10b981',
                        ]);
                    }
                }
            }
            else if (income.date) {
                // One-time income
                const eventDate = (0, dateUtils_1.toYmdFromPgDate)(income.date);
                if (eventDate >= startDate && eventDate <= endDate) {
                    const isReceived = new Date(income.date) < today;
                    const existingEvent = await (0, database_1.query)(`SELECT id FROM calendar_events 
             WHERE user_id = $1 AND event_type = 'INCOME' 
             AND related_id = $2 AND event_date = $3`, [userId, income.id, eventDate]);
                    if (existingEvent.rows.length === 0) {
                        await (0, database_1.query)(`INSERT INTO calendar_events 
               (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color)
               VALUES ($1, 'INCOME', $2, 'INCOME', $3, $4, $5, $6, $7, $8)
               ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`, [
                            userId,
                            income.id,
                            eventDate,
                            income.description,
                            parseFloat(income.amount),
                            income.currency,
                            isReceived ? 'RECEIVED' : 'PENDING',
                            '#10b981',
                        ]);
                    }
                }
            }
        }
        // Get recurring expenses
        const expensesResult = await (0, database_1.query)(`SELECT id, description, amount, currency, payment_day, frequency, recurrence_type
       FROM expenses
       WHERE user_id = $1
         AND recurrence_type = 'recurrent'
         AND LOWER(TRIM(COALESCE(frequency, ''))) = 'monthly'`, [userId]);
        for (const expense of expensesResult.rows) {
            if (expense.payment_day) {
                let checkDate = new Date(start);
                const paymentDay = expense.payment_day;
                while (checkDate <= end) {
                    const eventDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), paymentDay);
                    if (eventDate >= start && eventDate <= end) {
                        const dateStr = (0, dateUtils_1.dateToYmdLocal)(eventDate);
                        const isOverdue = eventDate < today;
                        const existingEvent = await (0, database_1.query)(`SELECT id FROM calendar_events 
               WHERE user_id = $1 AND event_type = 'RECURRING_EXPENSE' 
               AND related_id = $2 AND event_date = $3`, [userId, expense.id, dateStr]);
                        if (existingEvent.rows.length === 0) {
                            await (0, database_1.query)(`INSERT INTO calendar_events 
                 (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color, is_recurring)
                 VALUES ($1, 'RECURRING_EXPENSE', $2, 'EXPENSE', $3, $4, $5, $6, $7, $8, true)
                 ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`, [
                                userId,
                                expense.id,
                                dateStr,
                                expense.description,
                                parseFloat(expense.amount),
                                expense.currency,
                                isOverdue ? 'OVERDUE' : 'PENDING',
                                isOverdue ? '#ef4444' : '#f59e0b',
                            ]);
                        }
                    }
                    checkDate.setMonth(checkDate.getMonth() + 1);
                }
            }
        }
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
       WHERE id = $2 AND user_id = $3
       RETURNING *`, [status, eventId, userId]);
        if (result.rows.length === 0) {
            return null;
        }
        const row = result.rows[0];
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
        const result = await (0, database_1.query)(`SELECT 
        COALESCE(SUM(CASE WHEN event_type IN ('INCOME') AND status = 'RECEIVED' THEN amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN event_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'EXPENSE', 'RECURRING_EXPENSE') AND status = 'PAID' THEN amount ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN event_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'EXPENSE', 'RECURRING_EXPENSE') AND status = 'PENDING' AND event_date >= CURRENT_DATE THEN amount ELSE 0 END), 0) as pending_payments,
        COALESCE(SUM(CASE WHEN event_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'EXPENSE', 'RECURRING_EXPENSE') AND (status = 'OVERDUE' OR (status = 'PENDING' AND event_date < CURRENT_DATE)) THEN amount ELSE 0 END), 0) as overdue_payments
       FROM calendar_events
       WHERE user_id = $1 AND event_date >= $2 AND event_date <= $3`, [userId, startDate, endDate]);
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
        };
    }
    catch (error) {
        console.error('Error getting financial summary:', error);
        throw error;
    }
};
exports.getFinancialSummary = getFinancialSummary;
//# sourceMappingURL=calendarService.js.map