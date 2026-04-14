import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getCards = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { search, bank } = req.query;

    let queryText = `
      SELECT id, bank_name, card_name, credit_limit_dop, credit_limit_usd,
              current_debt_dop, current_debt_usd, minimum_payment_dop, minimum_payment_usd,
              cut_off_day, payment_due_day, currency_type, created_at, updated_at
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
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    // Calculate totals
    const totalDebtDop = cards.reduce((sum, c) => {
      if (c.currencyType === 'DOP' || c.currencyType === 'DUAL') {
        return sum + c.currentDebtDop;
      }
      return sum;
    }, 0);

    const totalDebtUsd = cards.reduce((sum, c) => {
      if (c.currencyType === 'USD' || c.currencyType === 'DUAL') {
        return sum + c.currentDebtUsd;
      }
      return sum;
    }, 0);

    const totalMinPaymentDop = cards.reduce((sum, c) => {
      if (c.currencyType === 'DOP' || c.currencyType === 'DUAL') {
        return sum + c.minimumPaymentDop;
      }
      return sum;
    }, 0);

    const totalMinPaymentUsd = cards.reduce((sum, c) => {
      if (c.currencyType === 'USD' || c.currencyType === 'DUAL') {
        return sum + c.minimumPaymentUsd;
      }
      return sum;
    }, 0);

    // Get exchange rate for total calculation
    const userResult = await query('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
    const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
    const total = totalDebtDop + (totalDebtUsd * exchangeRate);

    res.json({
      success: true,
      cards,
      summary: {
        totalDebtDop,
        totalDebtUsd,
        totalMinPaymentDop,
        totalMinPaymentUsd,
        totalCards: cards.length,
      },
    });
  } catch (error: any) {
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
              cut_off_day, payment_due_day, currency_type, created_at, updated_at
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
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
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
      'SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2',
      [cardId, userId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Card not found' });
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
      ]
    );

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

    res.json({
      success: true,
      message: 'Card deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete card error:', error);
    res.status(500).json({ message: 'Error deleting card', error: error.message });
  }
};
