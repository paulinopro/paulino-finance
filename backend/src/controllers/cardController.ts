import { ensureActiveEntity, respondInactiveEntityError } from './activeEntityGuard';
import { Response } from 'express';
import { getClient, query } from '../config/database';
import { getUserCurrencyPair, validateLedgerCurrencyForUser } from '../utils/userCurrencyPair';
import { deleteCalendarEventsForRelated } from '../services/calendarService';
import { AuthRequest } from '../middleware/auth';
import { applyBalanceDelta } from '../services/accountBalance';
import { financialEntityUpdateRequiresActive } from '../services/financialEntityMutation';
import { InactiveEntityError } from '../services/entityActivation';

function optionalBankAccountId(body: Record<string, unknown>): number | null {
  const v = body.bankAccountId;
  if (v == null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

export const getCards = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { search, bank } = req.query;

    let queryText = `
      SELECT id, bank_name, card_name, credit_limit_dop, credit_limit_usd,
              current_debt_dop, current_debt_usd, minimum_payment_dop, minimum_payment_usd,
              cut_off_day, payment_due_day, currency_type, is_active, created_at, updated_at
       FROM credit_cards
       WHERE user_id = $1
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (search) {
      queryText += ` AND (card_name ILIKE $${paramIndex} OR bank_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (bank) {
      queryText += ` AND bank_name ILIKE $${paramIndex}`;
      params.push(`%${bank}%`);
      paramIndex++;
    }

    queryText += ` ORDER BY created_at DESC`;

    const result = await query(queryText, params);

    const cards = result.rows.map((row) => ({
      id: row.id,
      bankName: row.bank_name,
      cardName: row.card_name,
      creditLimitDop: parseFloat(row.credit_limit_dop || 0),
      creditLimitUsd: parseFloat(row.credit_limit_usd || 0),
      currentDebtDop: parseFloat(row.current_debt_dop || 0),
      currentDebtUsd: parseFloat(row.current_debt_usd || 0),
      minimumPaymentDop: parseFloat(row.minimum_payment_dop || 0),
      minimumPaymentUsd: parseFloat(row.minimum_payment_usd || 0),
      cutOffDay: row.cut_off_day,
      paymentDueDay: row.payment_due_day,
      currencyType: row.currency_type,
      isActive: row.is_active === true,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    // Calculate totals
    const activeCards = cards.filter((card) => card.isActive);
    const totalDebtDop = activeCards.reduce((sum, c) => {
      if (c.currencyType === 'DOP' || c.currencyType === 'DUAL') {
        return sum + c.currentDebtDop;
      }
      return sum;
    }, 0);

    const totalDebtUsd = activeCards.reduce((sum, c) => {
      if (c.currencyType === 'USD' || c.currencyType === 'DUAL') {
        return sum + c.currentDebtUsd;
      }
      return sum;
    }, 0);

    const totalMinPaymentDop = activeCards.reduce((sum, c) => {
      if (c.currencyType === 'DOP' || c.currencyType === 'DUAL') {
        return sum + c.minimumPaymentDop;
      }
      return sum;
    }, 0);

    const totalMinPaymentUsd = activeCards.reduce((sum, c) => {
      if (c.currencyType === 'USD' || c.currencyType === 'DUAL') {
        return sum + c.minimumPaymentUsd;
      }
      return sum;
    }, 0);

    res.json({
      success: true,
      cards,
      summary: {
        totalDebtDop,
        totalDebtUsd,
        totalMinPaymentDop,
        totalMinPaymentUsd,
        totalCards: activeCards.length,
      },
    });
  } catch (error: any) {
    if (respondInactiveEntityError(error, res)) return;
    console.error('Get cards error:', error);
    res.status(500).json({ message: 'Error fetching cards', error: error.message });
  }
};

export const getCard = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const cardId = parseInt(req.params.id);

    const result = await query(
      `SELECT id, bank_name, card_name, credit_limit_dop, credit_limit_usd,
              current_debt_dop, current_debt_usd, minimum_payment_dop, minimum_payment_usd,
              cut_off_day, payment_due_day, currency_type, is_active, created_at, updated_at
       FROM credit_cards
       WHERE id = $1 AND user_id = $2`,
      [cardId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      card: {
        id: row.id,
        bankName: row.bank_name,
        cardName: row.card_name,
        creditLimitDop: parseFloat(row.credit_limit_dop || 0),
        creditLimitUsd: parseFloat(row.credit_limit_usd || 0),
        currentDebtDop: parseFloat(row.current_debt_dop || 0),
        currentDebtUsd: parseFloat(row.current_debt_usd || 0),
        minimumPaymentDop: parseFloat(row.minimum_payment_dop || 0),
        minimumPaymentUsd: parseFloat(row.minimum_payment_usd || 0),
        cutOffDay: row.cut_off_day,
        paymentDueDay: row.payment_due_day,
        currencyType: row.currency_type,
        isActive: row.is_active === true,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    if (respondInactiveEntityError(error, res)) return;
    console.error('Get card error:', error);
    res.status(500).json({ message: 'Error fetching card', error: error.message });
  }
};

export const createCard = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      bankName,
      cardName,
      creditLimitDop,
      creditLimitUsd,
      currentDebtDop,
      currentDebtUsd,
      minimumPaymentDop,
      minimumPaymentUsd,
      cutOffDay,
      paymentDueDay,
      currencyType,
    } = req.body;

    if (!bankName || !cardName || !cutOffDay || !paymentDueDay || !currencyType) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO credit_cards 
       (user_id, bank_name, card_name, credit_limit_dop, credit_limit_usd,
        current_debt_dop, current_debt_usd, minimum_payment_dop, minimum_payment_usd,
        cut_off_day, payment_due_day, currency_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, bank_name, card_name, credit_limit_dop, credit_limit_usd,
                 current_debt_dop, current_debt_usd, minimum_payment_dop, minimum_payment_usd,
                 cut_off_day, payment_due_day, currency_type, created_at, updated_at`,
      [
        userId,
        bankName,
        cardName,
        creditLimitDop || null,
        creditLimitUsd || null,
        currentDebtDop || 0,
        currentDebtUsd || 0,
        minimumPaymentDop || null,
        minimumPaymentUsd || null,
        cutOffDay,
        paymentDueDay,
        currencyType,
      ]
    );

    const row = result.rows[0];
    res.status(201).json({
      success: true,
      message: 'Card created successfully',
      card: {
        id: row.id,
        bankName: row.bank_name,
        cardName: row.card_name,
        creditLimitDop: parseFloat(row.credit_limit_dop || 0),
        creditLimitUsd: parseFloat(row.credit_limit_usd || 0),
        currentDebtDop: parseFloat(row.current_debt_dop || 0),
        currentDebtUsd: parseFloat(row.current_debt_usd || 0),
        minimumPaymentDop: parseFloat(row.minimum_payment_dop || 0),
        minimumPaymentUsd: parseFloat(row.minimum_payment_usd || 0),
        cutOffDay: row.cut_off_day,
        paymentDueDay: row.payment_due_day,
        currencyType: row.currency_type,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    if (respondInactiveEntityError(error, res)) return;
    console.error('Create card error:', error);
    res.status(500).json({ message: 'Error creating card', error: error.message });
  }
};

export const updateCard = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const cardId = parseInt(req.params.id);
    const {
      bankName,
      cardName,
      creditLimitDop,
      creditLimitUsd,
      currentDebtDop,
      currentDebtUsd,
      minimumPaymentDop,
      minimumPaymentUsd,
      cutOffDay,
      paymentDueDay,
      currencyType,
    } = req.body;

    // Check if card exists and belongs to user
    const checkResult = await query(
      'SELECT id, is_active FROM credit_cards WHERE id = $1 AND user_id = $2',
      [cardId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }
    const financialUpdate = financialEntityUpdateRequiresActive('cards', req.body);
    if (financialUpdate && checkResult.rows[0].is_active !== true) {
      if (!(await ensureActiveEntity('cards', cardId, userId, res))) return;
    }

    const result = await query(
      `UPDATE credit_cards
       SET bank_name = COALESCE($1, bank_name),
           card_name = COALESCE($2, card_name),
           credit_limit_dop = COALESCE($3, credit_limit_dop),
           credit_limit_usd = COALESCE($4, credit_limit_usd),
           current_debt_dop = COALESCE($5, current_debt_dop),
           current_debt_usd = COALESCE($6, current_debt_usd),
           minimum_payment_dop = COALESCE($7, minimum_payment_dop),
           minimum_payment_usd = COALESCE($8, minimum_payment_usd),
           cut_off_day = COALESCE($9, cut_off_day),
           payment_due_day = COALESCE($10, payment_due_day),
           currency_type = COALESCE($11, currency_type),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $12 AND user_id = $13
         AND (is_active = TRUE OR $14::boolean = FALSE)
       RETURNING id, bank_name, card_name, credit_limit_dop, credit_limit_usd,
                 current_debt_dop, current_debt_usd, minimum_payment_dop, minimum_payment_usd,
                 cut_off_day, payment_due_day, currency_type, created_at, updated_at`,
      [
        bankName,
        cardName,
        creditLimitDop,
        creditLimitUsd,
        currentDebtDop,
        currentDebtUsd,
        minimumPaymentDop,
        minimumPaymentUsd,
        cutOffDay,
        paymentDueDay,
        currencyType,
        cardId,
        userId,
        financialUpdate,
      ]
    );

    if (result.rows.length === 0) {
      if (!(await ensureActiveEntity('cards', cardId, userId, res))) return;
      return res.status(404).json({ message: 'Card not found' });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      message: 'Card updated successfully',
      card: {
        id: row.id,
        bankName: row.bank_name,
        cardName: row.card_name,
        creditLimitDop: parseFloat(row.credit_limit_dop || 0),
        creditLimitUsd: parseFloat(row.credit_limit_usd || 0),
        currentDebtDop: parseFloat(row.current_debt_dop || 0),
        currentDebtUsd: parseFloat(row.current_debt_usd || 0),
        minimumPaymentDop: parseFloat(row.minimum_payment_dop || 0),
        minimumPaymentUsd: parseFloat(row.minimum_payment_usd || 0),
        cutOffDay: row.cut_off_day,
        paymentDueDay: row.payment_due_day,
        currencyType: row.currency_type,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    if (respondInactiveEntityError(error, res)) return;
    console.error('Update card error:', error);
    res.status(500).json({ message: 'Error updating card', error: error.message });
  }
};

export const deleteCard = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const cardId = parseInt(req.params.id);

    const result = await query(
      'DELETE FROM credit_cards WHERE id = $1 AND user_id = $2 RETURNING id',
      [cardId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    await deleteCalendarEventsForRelated(userId, cardId, ['CARD_PAYMENT']);

    res.json({
      success: true,
      message: 'Card deleted successfully',
    });
  } catch (error: any) {
    if (respondInactiveEntityError(error, res)) return;
    console.error('Delete card error:', error);
    res.status(500).json({ message: 'Error deleting card', error: error.message });
  }
};

export const listCardPayments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const cardId = parseInt(req.params.id);
    const lim = Math.min(parseInt(String(req.query.limit || '50'), 10) || 50, 200);

    const check = await query(
      'SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2',
      [cardId, userId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const r = await query(
      `SELECT id, amount, currency, payment_date, bank_account_id, notes, created_at
       FROM credit_card_payments
       WHERE credit_card_id = $1 AND user_id = $2
       ORDER BY payment_date DESC, id DESC
       LIMIT $3`,
      [cardId, userId, lim]
    );

    res.json({
      success: true,
      payments: r.rows.map((row) => ({
        id: row.id,
        amount: parseFloat(row.amount),
        currency: row.currency,
        paymentDate: row.payment_date,
        bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
        notes: row.notes,
        createdAt: row.created_at,
      })),
    });
  } catch (error: any) {
    if (respondInactiveEntityError(error, res)) return;
    console.error('List card payments error:', error);
    res.status(500).json({ message: 'Error listing payments', error: error.message });
  }
};

export const recordCardPayment = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const cardId = parseInt(req.params.id);
    if (!(await ensureActiveEntity('cards', cardId, userId, res))) return;
    const { amount, currency, paymentDate, notes } = req.body;
    const bankAccountId = optionalBankAccountId(req.body as Record<string, unknown>);

    const amt = parseFloat(String(amount));
    if (!amount || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ message: 'amount must be greater than zero' });
    }
    const pair = await getUserCurrencyPair(userId);
    const ledErr = validateLedgerCurrencyForUser(pair, String(currency));
    if (ledErr) {
      return res.status(400).json({ message: ledErr });
    }
    const dateStr = paymentDate || new Date().toISOString().slice(0, 10);

    const cardResult = await query(
      `SELECT id, bank_name, card_name, current_debt_dop, current_debt_usd, currency_type, is_active
       FROM credit_cards WHERE id = $1 AND user_id = $2`,
      [cardId, userId]
    );
    if (cardResult.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const c = cardResult.rows[0];
    if (c.is_active !== true) {
      if (!(await ensureActiveEntity('cards', cardId, userId, res))) return;
    }
    const ct = c.currency_type as string;
    const cur = String(currency).trim().toUpperCase();
    if (ct === 'DOP' && cur !== pair.primary) {
      return res.status(400).json({ message: `This card only tracks ${pair.primary} debt` });
    }
    if (ct === 'USD' && cur !== pair.secondary) {
      return res.status(400).json({ message: `This card only tracks ${pair.secondary} debt` });
    }

    const debtDop = parseFloat(c.current_debt_dop || 0);
    const debtUsd = parseFloat(c.current_debt_usd || 0);
    const currentDebt = cur === pair.primary ? debtDop : debtUsd;
    const payApply = Math.min(amt, currentDebt);
    if (payApply <= 0) {
      return res.status(400).json({ message: 'No debt to pay in this currency' });
    }

    const cardTag = `[Tarjeta ${String(c.bank_name ?? '').trim() || '?'} · ${String(c.card_name ?? '').trim() || '?'}]`;

    const ins = await query(
      `INSERT INTO credit_card_payments (user_id, credit_card_id, amount, currency, payment_date, bank_account_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [userId, cardId, payApply, currency, dateStr, bankAccountId, notes ?? null]
    );

    const debtUpdate = cur === pair.primary
      ? await query(
          `UPDATE credit_cards SET current_debt_dop = GREATEST(0, current_debt_dop - $1::numeric), updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND user_id = $3 AND is_active = TRUE RETURNING id`,
          [payApply, cardId, userId]
        )
      : await query(
          `UPDATE credit_cards SET current_debt_usd = GREATEST(0, current_debt_usd - $1::numeric), updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND user_id = $3 AND is_active = TRUE RETURNING id`,
          [payApply, cardId, userId]
        );
    if (debtUpdate.rows.length === 0) {
      await query('DELETE FROM credit_card_payments WHERE id = $1', [ins.rows[0].id]);
      if (!(await ensureActiveEntity('cards', cardId, userId, res))) return;
      return res.status(404).json({ message: 'Card not found' });
    }

    if (bankAccountId) {
      try {
        await applyBalanceDelta(userId, bankAccountId, cur, -payApply, undefined, {
          description: `${cardTag} Abono desde cuenta`,
        });
      } catch (e: any) {
        await query('DELETE FROM credit_card_payments WHERE id = $1', [ins.rows[0].id]);
        if (cur === pair.primary) {
          await query(
            `UPDATE credit_cards SET current_debt_dop = current_debt_dop + $1::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
            [payApply, cardId, userId]
          );
        } else {
          await query(
            `UPDATE credit_cards SET current_debt_usd = current_debt_usd + $1::numeric, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3`,
            [payApply, cardId, userId]
          );
        }
        if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
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

    res.status(201).json({
      success: true,
      message: 'Payment recorded',
      payment: {
        id: ins.rows[0].id,
        amount: payApply,
        currency: cur,
        paymentDate: dateStr,
        bankAccountId,
        createdAt: ins.rows[0].created_at,
      },
    });
  } catch (error: any) {
    if (respondInactiveEntityError(error, res)) return;
    console.error('Record card payment error:', error);
    res.status(500).json({ message: 'Error recording payment', error: error.message });
  }
};

export const deleteCardPayment = async (req: AuthRequest, res: Response) => {
  let client: Awaited<ReturnType<typeof getClient>> | null = null;
  let transactionOpen = false;

  try {
    const userId = req.userId!;
    const paymentId = parseInt(req.params.paymentId);
    client = await getClient();
    await client.query('BEGIN');
    transactionOpen = true;

    const pr = await client.query(
      `SELECT p.id, p.credit_card_id, p.amount, p.currency, p.bank_account_id,
              c.bank_name, c.card_name, c.is_active
       FROM credit_card_payments p
       JOIN credit_cards c ON c.id = p.credit_card_id AND c.user_id = p.user_id
       WHERE p.id = $1 AND p.user_id = $2
       FOR UPDATE OF c, p`,
      [paymentId, userId]
    );
    if (pr.rows.length === 0) {
      await client.query('ROLLBACK');
      transactionOpen = false;
      return res.status(404).json({ message: 'Payment not found' });
    }

    const p = pr.rows[0];
    if (p.is_active !== true) throw new InactiveEntityError();

    const cardId = p.credit_card_id;
    const payApply = parseFloat(p.amount);
    const currency = p.currency as string;
    const pairRm = await getUserCurrencyPair(userId);
    const curRm = String(currency).trim().toUpperCase();
    const cardTagRm = `[Tarjeta ${String(p.bank_name ?? '').trim() || '?'} · ${String(p.card_name ?? '').trim() || '?'}]`;

    if (p.bank_account_id) {
      await applyBalanceDelta(userId, p.bank_account_id, curRm, payApply, client, {
        description: `${cardTagRm} Eliminación de abono (reversión a cuenta)`,
      });
    }

    const debtColumn = curRm === pairRm.primary ? 'current_debt_dop' : 'current_debt_usd';
    await client.query(
      `UPDATE credit_cards
       SET ${debtColumn} = ${debtColumn} + $1::numeric, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [payApply, cardId, userId]
    );
    await client.query(
      'DELETE FROM credit_card_payments WHERE id = $1 AND user_id = $2',
      [paymentId, userId]
    );

    await client.query('COMMIT');
    transactionOpen = false;
    res.json({ success: true, message: 'Payment removed' });
  } catch (error: any) {
    if (client && transactionOpen) {
      await client.query('ROLLBACK');
      transactionOpen = false;
    }
    if (respondInactiveEntityError(error, res)) return;
    console.error('Delete card payment error:', error);
    res.status(500).json({ message: 'Error deleting payment', error: error.message });
  } finally {
    client?.release();
  }
};
