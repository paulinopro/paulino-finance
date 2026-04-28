import { query } from '../config/database';
import { expenseUsesImmediateBalance } from '../constants/incomeExpenseTaxonomy';
import { applyBalanceDelta } from './accountBalance';
import { deletePayablePaymentByExpenseId } from './accountsPaymentLinkSync';
import { deleteCalendarEventsForRelated } from './calendarService';

/** Elimina un gasto y revierte saldo de cuenta; usado por DELETE /expenses y por gastos de vehículo vinculados. */
export async function removeExpenseForUser(userId: number, expenseId: number): Promise<boolean> {
  const pre = await query(
    `SELECT recurrence_type, frequency, bank_account_id, amount, currency FROM expenses WHERE id = $1 AND user_id = $2`,
    [expenseId, userId]
  );
  if (pre.rows.length === 0) {
    return false;
  }
  const row = pre.rows[0];

  await deletePayablePaymentByExpenseId(userId, expenseId);

  if (expenseUsesImmediateBalance(row) && row.bank_account_id) {
    try {
      await applyBalanceDelta(
        userId,
        row.bank_account_id,
        row.currency,
        parseFloat(row.amount)
      );
    } catch (e) {
      console.error('Reverse balance on expense delete:', e);
    }
  }

  const result = await query('DELETE FROM expenses WHERE id = $1 AND user_id = $2 RETURNING id', [expenseId, userId]);
  if (result.rows.length > 0) {
    await deleteCalendarEventsForRelated(userId, expenseId, ['RECURRING_EXPENSE', 'EXPENSE']);
  }
  return result.rows.length > 0;
}
