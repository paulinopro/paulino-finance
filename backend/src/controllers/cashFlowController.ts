import { Response } from 'express';
import { query } from '../config/database';
import { resolveExchangeRateDopUsd } from '../utils/exchangeRate';
import { AuthRequest } from '../middleware/auth';
import { FREQUENCY_VALUES, normalizeFrequency, type Frequency } from '../constants/incomeExpenseTaxonomy';
import {
  dateToYmdLocal,
  getExpenseOccurrenceDatesInPeriod,
  getFixedIncomeOccurrenceDates,
  toYmdFromPgDate,
} from '../utils/dateUtils';
import {
  EXPENSE_DATE_IN_RANGE_PUNCTUAL,
  EXPENSE_RECURRING_ANNUAL,
  EXPENSE_RECURRING_MONTHLY,
  EXPENSE_RECURRING_OTHER_FREQ,
  INCOME_DATE_IN_RANGE_PUNCTUAL,
  INCOME_RECURRENT_ROWS,
} from '../constants/recurrenceSql';

/** Evita `new Date('YYYY-MM-DD')` en UTC que desplaza el día según zona horaria. */
function parseLocalDateFromYmd(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s).trim());
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
}

function expenseRowIsAnnual(row: { frequency: string | null }): boolean {
  return normalizeFrequency(row.frequency) === 'annual';
}

function toDop(amount: number, currency: string, exchangeRate: number): number {
  return currency === 'USD' ? amount * exchangeRate : amount;
}

function addToFrequencyBucket(map: Record<string, number>, frequencyKey: string, amountDop: number): void {
  map[frequencyKey] = (map[frequencyKey] || 0) + amountDop;
}

/** Canonica la clave de frecuencia para totales; recurrente sin frecuencia válida → mensual */
function frequencyKeyForIncome(rowFrequency: string | null | undefined): Frequency {
  return normalizeFrequency(rowFrequency) ?? 'monthly';
}

function frequencyKeyForExpense(
  row: { frequency: string | null },
  isAnnual: boolean
): Frequency {
  if (isAnnual) return 'annual';
  return normalizeFrequency(row.frequency) ?? 'monthly';
}

function roundFrequencyMap(m: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(m)) {
    const r = Math.round(v);
    if (r !== 0) out[k] = r;
  }
  return out;
}

/** Cuántas veces el día de corte de tarjeta cae en [start, end] (cada mes como máximo 1). */
function countCardPaymentDueOccurrencesInRange(
  start: Date,
  end: Date,
  paymentDueDay: number
): number {
  if (paymentDueDay < 1 || paymentDueDay > 31) return 0;
  const s = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const e = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (e < s) return 0;
  let count = 0;
  let y = s.getFullYear();
  let m = s.getMonth();
  const endY = e.getFullYear();
  const endM = e.getMonth();
  while (y < endY || (y === endY && m <= endM)) {
    const lastDay = new Date(y, m + 1, 0).getDate();
    const day = Math.min(paymentDueDay, lastDay);
    const due = new Date(y, m, day, 0, 0, 0, 0);
    if (due >= s && due <= e) count++;
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return count;
}

export const getCashFlow = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { startDate, endDate, period } = req.query;

    // Get user's exchange rate
    const userResult = await query(
      'SELECT exchange_rate_dop_usd FROM users WHERE id = $1',
      [userId]
    );
    const exchangeRate = resolveExchangeRateDopUsd(userResult.rows[0]?.exchange_rate_dop_usd);

    let start: Date;
    let end: Date;

    if (startDate && endDate) {
      start = parseLocalDateFromYmd(startDate as string);
      end = parseLocalDateFromYmd(endDate as string);
      end.setHours(23, 59, 59, 999);
    } else if (period === 'month') {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (period === 'year') {
      const now = new Date();
      start = new Date(now.getFullYear(), 0, 1);
      end = new Date(now.getFullYear(), 11, 31);
    } else {
      // Default: last 30 days
      end = new Date();
      start = new Date();
      start.setDate(start.getDate() - 30);
    }

    // Ingresos únicos (fecha en rango): legacy VARIABLE o recurrence non_recurrent
    const incomeResult = await query(
      `SELECT date, SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND (${INCOME_DATE_IN_RANGE_PUNCTUAL})
       GROUP BY date, currency
       ORDER BY date ASC`,
      [userId, start, end]
    );

    // Gastos únicos en rango
    const expensesResult = await query(
      `SELECT date, SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND (${EXPENSE_DATE_IN_RANGE_PUNCTUAL})
       GROUP BY date, currency
       ORDER BY date ASC`,
      [userId, start, end]
    );

    // Get accounts payable paid
    const accountsPayableResult = await query(
      `SELECT paid_date as date, SUM(amount) as total, currency
       FROM accounts_payable
       WHERE user_id = $1
         AND status = 'PAID'
         AND paid_date >= $2 AND paid_date <= $3
       GROUP BY paid_date, currency
       ORDER BY paid_date ASC`,
      [userId, start, end]
    );

    // Get accounts receivable received
    const accountsReceivableResult = await query(
      `SELECT received_date as date, SUM(amount) as total, currency
       FROM accounts_receivable
       WHERE user_id = $1
         AND status = 'RECEIVED'
         AND received_date >= $2 AND received_date <= $3
       GROUP BY received_date, currency
       ORDER BY received_date ASC`,
      [userId, start, end]
    );

    // Combine all cash flows by date
    const cashFlowByDate: { [key: string]: { income: number; expenses: number } } = {};

    // Process variable income
    incomeResult.rows.forEach((row) => {
      const date = toYmdFromPgDate(row.date);
      const amount = parseFloat(row.total);
      const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
      if (!cashFlowByDate[date]) {
        cashFlowByDate[date] = { income: 0, expenses: 0 };
      }
      cashFlowByDate[date].income += amountDop;
    });

    const fixedIncomeResult = await query(
      `SELECT amount, currency, frequency, receipt_day, date, nature, recurrence_start_date, recurrence_end_date
       FROM income
       WHERE user_id = $1 AND (${INCOME_RECURRENT_ROWS})`,
      [userId]
    );

    fixedIncomeResult.rows.forEach((row) => {
      const amount = parseFloat(row.amount);
      const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
      const frequency = row.frequency;
      
      const dates = getFixedIncomeOccurrenceDates(
        {
          frequency,
          receipt_day: row.receipt_day,
          date: row.date,
          recurrence_start_date: row.recurrence_start_date,
          recurrence_end_date: row.recurrence_end_date,
        },
        start,
        end
      );

      // Add income to each calculated date
      dates.forEach((dateStr) => {
        if (!cashFlowByDate[dateStr]) {
          cashFlowByDate[dateStr] = { income: 0, expenses: 0 };
        }
        cashFlowByDate[dateStr].income += amountDop;
      });
    });

    // Process non-recurring expenses
    expensesResult.rows.forEach((row) => {
      const date = toYmdFromPgDate(row.date);
      const amount = parseFloat(row.total);
      const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
      if (!cashFlowByDate[date]) {
        cashFlowByDate[date] = { income: 0, expenses: 0 };
      }
      cashFlowByDate[date].expenses += amountDop;
    });

    const recurringExpensesExpandedResult = await query(
      `SELECT amount, currency, frequency, payment_day, payment_month, date, recurrence_start_date, recurrence_end_date
       FROM expenses
       WHERE user_id = $1
         AND (
           (${EXPENSE_RECURRING_MONTHLY})
           OR (${EXPENSE_RECURRING_ANNUAL})
           OR (${EXPENSE_RECURRING_OTHER_FREQ})
         )`,
      [userId]
    );

    recurringExpensesExpandedResult.rows.forEach((row) => {
      const amount = parseFloat(row.amount);
      const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
      const dates = getExpenseOccurrenceDatesInPeriod(
        {
          frequency: row.frequency,
          payment_day: row.payment_day,
          payment_month: row.payment_month,
          date: row.date,
          recurrence_start_date: row.recurrence_start_date,
          recurrence_end_date: row.recurrence_end_date,
        },
        start,
        end
      );
      dates.forEach((dateStr) => {
        if (!cashFlowByDate[dateStr]) {
          cashFlowByDate[dateStr] = { income: 0, expenses: 0 };
        }
        cashFlowByDate[dateStr].expenses += amountDop;
      });
    });

    // Process accounts payable
    accountsPayableResult.rows.forEach((row) => {
      const date = toYmdFromPgDate(row.date);
      const amount = parseFloat(row.total);
      const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
      if (!cashFlowByDate[date]) {
        cashFlowByDate[date] = { income: 0, expenses: 0 };
      }
      cashFlowByDate[date].expenses += amountDop;
    });

    // Process accounts receivable
    accountsReceivableResult.rows.forEach((row) => {
      const date = toYmdFromPgDate(row.date);
      const amount = parseFloat(row.total);
      const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
      if (!cashFlowByDate[date]) {
        cashFlowByDate[date] = { income: 0, expenses: 0 };
      }
      cashFlowByDate[date].income += amountDop;
    });

    // Convert to array and calculate running balance
    const cashFlowData = [];
    let runningBalance = 0;
    
    // Get all dates in the period
    const allDates: string[] = [];
    const currentDate = new Date(start);
    while (currentDate <= end) {
      allDates.push(dateToYmdLocal(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }

    for (const dateStr of allDates) {
      const dayData = cashFlowByDate[dateStr] || { income: 0, expenses: 0 };
      const netFlow = dayData.income - dayData.expenses;
      runningBalance += netFlow;

      cashFlowData.push({
        date: dateStr,
        income: Math.round(dayData.income),
        expenses: Math.round(dayData.expenses),
        netFlow: Math.round(netFlow),
        balance: Math.round(runningBalance),
      });
    }

    const finalBalance = cashFlowData.length > 0 ? cashFlowData[cashFlowData.length - 1].balance : 0;

    const incomePunctualByNature = await query(
      `SELECT nature AS nat, currency, SUM(amount) AS total
       FROM income
       WHERE user_id = $1 AND (${INCOME_DATE_IN_RANGE_PUNCTUAL})
       GROUP BY nature, currency`,
      [userId, start, end]
    );

    let punctualIncomeFixed = 0;
    let punctualIncomeVariable = 0;
    incomePunctualByNature.rows.forEach((r: { nat: string; currency: string; total: string }) => {
      const v = parseFloat(r.total);
      const dop = toDop(v, r.currency, exchangeRate);
      if (r.nat === 'fixed') punctualIncomeFixed += dop;
      else punctualIncomeVariable += dop;
    });
    const punctualIncomeTotal = punctualIncomeFixed + punctualIncomeVariable;

    const recurrentIncomeByFrequency: Record<string, number> = {};
    fixedIncomeResult.rows.forEach((row) => {
      const amount = parseFloat(row.amount);
      const amountDop = toDop(amount, row.currency, exchangeRate);
      const frequency = row.frequency;
      const dates = getFixedIncomeOccurrenceDates(
        {
          frequency,
          receipt_day: row.receipt_day,
          date: row.date,
          recurrence_start_date: row.recurrence_start_date,
          recurrence_end_date: row.recurrence_end_date,
        },
        start,
        end
      );
      const add = amountDop * dates.length;
      const fk = frequencyKeyForIncome(row.frequency);
      addToFrequencyBucket(recurrentIncomeByFrequency, fk, add);
    });
    const recurrentIncomeByFrequencyRounded = roundFrequencyMap(recurrentIncomeByFrequency);
    const recurrentIncomeTotal = Object.values(recurrentIncomeByFrequencyRounded).reduce((a, b) => a + b, 0);

    let accountsReceivableTotal = 0;
    accountsReceivableResult.rows.forEach((row) => {
      const amount = parseFloat(row.total);
      accountsReceivableTotal += toDop(amount, row.currency, exchangeRate);
    });

    const expensePunctualByNature = await query(
      `SELECT e.nature AS nat, e.currency, SUM(e.amount) AS total
       FROM expenses e
       WHERE user_id = $1 AND (${EXPENSE_DATE_IN_RANGE_PUNCTUAL})
       GROUP BY e.nature, e.currency`,
      [userId, start, end]
    );

    let punctualExpenseFixed = 0;
    let punctualExpenseVariable = 0;
    expensePunctualByNature.rows.forEach((r: { nat: string; currency: string; total: string }) => {
      const v = parseFloat(r.total);
      const dop = toDop(v, r.currency, exchangeRate);
      if (r.nat === 'fixed') punctualExpenseFixed += dop;
      else punctualExpenseVariable += dop;
    });
    const punctualExpenseTotal = punctualExpenseFixed + punctualExpenseVariable;

    const recurrentExpenseByFrequency: Record<string, number> = {};
    recurringExpensesExpandedResult.rows.forEach((row) => {
      const amount = parseFloat(row.amount);
      const amountDop = toDop(amount, row.currency, exchangeRate);
      const dates = getExpenseOccurrenceDatesInPeriod(
        {
          frequency: row.frequency,
          payment_day: row.payment_day,
          payment_month: row.payment_month,
          date: row.date,
          recurrence_start_date: row.recurrence_start_date,
          recurrence_end_date: row.recurrence_end_date,
        },
        start,
        end
      );
      const mult = amountDop * dates.length;
      const isAnnual = expenseRowIsAnnual(row);
      const fk = frequencyKeyForExpense(row, isAnnual);
      addToFrequencyBucket(recurrentExpenseByFrequency, fk, mult);
    });
    const recurrentExpenseByFrequencyRounded = roundFrequencyMap(recurrentExpenseByFrequency);
    const annualExpensesTotal = recurrentExpenseByFrequencyRounded['annual'] || 0;
    const recurringExpensesNonAnnual = Object.entries(recurrentExpenseByFrequencyRounded)
      .filter(([k]) => k !== 'annual')
      .reduce((s, [, v]) => s + v, 0);
    const recurringExpensesMonthly = recurrentExpenseByFrequencyRounded['monthly'] || 0;
    const recurringExpensesOtherFreq = recurringExpensesNonAnnual - recurringExpensesMonthly;
    const recurrentExpenseTotalDop = Object.values(recurrentExpenseByFrequencyRounded).reduce((a, b) => a + b, 0);

    let accountsPayableTotal = 0;
    accountsPayableResult.rows.forEach((row) => {
      const amount = parseFloat(row.total);
      accountsPayableTotal += toDop(amount, row.currency, exchangeRate);
    });

    const incomeSum = punctualIncomeTotal + recurrentIncomeTotal + accountsReceivableTotal;
    const expenseSum =
      punctualExpenseTotal +
      recurringExpensesNonAnnual +
      accountsPayableTotal +
      annualExpensesTotal;
    const totalIncome = Math.round(incomeSum);
    const totalExpenses = Math.round(expenseSum);
    const netCashFlow = Math.round(incomeSum - expenseSum);

    const startYmd = dateToYmdLocal(start);
    const endYmd = dateToYmdLocal(end);

    /**
     * Compromisos alineados al mismo período [start, end] que Ingresos/Gastos:
     * - CxP: vencimientos (due_date) en el rango, saldo restante
     * - Tarjetas: pago mínimo × nº de fechas de pago (día del mes) que caen en el rango
     * - Préstamos: cuotas en amortization_schedule con due_date en rango, o next_payment en rango sin tabla
     */
    const apRemainingResult = await query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN ap.currency = 'USD' THEN GREATEST(ap.amount::numeric - COALESCE(tp.total_paid, 0), 0) * $2
           ELSE GREATEST(ap.amount::numeric - COALESCE(tp.total_paid, 0), 0)
         END
       ), 0) AS total
       FROM accounts_payable ap
       LEFT JOIN (
         SELECT account_payable_id, SUM(amount) AS total_paid
         FROM accounts_payable_payments
         GROUP BY account_payable_id
       ) tp ON tp.account_payable_id = ap.id
       WHERE ap.user_id = $1
         AND ap.status <> 'PAID'
         AND ap.due_date::date >= $3::date
         AND ap.due_date::date <= $4::date`,
      [userId, exchangeRate, startYmd, endYmd]
    );
    const pendingAccountsPayable = Math.round(parseFloat(apRemainingResult.rows[0]?.total || '0'));

    const cardRowsResult = await query(
      `SELECT payment_due_day, minimum_payment_dop, minimum_payment_usd, currency_type
       FROM credit_cards
       WHERE user_id = $1`,
      [userId]
    );
    let pendingCreditCardMinimums = 0;
    for (const row of cardRowsResult.rows) {
      const n = countCardPaymentDueOccurrencesInRange(
        start,
        end,
        parseInt(String(row.payment_due_day), 10) || 0
      );
      if (n === 0) continue;
      const minDop = parseFloat(String(row.minimum_payment_dop ?? 0)) || 0;
      const minUsd = parseFloat(String(row.minimum_payment_usd ?? 0)) || 0;
      const ct = String(row.currency_type ?? 'DOP');
      let per = 0;
      if (ct === 'DOP') {
        per = minDop;
      } else if (ct === 'USD') {
        per = minUsd * exchangeRate;
      } else {
        per = minDop + minUsd * exchangeRate;
      }
      pendingCreditCardMinimums += per * n;
    }
    pendingCreditCardMinimums = Math.round(pendingCreditCardMinimums);

    const loanAmortResult = await query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN l.currency = 'USD' THEN a.total_due::numeric * $1
           ELSE a.total_due::numeric
         END
       ), 0) AS total
       FROM amortization_schedule a
       INNER JOIN loans l ON l.id = a.loan_id
       WHERE l.user_id = $2
         AND a.due_date::date >= $3::date
         AND a.due_date::date <= $4::date
         AND a.status IN ('PENDING', 'OVERDUE')`,
      [exchangeRate, userId, startYmd, endYmd]
    );
    let pendingLoanInstallments = Math.round(
      parseFloat(String(loanAmortResult.rows[0]?.total ?? 0)) || 0
    );

    const loanNextFallback = await query(
      `SELECT l.installment_amount, l.fixed_charge, l.currency
       FROM loans l
       WHERE l.user_id = $1
         AND l.status = 'ACTIVE'
         AND l.next_payment_date IS NOT NULL
         AND l.next_payment_date::date >= $2::date
         AND l.next_payment_date::date <= $3::date
         AND NOT EXISTS (SELECT 1 FROM amortization_schedule a WHERE a.loan_id = l.id)`,
      [userId, startYmd, endYmd]
    );
    for (const row of loanNextFallback.rows) {
      const inst =
        parseFloat(String(row.installment_amount)) + parseFloat(String(row.fixed_charge || '0'));
      pendingLoanInstallments += Math.round(
        toDop(inst, String(row.currency || 'DOP'), exchangeRate)
      );
    }
    pendingLoanInstallments = Math.round(pendingLoanInstallments);

    const pendingCommitments =
      pendingAccountsPayable + pendingCreditCardMinimums + pendingLoanInstallments;
    const availableBalance = Math.round(totalIncome - totalExpenses - pendingCommitments);

    res.json({
      success: true,
      data: {
        startDate: dateToYmdLocal(start),
        endDate: dateToYmdLocal(end),
        dailyData: cashFlowData,
        summary: {
          totalIncome,
          totalExpenses,
          netCashFlow,
          finalBalance,
          pendingCommitments,
          pendingCommitmentsBreakdown: {
            accountsPayable: pendingAccountsPayable,
            creditCardMinimums: pendingCreditCardMinimums,
            loanInstallments: pendingLoanInstallments,
          },
          availableBalance,
        },
        incomeBreakdown: {
          punctual: {
            fixed: Math.round(punctualIncomeFixed),
            variable: Math.round(punctualIncomeVariable),
            total: Math.round(punctualIncomeTotal),
          },
          recurrent: {
            byFrequency: recurrentIncomeByFrequencyRounded,
            total: Math.round(recurrentIncomeTotal),
          },
          accountsReceivable: Math.round(accountsReceivableTotal),
          total: Math.round(incomeSum),
        },
        expensesBreakdown: {
          punctual: {
            fixed: Math.round(punctualExpenseFixed),
            variable: Math.round(punctualExpenseVariable),
            total: Math.round(punctualExpenseTotal),
          },
          recurring: {
            byFrequency: recurrentExpenseByFrequencyRounded,
            total: Math.round(recurrentExpenseTotalDop),
            monthly: Math.round(recurringExpensesMonthly),
            otherFrequencies: Math.round(recurringExpensesOtherFreq),
            nonAnnual: Math.round(recurringExpensesNonAnnual),
          },
          annualExpenses: Math.round(annualExpensesTotal),
          accountsPayable: Math.round(accountsPayableTotal),
          total: Math.round(expenseSum),
        },
      },
    });
  } catch (error: any) {
    console.error('Get cash flow error:', error);
    res.status(500).json({ message: 'Error fetching cash flow', error: error.message });
  }
};
