import { query } from '../config/database';
import {
  getFixedIncomeOccurrenceDates,
  getExpenseOccurrenceDatesInPeriod,
  dateToYmdLocal,
  toYmdFromPgDate,
  parseYmdLocal,
} from '../utils/dateUtils';
import { resolveExchangeRateDopUsd } from '../utils/exchangeRate';

export interface CalendarEvent {
  id: number;
  eventType: 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'INCOME' | 'EXPENSE' | 'RECURRING_EXPENSE';
  relatedId: number;
  relatedType: string;
  eventDate: string;
  title: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'RECEIVED' | 'OVERDUE' | 'CANCELLED';
  isRecurring: boolean;
  recurrencePattern?: string;
  color: string;
  notes?: string;
}

/** Alinea filas del calendario con las fechas calculadas de la serie (elimina huérfanas al acortar vigencia). */
async function syncRecurringCalendarSlotRange(
  userId: number,
  eventType: 'INCOME' | 'RECURRING_EXPENSE',
  relatedType: string,
  relatedId: number,
  rangeStartStr: string,
  rangeEndStr: string,
  datesInRange: string[],
  buildRow: (dateStr: string) => {
    title: string;
    amount: number;
    currency: string;
    status: 'PENDING' | 'PAID' | 'RECEIVED' | 'OVERDUE' | 'CANCELLED';
    color: string;
  }
): Promise<void> {
  const existing = await query(
    `SELECT id, event_date FROM calendar_events
     WHERE user_id = $1 AND event_type = $2 AND related_id = $3
       AND event_date >= $4::date AND event_date <= $5::date`,
    [userId, eventType, relatedId, rangeStartStr, rangeEndStr]
  );
  const want = new Set(datesInRange);
  for (const r of existing.rows) {
    const ed = toYmdFromPgDate(r.event_date);
    if (!want.has(ed)) {
      await query(`DELETE FROM calendar_events WHERE id = $1`, [r.id]);
    }
  }

  for (const dateStr of datesInRange) {
    const existingEvent = await query(
      `SELECT id FROM calendar_events
       WHERE user_id = $1 AND event_type = $2 AND related_id = $3 AND event_date = $4::date`,
      [userId, eventType, relatedId, dateStr]
    );
    if (existingEvent.rows.length === 0) {
      const b = buildRow(dateStr);
      await query(
        `INSERT INTO calendar_events
         (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color, is_recurring)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, true)
         ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`,
        [
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
        ]
      );
    }
  }
}

/**
 * Elimina filas en `calendar_events` ligadas a un origen borrado.
 * La tabla no referencia por FK a ingresos/gastos/préstamos/tarjetas; sin esto quedarían eventos huérfanos.
 */
export async function deleteCalendarEventsForRelated(
  userId: number,
  relatedId: number,
  eventTypes: string[]
): Promise<void> {
  if (eventTypes.length === 0) return;
  await query(
    `DELETE FROM calendar_events WHERE user_id = $1 AND related_id = $2 AND event_type = ANY($3::varchar[])`,
    [userId, relatedId, eventTypes]
  );
}

export interface CalendarEventInput {
  eventType: 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'INCOME' | 'EXPENSE' | 'RECURRING_EXPENSE';
  relatedId: number;
  relatedType: string;
  eventDate: string;
  title: string;
  amount: number;
  currency?: string;
  status?: 'PENDING' | 'PAID' | 'RECEIVED' | 'OVERDUE' | 'CANCELLED';
  isRecurring?: boolean;
  recurrencePattern?: string;
  color?: string;
  notes?: string;
}

/**
 * Get calendar events for a date range
 */
export const getCalendarEvents = async (
  userId: number,
  startDate: string,
  endDate: string,
  filters?: {
    eventTypes?: string[];
    status?: string[];
    showPaid?: boolean;
  }
): Promise<CalendarEvent[]> => {
  try {
    let queryText = `
      SELECT * FROM calendar_events
      WHERE user_id = $1 
        AND event_date >= $2 
        AND event_date <= $3
    `;
    const params: any[] = [userId, startDate, endDate];
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

    const result = await query(queryText, params);

    return result.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      relatedId: row.related_id,
      relatedType: row.related_type,
      eventDate: toYmdFromPgDate(row.event_date),
      title: row.title,
      amount: parseFloat(row.amount),
      currency: row.currency || 'DOP',
      status: row.status,
      isRecurring: row.is_recurring || false,
      recurrencePattern: row.recurrence_pattern,
      color: row.color || '#3b82f6',
      notes: row.notes,
    }));
  } catch (error) {
    console.error('Error getting calendar events:', error);
    throw error;
  }
};

/**
 * Generate calendar events from existing financial data
 */
export const generateCalendarEvents = async (userId: number, startDate: string, endDate: string): Promise<void> => {
  try {
    const start = parseYmdLocal(startDate);
    const end = parseYmdLocal(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get credit cards with payment due dates
    const cardsResult = await query(
      `SELECT id, bank_name, card_name, payment_due_day, current_debt_dop, current_debt_usd, currency_type
       FROM credit_cards
       WHERE user_id = $1`,
      [userId]
    );

    for (const card of cardsResult.rows) {
      const dueDay = card.payment_due_day;
      const currentMonth = start.getMonth();
      const currentYear = start.getFullYear();
      
      // Generate events for each month in range
      let checkDate = new Date(currentYear, currentMonth, dueDay);
      while (checkDate <= end) {
        const eventDate = dateToYmdLocal(checkDate);
        const isOverdue = checkDate < today;
        
        const debtAmount = card.currency_type === 'USD' 
          ? parseFloat(card.current_debt_usd || 0)
          : parseFloat(card.current_debt_dop || 0);
        const currency = card.currency_type === 'USD' ? 'USD' : 'DOP';

        // Check if event already exists
        const existingEvent = await query(
          `SELECT id FROM calendar_events 
           WHERE user_id = $1 AND event_type = 'CARD_PAYMENT' 
           AND related_id = $2 AND event_date = $3`,
          [userId, card.id, eventDate]
        );

        if (existingEvent.rows.length === 0 && debtAmount > 0) {
          await query(
            `INSERT INTO calendar_events 
             (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color, is_recurring)
             VALUES ($1, 'CARD_PAYMENT', $2, 'CARD', $3, $4, $5, $6, $7, $8, true)
             ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`,
            [
              userId,
              card.id,
              eventDate,
              `Pago ${card.card_name} - ${card.bank_name}`,
              debtAmount,
              currency,
              isOverdue ? 'OVERDUE' : 'PENDING',
              isOverdue ? '#ef4444' : '#f59e0b',
            ]
          );
        }

        // Move to next month
        checkDate.setMonth(checkDate.getMonth() + 1);
      }
    }

    // Get loans with payment dates
    const loansResult = await query(
      `SELECT l.id, l.loan_name, l.bank_name, l.start_date, l.payment_day, 
              l.installment_amount, l.currency, l.total_installments, l.paid_installments
       FROM loans l
       WHERE l.user_id = $1 AND l.status = 'ACTIVE'`,
      [userId]
    );

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
          const eventDate = dateToYmdLocal(paymentDate);
          const isOverdue = paymentDate < today;

          // Check if event already exists
          const existingEvent = await query(
            `SELECT id FROM calendar_events 
             WHERE user_id = $1 AND event_type = 'LOAN_PAYMENT' 
             AND related_id = $2 AND event_date = $3`,
            [userId, loan.id, eventDate]
          );

          if (existingEvent.rows.length === 0) {
            await query(
              `INSERT INTO calendar_events 
               (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color, is_recurring)
               VALUES ($1, 'LOAN_PAYMENT', $2, 'LOAN', $3, $4, $5, $6, $7, $8, true)
               ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`,
              [
                userId,
                loan.id,
                eventDate,
                `Cuota ${i} - ${loan.loan_name}`,
                installmentAmount,
                loan.currency,
                isOverdue ? 'OVERDUE' : 'PENDING',
                isOverdue ? '#ef4444' : '#f59e0b',
              ]
            );
          }
        }
      }
    }

    // Get income events
    const incomeResult = await query(
      `SELECT id, description, amount, currency, date, frequency, receipt_day, recurrence_type,
              recurrence_start_date, recurrence_end_date
       FROM income
       WHERE user_id = $1 AND (date >= $2 OR recurrence_type = 'recurrent')`,
      [userId, startDate]
    );

    for (const income of incomeResult.rows) {
      if (income.recurrence_type === 'recurrent' && income.frequency) {
        const dates = getFixedIncomeOccurrenceDates(
          {
            frequency: income.frequency,
            receipt_day: income.receipt_day,
            date: income.date,
            recurrence_start_date: income.recurrence_start_date,
            recurrence_end_date: income.recurrence_end_date,
          },
          start,
          end
        );

        await syncRecurringCalendarSlotRange(
          userId,
          'INCOME',
          'INCOME',
          income.id,
          startDate,
          endDate,
          dates,
          (dateStr) => {
            const eventDate = new Date(dateStr + 'T12:00:00');
            const isReceived = eventDate < today;
            return {
              title: income.description,
              amount: parseFloat(income.amount),
              currency: income.currency,
              status: isReceived ? 'RECEIVED' : 'PENDING',
              color: '#10b981',
            };
          }
        );
      } else if (income.date) {
        // One-time income
        const eventDate = toYmdFromPgDate(income.date);
        if (eventDate >= startDate && eventDate <= endDate) {
          const isReceived = new Date(income.date) < today;

          const existingEvent = await query(
            `SELECT id FROM calendar_events 
             WHERE user_id = $1 AND event_type = 'INCOME' 
             AND related_id = $2 AND event_date = $3`,
            [userId, income.id, eventDate]
          );

          if (existingEvent.rows.length === 0) {
            await query(
              `INSERT INTO calendar_events 
               (user_id, event_type, related_id, related_type, event_date, title, amount, currency, status, color)
               VALUES ($1, 'INCOME', $2, 'INCOME', $3, $4, $5, $6, $7, $8)
               ON CONFLICT (user_id, event_type, related_id, event_date) DO NOTHING`,
              [
                userId,
                income.id,
                eventDate,
                income.description,
                parseFloat(income.amount),
                income.currency,
                isReceived ? 'RECEIVED' : 'PENDING',
                '#10b981',
              ]
            );
          }
        }
      }
    }

    // Gastos recurrentes (todas las frecuencias con la misma expansión que flujo de caja)
    const expensesResult = await query(
      `SELECT id, description, amount, currency, payment_day, payment_month, frequency, recurrence_type, date,
              recurrence_start_date, recurrence_end_date
       FROM expenses
       WHERE user_id = $1 AND recurrence_type = 'recurrent'`,
      [userId]
    );

    for (const expense of expensesResult.rows) {
      const dates = getExpenseOccurrenceDatesInPeriod(
        {
          frequency: expense.frequency,
          payment_day: expense.payment_day,
          payment_month: expense.payment_month,
          date: expense.date,
          recurrence_start_date: expense.recurrence_start_date,
          recurrence_end_date: expense.recurrence_end_date,
        },
        start,
        end
      );

      await syncRecurringCalendarSlotRange(
        userId,
        'RECURRING_EXPENSE',
        'EXPENSE',
        expense.id,
        startDate,
        endDate,
        dates,
        (dateStr) => {
          const eventDate = new Date(dateStr + 'T12:00:00');
          const isOverdue = eventDate < today;
          return {
            title: expense.description,
            amount: parseFloat(expense.amount),
            currency: expense.currency,
            status: isOverdue ? 'OVERDUE' : 'PENDING',
            color: isOverdue ? '#ef4444' : '#f59e0b',
          };
        }
      );
    }
  } catch (error) {
    console.error('Error generating calendar events:', error);
    throw error;
  }
};

/**
 * Update event status
 */
export const updateEventStatus = async (
  userId: number,
  eventId: number,
  status: 'PENDING' | 'PAID' | 'RECEIVED' | 'OVERDUE' | 'CANCELLED'
): Promise<CalendarEvent | null> => {
  try {
    const result = await query(
      `UPDATE calendar_events 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [status, eventId, userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      eventType: row.event_type,
      relatedId: row.related_id,
      relatedType: row.related_type,
      eventDate: toYmdFromPgDate(row.event_date),
      title: row.title,
      amount: parseFloat(row.amount),
      currency: row.currency || 'DOP',
      status: row.status,
      isRecurring: row.is_recurring || false,
      recurrencePattern: row.recurrence_pattern,
      color: row.color || '#3b82f6',
      notes: row.notes,
    };
  } catch (error) {
    console.error('Error updating event status:', error);
    throw error;
  }
};

/**
 * Get financial summary for a date range
 */
export const getFinancialSummary = async (
  userId: number,
  startDate: string,
  endDate: string
): Promise<{
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  pendingPayments: number;
  overduePayments: number;
  /** Todos los totales expresados en DOP (USD × tasa del usuario). */
  displayCurrency: 'DOP';
}> => {
  try {
    const userRate = await query('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
    const rate = resolveExchangeRateDopUsd(userRate.rows[0]?.exchange_rate_dop_usd);

    const toDop = `CASE WHEN UPPER(TRIM(COALESCE(currency, 'DOP'))) = 'USD' THEN amount * $4::numeric ELSE amount END`;

    const result = await query(
      `SELECT 
        COALESCE(SUM(CASE WHEN event_type IN ('INCOME') AND status = 'RECEIVED' THEN ${toDop} ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN event_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'EXPENSE', 'RECURRING_EXPENSE') AND status = 'PAID' THEN ${toDop} ELSE 0 END), 0) as total_expenses,
        COALESCE(SUM(CASE WHEN event_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'EXPENSE', 'RECURRING_EXPENSE') AND status = 'PENDING' AND event_date >= CURRENT_DATE THEN ${toDop} ELSE 0 END), 0) as pending_payments,
        COALESCE(SUM(CASE WHEN event_type IN ('CARD_PAYMENT', 'LOAN_PAYMENT', 'EXPENSE', 'RECURRING_EXPENSE') AND (status = 'OVERDUE' OR (status = 'PENDING' AND event_date < CURRENT_DATE)) THEN ${toDop} ELSE 0 END), 0) as overdue_payments
       FROM calendar_events
       WHERE user_id = $1 AND event_date >= $2::date AND event_date <= $3::date`,
      [userId, startDate, endDate, rate]
    );

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
  } catch (error) {
    console.error('Error getting financial summary:', error);
    throw error;
  }
};
