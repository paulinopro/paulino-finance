import { Response } from 'express';
import { getClient, query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { amountToPrimary, getConversionContextForUser } from '../services/userCurrencyConversion';
import { applyBalanceDelta } from '../services/accountBalance';
import {
  validateIncomeUpdateForLinkedReceivable,
  syncReceivablePaymentFromIncome,
  deleteReceivablePaymentByIncomeId,
} from '../services/accountsPaymentLinkSync';
import { FREQUENCY_VALUES, normalizeFrequency, type Nature, type RecurrenceType } from '../constants/incomeExpenseTaxonomy';
import { parseRecurrenceBoundaryFromBody } from '../utils/recurrenceBoundary';
import { deleteCalendarEventsForRelated } from '../services/calendarService';
import { toYmdFromPgDate } from '../utils/dateUtils';
import {
  getUserCurrencyPair,
  isCurrencyInUserPair,
  validateLedgerCurrencyForUser,
} from '../utils/userCurrencyPair';
import {
  deleteIncomePeriodAmount,
  getIncomePeriodAmount,
  upsertIncomePeriodAmount,
} from '../services/recurringPeriodAmounts';

function isMonthlyRecurringIncome(row: {
  recurrence_type?: string;
  frequency?: string | null;
}): boolean {
  return row.recurrence_type === 'recurrent' && normalizeFrequency(row.frequency ?? undefined) === 'monthly';
}

function amountForVariableMonthlyIncomeRow(
  row: { nature?: string; amount: unknown; period_amount?: unknown | null },
  receivedThisMonth: boolean,
  monthlyRec: boolean
): number {
  const base = parseFloat(String(row.amount));
  if (!monthlyRec || row.nature !== 'variable' || !receivedThisMonth) return base;
  const pv = row.period_amount;
  if (pv != null && pv !== '') {
    const n = parseFloat(String(pv));
    if (!Number.isNaN(n)) return n;
  }
  return base;
}

/** Estado «recibido este mes» para recurrentes mensuales con tracking; compatibilidad si last_received es null. */
function incomeDisplayedReceived(
  row: {
    is_received: boolean;
    last_received_month: number | null;
    last_received_year: number | null;
    recurrence_type: string;
    frequency: string | null;
  },
  currentMonth: number,
  currentYear: number
): boolean {
  if (!isMonthlyRecurringIncome(row)) {
    return Boolean(row.is_received);
  }
  if (row.last_received_month != null && row.last_received_year != null) {
    if (row.last_received_month !== currentMonth || row.last_received_year !== currentYear) {
      return false;
    }
    return Boolean(row.is_received);
  }
  return Boolean(row.is_received);
}

/** Ingresos recurrentes: valida frecuencia y campos de calendario (independiente de nature fijo/variable). */
function validateRecurrentIncomeSchedule(
  frequency: string | null | undefined,
  receiptDay: unknown,
  date: unknown
): string | null {
  const fq = normalizeFrequency(frequency);
  if (!fq || !FREQUENCY_VALUES.includes(fq)) {
    return 'Frecuencia no válida para ingreso recurrente';
  }
  if (fq === 'monthly') {
    if (receiptDay === undefined || receiptDay === null || receiptDay === '') {
      return 'Indique el día de recepción (mensual)';
    }
    return null;
  }
  if (fq === 'semi_monthly') {
    return null;
  }
  const needsDate =
    fq === 'daily' ||
    fq === 'weekly' ||
    fq === 'biweekly' ||
    fq === 'annual' ||
    fq === 'quarterly' ||
    fq === 'semi_annual';
  if (needsDate && (date === undefined || date === null || date === '')) {
    return 'Indique la fecha de inicio o referencia para esta frecuencia';
  }
  return null;
}

function resolveIncomeTaxonomy(body: Record<string, unknown>): {
  nature: Nature;
  recurrenceType: RecurrenceType;
} | null {
  if (body.nature !== 'fixed' && body.nature !== 'variable') return null;
  const nature = body.nature as Nature;
  const rtFromBody = body.recurrenceType ?? body.recurrence_type;
  if (rtFromBody !== 'recurrent' && rtFromBody !== 'non_recurrent') return null;
  const recurrenceType = rtFromBody as RecurrenceType;
  return {
    nature,
    recurrenceType,
  };
}

function parseBankAccountIdFromBody(
  body: Record<string, unknown>,
  mode: 'create' | 'update',
  previous: number | null
): number | null {
  if (!('bankAccountId' in body)) {
    return mode === 'create' ? null : previous;
  }
  const v = body.bankAccountId;
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

export const getIncome = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { search, nature, recurrenceType, frequency, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [userId];
    let paramIndex = 2;

    if (search) {
      whereClause += ` AND description ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    const natureStr = nature != null && String(nature).trim() !== '' ? String(nature).trim() : '';
    const recurrenceStr =
      recurrenceType != null && String(recurrenceType).trim() !== '' ? String(recurrenceType).trim() : '';
    const frequencyStr =
      frequency != null && String(frequency).trim() !== '' ? String(frequency).trim().toLowerCase() : '';

    if (natureStr === 'fixed' || natureStr === 'variable') {
      whereClause += ` AND nature = $${paramIndex}`;
      params.push(natureStr);
      paramIndex++;
    }

    if (recurrenceStr === 'recurrent' || recurrenceStr === 'non_recurrent') {
      whereClause += ` AND recurrence_type = $${paramIndex}`;
      params.push(recurrenceStr);
      paramIndex++;
    }

    if (frequencyStr) {
      whereClause += ` AND LOWER(TRIM(COALESCE(frequency, ''))) = $${paramIndex}`;
      params.push(frequencyStr);
      paramIndex++;
    }

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM income ${whereClause}`;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Save params before adding limit/offset for totals query
    const paramsBeforePagination = [...params];

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    // Get paginated results
    let queryText = `
      SELECT id, description, amount, currency, nature, recurrence_type, frequency,
              receipt_day, date, bank_account_id, is_received,
              last_received_month, last_received_year,
              recurrence_start_date, recurrence_end_date, created_at, updated_at,
              (SELECT ipa.amount FROM income_period_amounts ipa
               WHERE ipa.income_id = income.id AND ipa.user_id = income.user_id
                 AND ipa.year = ${currentYear} AND ipa.month = ${currentMonth}
               LIMIT 1) AS period_amount
       FROM income
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limitNum, offset);

    const result = await query(queryText, params);

    const income = result.rows.map((row) => {
      const isReceived = incomeDisplayedReceived(
        {
          is_received: Boolean(row.is_received),
          last_received_month: row.last_received_month,
          last_received_year: row.last_received_year,
          recurrence_type: row.recurrence_type,
          frequency: row.frequency,
        },
        currentMonth,
        currentYear
      );
      const monthlyRec = isMonthlyRecurringIncome(row);
      return {
        id: row.id,
        description: row.description,
        amount: amountForVariableMonthlyIncomeRow(row, isReceived, monthlyRec),
        currency: row.currency,
        nature: row.nature,
        recurrenceType: row.recurrence_type,
        frequency: row.frequency,
        receiptDay: row.receipt_day,
        date: row.date,
        bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
        isReceived,
        recurrenceStartDate: row.recurrence_start_date ? toYmdFromPgDate(row.recurrence_start_date) : null,
        recurrenceEndDate: row.recurrence_end_date ? toYmdFromPgDate(row.recurrence_end_date) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    // Calculate totals for all income (not just current page)
    // Use params without limit and offset
    const allIncomeResult = await query(
      `SELECT amount, currency FROM income ${whereClause}`,
      paramsBeforePagination
    );
    const ctx = await getConversionContextForUser(userId);
    const totalsByCurrency: Record<string, number> = {};
    let totalInPrimary = 0;
    for (const row of allIncomeResult.rows) {
      const amt = parseFloat(row.amount);
      const c = String(row.currency || 'DOP').toUpperCase();
      totalsByCurrency[c] = (totalsByCurrency[c] || 0) + amt;
      totalInPrimary += amountToPrimary(amt, c, ctx);
    }
    const totalPrimary = totalsByCurrency[ctx.pair.primary] ?? 0;
    const totalSecondary = totalsByCurrency[ctx.pair.secondary] ?? 0;

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      income,
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
        totalIncome: total,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('Get income error:', error);
    res.status(500).json({ message: 'Error fetching income', error: error.message });
  }
};

export const getIncomeItem = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const incomeId = parseInt(req.params.id);

    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const result = await query(
      `SELECT id, description, amount, currency, nature, recurrence_type, frequency,
              receipt_day, date, bank_account_id, is_received,
              last_received_month, last_received_year,
              recurrence_start_date, recurrence_end_date, created_at, updated_at,
              (SELECT ipa.amount FROM income_period_amounts ipa
               WHERE ipa.income_id = income.id AND ipa.user_id = income.user_id
                 AND ipa.year = ${currentYear} AND ipa.month = ${currentMonth}
               LIMIT 1) AS period_amount
       FROM income
       WHERE id = $1 AND user_id = $2`,
      [incomeId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Income item not found' });
    }

    const row = result.rows[0];
    const isReceived = incomeDisplayedReceived(
      {
        is_received: Boolean(row.is_received),
        last_received_month: row.last_received_month,
        last_received_year: row.last_received_year,
        recurrence_type: row.recurrence_type,
        frequency: row.frequency,
      },
      currentMonth,
      currentYear
    );
    const monthlyRec = isMonthlyRecurringIncome(row);
    res.json({
      success: true,
      income: {
        id: row.id,
        description: row.description,
        amount: amountForVariableMonthlyIncomeRow(row, isReceived, monthlyRec),
        currency: row.currency,
        nature: row.nature,
        recurrenceType: row.recurrence_type,
        frequency: row.frequency,
        receiptDay: row.receipt_day,
        date: row.date,
        bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
        isReceived,
        recurrenceStartDate: row.recurrence_start_date ? toYmdFromPgDate(row.recurrence_start_date) : null,
        recurrenceEndDate: row.recurrence_end_date ? toYmdFromPgDate(row.recurrence_end_date) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Get income item error:', error);
    res.status(500).json({ message: 'Error fetching income item', error: error.message });
  }
};

export const createIncome = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { description, amount, currency, frequency, receiptDay, date, isReceived } = req.body;

  if (!description || !amount) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const tax = resolveIncomeTaxonomy(req.body);
  if (!tax) {
    return res.status(400).json({
      message: 'Se requieren nature (fixed|variable) y recurrenceType (recurrent|non_recurrent)',
    });
  }
  const { nature, recurrenceType } = tax;
  const freqNorm = frequency != null && frequency !== '' ? normalizeFrequency(String(frequency)) : null;
  if (frequency && !freqNorm) {
    return res.status(400).json({ message: 'Frecuencia no válida' });
  }

  if (recurrenceType === 'non_recurrent') {
    if (freqNorm) {
      return res.status(400).json({ message: 'No indique frecuencia para un ingreso único' });
    }
    if (!date) {
      return res.status(400).json({ message: 'Indique la fecha para un ingreso puntual' });
    }
  } else {
    if (!freqNorm) {
      return res.status(400).json({ message: 'Indique la frecuencia para un ingreso recurrente' });
    }
    const err = validateRecurrentIncomeSchedule(String(frequency), receiptDay, date);
    if (err) {
      return res.status(400).json({ message: err });
    }
  }

  const pair = await getUserCurrencyPair(userId);
  const cur =
    currency != null && String(currency).trim() !== ''
      ? String(currency).trim().toUpperCase()
      : pair.primary;
  if (!isCurrencyInUserPair(pair, cur)) {
    return res.status(400).json({
      message: 'La moneda debe ser la principal o la secundaria de tu perfil (Configuración).',
    });
  }
  const bankAccountId = parseBankAccountIdFromBody(req.body, 'create', null);
  if (bankAccountId) {
    const ledErr = validateLedgerCurrencyForUser(pair, cur);
    if (ledErr) {
      return res.status(400).json({ message: ledErr });
    }
  }
  const amt = parseFloat(String(amount));
  const initialReceived = typeof isReceived === 'boolean' ? isReceived : false;
  const ledgerIncomeDesc = `Ingreso: ${String(description)}`;
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const monthlyReceivedInitial =
    initialReceived && recurrenceType === 'recurrent' && freqNorm === 'monthly';

  let recurrenceStartDate: string | null = null;
  let recurrenceEndDate: string | null = null;
  if (recurrenceType === 'recurrent') {
    const rb = parseRecurrenceBoundaryFromBody(req.body as Record<string, unknown>);
    if (rb.error) {
      return res.status(400).json({ message: rb.error });
    }
    recurrenceStartDate = rb.start;
    recurrenceEndDate = rb.end;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO income 
       (user_id, description, amount, currency, nature, recurrence_type, frequency, receipt_day, date, bank_account_id, is_received, recurrence_start_date, recurrence_end_date, last_received_month, last_received_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, description, amount, currency, nature, recurrence_type, frequency,
                 receipt_day, date, bank_account_id, is_received, recurrence_start_date, recurrence_end_date, created_at, updated_at`,
      [
        userId,
        description,
        amt,
        cur,
        nature,
        recurrenceType,
        recurrenceType === 'recurrent' ? freqNorm : null,
        recurrenceType === 'recurrent' && freqNorm === 'monthly' ? receiptDay ?? null : null,
        date || null,
        bankAccountId,
        initialReceived,
        recurrenceType === 'recurrent' ? recurrenceStartDate : null,
        recurrenceType === 'recurrent' ? recurrenceEndDate : null,
        monthlyReceivedInitial ? currentMonth : null,
        monthlyReceivedInitial ? currentYear : null,
      ]
    );

    const newId = result.rows[0].id as number;
    if (monthlyReceivedInitial && nature === 'variable') {
      await upsertIncomePeriodAmount(client, userId, newId, currentYear, currentMonth, amt);
    }

    if (initialReceived && bankAccountId) {
      try {
        await applyBalanceDelta(userId, bankAccountId, cur, amt, client, {
          description: ledgerIncomeDesc,
        });
      } catch (e: any) {
        if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message:
              e.message === 'CURRENCY_MISMATCH'
                ? 'La moneda no coincide con la cuenta seleccionada'
                : 'Cuenta no encontrada',
          });
        }
        throw e;
      }
    }

    await client.query('COMMIT');

    const row = result.rows[0];
    res.status(201).json({
      success: true,
      message: 'Income created successfully',
      income: {
        id: row.id,
        description: row.description,
        amount: parseFloat(row.amount),
        currency: row.currency,
        nature: row.nature,
        recurrenceType: row.recurrence_type,
        frequency: row.frequency,
        receiptDay: row.receipt_day,
        date: row.date,
        bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
        isReceived: Boolean(row.is_received),
        recurrenceStartDate: row.recurrence_start_date ? toYmdFromPgDate(row.recurrence_start_date) : null,
        recurrenceEndDate: row.recurrence_end_date ? toYmdFromPgDate(row.recurrence_end_date) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Create income error:', error);
    res.status(500).json({ message: 'Error creating income', error: error.message });
  } finally {
    client.release();
  }
};

export const updateIncome = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const incomeId = parseInt(req.params.id);
  const { description, amount, currency, frequency, receiptDay, date } = req.body;

  const oldResult = await query(
    `SELECT id, description, amount, currency, nature, recurrence_type, frequency, receipt_day, date, bank_account_id, is_received,
            recurrence_start_date, recurrence_end_date
     FROM income WHERE id = $1 AND user_id = $2`,
    [incomeId, userId]
  );

  if (oldResult.rows.length === 0) {
    return res.status(404).json({ message: 'Income item not found' });
  }

  const old = oldResult.rows[0];
  const receivableErr = await validateIncomeUpdateForLinkedReceivable(userId, incomeId, {
    amount,
    currency,
  });
  if (receivableErr) {
    return res.status(400).json({ message: receivableErr });
  }

  const newDesc = description !== undefined ? description : old.description;
  const newAmount = amount !== undefined ? parseFloat(String(amount)) : parseFloat(old.amount);
  const newCurrency = currency !== undefined ? currency : old.currency;
  const pair = await getUserCurrencyPair(userId);
  const curNorm = String(newCurrency).trim().toUpperCase();
  if (!isCurrencyInUserPair(pair, curNorm)) {
    return res.status(400).json({
      message: 'La moneda debe ser la principal o la secundaria de tu perfil (Configuración).',
    });
  }
  let newNature: Nature =
    req.body.nature !== undefined ? (req.body.nature as Nature) : (old.nature as Nature);
  let newRecurrence: RecurrenceType =
    req.body.recurrenceType !== undefined
      ? (req.body.recurrenceType as RecurrenceType)
      : req.body.recurrence_type !== undefined
        ? (req.body.recurrence_type as RecurrenceType)
        : (old.recurrence_type as RecurrenceType);
  let newFrequencyStored: string | null = null;
  if (newRecurrence === 'recurrent') {
    newFrequencyStored =
      frequency !== undefined
        ? frequency && String(frequency).trim() !== ''
          ? normalizeFrequency(String(frequency))
          : null
        : old.frequency
          ? normalizeFrequency(String(old.frequency))
          : null;
    if (frequency !== undefined && frequency !== '' && !newFrequencyStored) {
      return res.status(400).json({ message: 'Frecuencia no válida' });
    }
  }
  const newReceiptDay = receiptDay !== undefined ? receiptDay : old.receipt_day;
  const newDate = date !== undefined ? date : old.date;
  const newBankId = parseBankAccountIdFromBody(req.body, 'update', old.bank_account_id);

  if (newBankId) {
    const ledErr = validateLedgerCurrencyForUser(pair, curNorm);
    if (ledErr) {
      return res.status(400).json({ message: ledErr });
    }
  }

  const receivableLink = await query(
    `SELECT 1 FROM accounts_receivable_payments WHERE income_id = $1 AND user_id = $2 LIMIT 1`,
    [incomeId, userId]
  );
  const isLinkedReceivable = receivableLink.rows.length > 0;
  if (isLinkedReceivable && req.body.isReceived === false) {
    return res.status(400).json({
      message:
        'Este ingreso está vinculado a una cuenta por cobrar; no se puede marcar como pendiente.',
    });
  }
  const newIsReceived = isLinkedReceivable
    ? true
    : req.body.isReceived !== undefined
      ? Boolean(req.body.isReceived)
      : Boolean(old.is_received);

  if (newRecurrence === 'recurrent') {
    const err = validateRecurrentIncomeSchedule(
      newFrequencyStored || undefined,
      newReceiptDay,
      newDate
    );
    if (err) {
      return res.status(400).json({ message: err });
    }
  } else if (!newDate) {
    return res.status(400).json({ message: 'Indique la fecha para un ingreso puntual' });
  }

  const receiptDayForDb =
    newRecurrence === 'recurrent' && newFrequencyStored === 'monthly' ? newReceiptDay : null;

  let recurrenceStartForDb: string | null = null;
  let recurrenceEndForDb: string | null = null;
  if (newRecurrence === 'recurrent') {
    const rb = parseRecurrenceBoundaryFromBody(req.body as Record<string, unknown>);
    if (rb.error) {
      return res.status(400).json({ message: rb.error });
    }
    recurrenceStartForDb = rb.start;
    recurrenceEndForDb = rb.end;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (old.bank_account_id && old.is_received) {
      await applyBalanceDelta(
        userId,
        old.bank_account_id,
        old.currency,
        -parseFloat(old.amount),
        client,
        { description: `Reversión: «${old.description}»` }
      );
    }

    const result = await client.query(
      `UPDATE income
       SET description = $1,
           amount = $2,
           currency = $3,
           nature = $4,
           recurrence_type = $5,
           frequency = $6,
           receipt_day = $7,
           date = $8,
           bank_account_id = $9,
           is_received = $10,
           recurrence_start_date = $11,
           recurrence_end_date = $12,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $13 AND user_id = $14
       RETURNING id, description, amount, currency, nature, recurrence_type, frequency,
                 receipt_day, date, bank_account_id, is_received, recurrence_start_date, recurrence_end_date, created_at, updated_at`,
      [
        newDesc,
        newAmount,
        newCurrency,
        newNature,
        newRecurrence,
        newRecurrence === 'recurrent' ? newFrequencyStored : null,
        receiptDayForDb,
        newDate,
        newBankId,
        newIsReceived,
        newRecurrence === 'recurrent' ? recurrenceStartForDb : null,
        newRecurrence === 'recurrent' ? recurrenceEndForDb : null,
        incomeId,
        userId,
      ]
    );

    if (newBankId && newIsReceived) {
      try {
        await applyBalanceDelta(userId, newBankId, newCurrency, newAmount, client, {
          description: `Ingreso: ${newDesc}`,
        });
      } catch (e: any) {
        if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
          await client.query('ROLLBACK');
          return res.status(400).json({
            message:
              e.message === 'CURRENCY_MISMATCH'
                ? 'La moneda no coincide con la cuenta seleccionada'
                : 'Cuenta no encontrada',
          });
        }
        throw e;
      }
    }

    await client.query('COMMIT');

    const row = result.rows[0];
    await syncReceivablePaymentFromIncome(userId, incomeId);

    res.json({
      success: true,
      message: 'Income updated successfully',
      income: {
        id: row.id,
        description: row.description,
        amount: parseFloat(row.amount),
        currency: row.currency,
        nature: row.nature,
        recurrenceType: row.recurrence_type,
        frequency: row.frequency,
        receiptDay: row.receipt_day,
        date: row.date,
        bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
        isReceived: Boolean(row.is_received),
        recurrenceStartDate: row.recurrence_start_date ? toYmdFromPgDate(row.recurrence_start_date) : null,
        recurrenceEndDate: row.recurrence_end_date ? toYmdFromPgDate(row.recurrence_end_date) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Update income error:', error);
    res.status(500).json({ message: 'Error updating income', error: error.message });
  } finally {
    client.release();
  }
};

export const deleteIncome = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const incomeId = parseInt(req.params.id);

    const pre = await query(
      `SELECT bank_account_id, amount, currency, is_received, description FROM income WHERE id = $1 AND user_id = $2`,
      [incomeId, userId]
    );
    if (pre.rows.length === 0) {
      return res.status(404).json({ message: 'Income item not found' });
    }

    const row = pre.rows[0];

    await deleteReceivablePaymentByIncomeId(userId, incomeId);

    if (row.bank_account_id && row.is_received) {
      try {
        await applyBalanceDelta(
          userId,
          row.bank_account_id,
          row.currency,
          -parseFloat(row.amount),
          undefined,
          { description: `Reversión por eliminación: «${row.description}»` }
        );
      } catch (e: any) {
        console.error('Reverse balance on income delete:', e);
      }
    }

    const del = await query('DELETE FROM income WHERE id = $1 AND user_id = $2 RETURNING id', [
      incomeId,
      userId,
    ]);

    if (del.rows.length === 0) {
      return res.status(404).json({ message: 'Income item not found' });
    }

    await deleteCalendarEventsForRelated(userId, incomeId, ['INCOME']);

    res.json({
      success: true,
      message: 'Income deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete income error:', error);
    res.status(500).json({ message: 'Error deleting income', error: error.message });
  }
};

function resolveMonthlyIncomeReceiptAmount(
  row: { nature: string; amount: unknown },
  monthlyRec: boolean,
  actualAmountRaw: unknown
): number {
  const base = parseFloat(String(row.amount));
  if (!monthlyRec || row.nature !== 'variable') return base;
  if (actualAmountRaw === undefined || actualAmountRaw === null || actualAmountRaw === '') return base;
  const n = typeof actualAmountRaw === 'number' ? actualAmountRaw : parseFloat(String(actualAmountRaw));
  if (Number.isNaN(n) || n <= 0) {
    throw new Error('INVALID_ACTUAL_AMOUNT');
  }
  return n;
}

export const updateIncomeReceiptStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const incomeId = parseInt(req.params.id);
    const { isReceived } = req.body;
    const actualAmountRaw = req.body.actualAmount;

    if (typeof isReceived !== 'boolean') {
      return res.status(400).json({ message: 'isReceived must be a boolean' });
    }

    const checkResult = await query(
      `SELECT is_received, description, bank_account_id, amount, currency, nature, recurrence_type, frequency,
              last_received_month, last_received_year
       FROM income WHERE id = $1 AND user_id = $2`,
      [incomeId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Income not found' });
    }

    const receivableLink = await query(
      `SELECT 1 FROM accounts_receivable_payments WHERE income_id = $1 AND user_id = $2 LIMIT 1`,
      [incomeId, userId]
    );
    if (receivableLink.rows.length > 0) {
      return res.status(400).json({
        message:
          'Este ingreso proviene de una cuenta por cobrar; el estado de recepción no se puede cambiar aquí.',
      });
    }

    const row = checkResult.rows[0];
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();

    const displayedReceived = incomeDisplayedReceived(
      {
        is_received: Boolean(row.is_received),
        last_received_month: row.last_received_month,
        last_received_year: row.last_received_year,
        recurrence_type: row.recurrence_type,
        frequency: row.frequency,
      },
      currentMonth,
      currentYear
    );

    if (displayedReceived === isReceived) {
      return res.json({
        success: true,
        message: 'Receipt status unchanged',
        income: {
          id: incomeId,
          isReceived: displayedReceived,
        },
      });
    }

    const monthlyRec = isMonthlyRecurringIncome(row);

    const client = await getClient();
    try {
      await client.query('BEGIN');

      if (!monthlyRec) {
        if (row.bank_account_id) {
          const amt = parseFloat(String(row.amount));
          const delta = isReceived ? amt : -amt;
          try {
            await applyBalanceDelta(userId, row.bank_account_id, row.currency, delta, client, {
              description:
                delta > 0
                  ? `Ingreso recibido: «${row.description}»`
                  : `Ingreso dejado pendiente (reversión): «${row.description}»`,
            });
          } catch (e: any) {
            if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
              await client.query('ROLLBACK');
              return res.status(400).json({
                message:
                  e.message === 'CURRENCY_MISMATCH'
                    ? 'La moneda no coincide con la cuenta seleccionada'
                    : 'Cuenta no encontrada',
              });
            }
            throw e;
          }
        }

        const result = await client.query(
          `UPDATE income
           SET is_received = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND user_id = $3
           RETURNING id, is_received, updated_at`,
          [isReceived, incomeId, userId]
        );

        await client.query('COMMIT');

        const r = result.rows[0];
        res.json({
          success: true,
          message: 'Receipt status updated successfully',
          income: {
            id: r.id,
            isReceived: r.is_received,
            updatedAt: r.updated_at,
          },
        });
        return;
      }

      let receiptAmt: number;
      try {
        receiptAmt = resolveMonthlyIncomeReceiptAmount(row, monthlyRec, actualAmountRaw);
      } catch {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'actualAmount must be a positive number' });
      }

      const alreadyReceivedThisPeriod =
        row.last_received_month === currentMonth &&
        row.last_received_year === currentYear &&
        Boolean(row.is_received);

      if (isReceived) {
        if (row.nature === 'variable') {
          await upsertIncomePeriodAmount(client, userId, incomeId, currentYear, currentMonth, receiptAmt);
        }
        if (row.bank_account_id && !alreadyReceivedThisPeriod) {
          try {
            await applyBalanceDelta(userId, row.bank_account_id, row.currency, receiptAmt, client, {
              description: `Ingreso recibido: «${row.description}»`,
            });
          } catch (e: any) {
            if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
              await client.query('ROLLBACK');
              return res.status(400).json({
                message:
                  e.message === 'CURRENCY_MISMATCH'
                    ? 'La moneda no coincide con la cuenta seleccionada'
                    : 'Cuenta no encontrada',
              });
            }
            throw e;
          }
        }

        const result = await client.query(
          `UPDATE income
           SET is_received = true,
               last_received_month = $1,
               last_received_year = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3 AND user_id = $4
           RETURNING id, is_received, updated_at`,
          [currentMonth, currentYear, incomeId, userId]
        );

        await client.query('COMMIT');

        const r = result.rows[0];
        res.json({
          success: true,
          message: 'Receipt status updated successfully',
          income: {
            id: r.id,
            isReceived: r.is_received,
            updatedAt: r.updated_at,
          },
        });
      } else {
        let reverseAmt = parseFloat(String(row.amount));
        if (row.nature === 'variable') {
          const stored = await getIncomePeriodAmount(userId, incomeId, currentYear, currentMonth, client);
          if (stored != null) reverseAmt = stored;
        }

        if (displayedReceived && row.bank_account_id) {
          try {
            await applyBalanceDelta(userId, row.bank_account_id, row.currency, -reverseAmt, client, {
              description: `Ingreso dejado pendiente (reversión): «${row.description}»`,
            });
          } catch (e: any) {
            if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
              await client.query('ROLLBACK');
              return res.status(400).json({
                message:
                  e.message === 'CURRENCY_MISMATCH'
                    ? 'La moneda no coincide con la cuenta seleccionada'
                    : 'Cuenta no encontrada',
              });
            }
            throw e;
          }
        }

        if (row.nature === 'variable') {
          await deleteIncomePeriodAmount(client, userId, incomeId, currentYear, currentMonth);
        }

        const result = await client.query(
          `UPDATE income
           SET is_received = false, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1 AND user_id = $2
           RETURNING id, is_received, updated_at`,
          [incomeId, userId]
        );

        await client.query('COMMIT');

        const r = result.rows[0];
        res.json({
          success: true,
          message: 'Receipt status updated successfully',
          income: {
            id: r.id,
            isReceived: r.is_received,
            updatedAt: r.updated_at,
          },
        });
      }
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('Update income receipt status error:', error);
    res.status(500).json({ message: 'Error updating receipt status', error: error.message });
  }
};
