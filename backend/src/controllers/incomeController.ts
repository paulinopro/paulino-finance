import { Response } from 'express';
import { getClient, query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { resolveExchangeRateDopUsd } from '../utils/exchangeRate';
import { applyBalanceDelta } from '../services/accountBalance';
import {
  validateIncomeUpdateForLinkedReceivable,
  syncReceivablePaymentFromIncome,
  deleteReceivablePaymentByIncomeId,
} from '../services/accountsPaymentLinkSync';
import { FREQUENCY_VALUES, normalizeFrequency, type Nature, type RecurrenceType } from '../constants/incomeExpenseTaxonomy';

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

    // Get paginated results
    let queryText = `
      SELECT id, description, amount, currency, nature, recurrence_type, frequency,
              receipt_day, date, bank_account_id, is_received, created_at, updated_at
       FROM income
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limitNum, offset);

    const result = await query(queryText, params);

    const income = result.rows.map((row) => ({
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    // Calculate totals for all income (not just current page)
    // Use params without limit and offset
    const allIncomeResult = await query(
      `SELECT amount, currency FROM income ${whereClause}`,
      paramsBeforePagination
    );
    const totalDop = allIncomeResult.rows
      .filter((row) => row.currency === 'DOP')
      .reduce((sum, row) => sum + parseFloat(row.amount), 0);
    const totalUsd = allIncomeResult.rows
      .filter((row) => row.currency === 'USD')
      .reduce((sum, row) => sum + parseFloat(row.amount), 0);
    
    // Get exchange rate for total calculation
    const userResult = await query('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
    const exchangeRate = resolveExchangeRateDopUsd(userResult.rows[0]?.exchange_rate_dop_usd);
    const totalAmount = totalDop + (totalUsd * exchangeRate);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      income,
      summary: {
        totalDop,
        totalUsd,
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

    const result = await query(
      `SELECT id, description, amount, currency, nature, recurrence_type, frequency,
              receipt_day, date, bank_account_id, is_received, created_at, updated_at
       FROM income
       WHERE id = $1 AND user_id = $2`,
      [incomeId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Income item not found' });
    }

    const row = result.rows[0];
    res.json({
      success: true,
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

  const cur = currency || 'DOP';
  const bankAccountId = parseBankAccountIdFromBody(req.body, 'create', null);
  const amt = parseFloat(String(amount));
  const initialReceived = typeof isReceived === 'boolean' ? isReceived : false;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO income 
       (user_id, description, amount, currency, nature, recurrence_type, frequency, receipt_day, date, bank_account_id, is_received)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, description, amount, currency, nature, recurrence_type, frequency,
                 receipt_day, date, bank_account_id, is_received, created_at, updated_at`,
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
      ]
    );

    if (initialReceived && bankAccountId) {
      try {
        await applyBalanceDelta(userId, bankAccountId, cur, amt, client);
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
    `SELECT id, description, amount, currency, nature, recurrence_type, frequency, receipt_day, date, bank_account_id, is_received
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

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (old.bank_account_id && old.is_received) {
      await applyBalanceDelta(
        userId,
        old.bank_account_id,
        old.currency,
        -parseFloat(old.amount),
        client
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
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND user_id = $12
       RETURNING id, description, amount, currency, nature, recurrence_type, frequency,
                 receipt_day, date, bank_account_id, is_received, created_at, updated_at`,
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
        incomeId,
        userId,
      ]
    );

    if (newBankId && newIsReceived) {
      try {
        await applyBalanceDelta(userId, newBankId, newCurrency, newAmount, client);
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
      `SELECT bank_account_id, amount, currency, is_received FROM income WHERE id = $1 AND user_id = $2`,
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
          -parseFloat(row.amount)
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

    res.json({
      success: true,
      message: 'Income deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete income error:', error);
    res.status(500).json({ message: 'Error deleting income', error: error.message });
  }
};

export const updateIncomeReceiptStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const incomeId = parseInt(req.params.id);
    const { isReceived } = req.body;

    if (typeof isReceived !== 'boolean') {
      return res.status(400).json({ message: 'isReceived must be a boolean' });
    }

    const checkResult = await query(
      `SELECT is_received, bank_account_id, amount, currency FROM income WHERE id = $1 AND user_id = $2`,
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
    if (row.is_received === isReceived) {
      return res.json({
        success: true,
        message: 'Receipt status unchanged',
        income: {
          id: incomeId,
          isReceived: row.is_received,
        },
      });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      if (row.bank_account_id) {
        const amt = parseFloat(row.amount);
        const delta = isReceived ? amt : -amt;
        try {
          await applyBalanceDelta(userId, row.bank_account_id, row.currency, delta, client);
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
