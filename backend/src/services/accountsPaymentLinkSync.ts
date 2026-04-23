import { query } from '../config/database';

export const roundMoney = (n: number) => Math.round(n * 100) / 100;

export async function getTotalPaidPayable(accountPayableId: number): Promise<number> {
  const r = await query(
    `SELECT COALESCE(SUM(amount), 0)::numeric as total FROM accounts_payable_payments WHERE account_payable_id = $1`,
    [accountPayableId]
  );
  return roundMoney(parseFloat(r.rows[0].total));
}

export async function recalculatePayableStatus(accountPayableId: number, userId: number): Promise<void> {
  const acc = await query(
    `SELECT amount FROM accounts_payable WHERE id = $1 AND user_id = $2`,
    [accountPayableId, userId]
  );
  if (acc.rows.length === 0) return;
  const totalDue = roundMoney(parseFloat(acc.rows[0].amount));
  const totalPaid = await getTotalPaidPayable(accountPayableId);
  if (totalPaid >= totalDue - 0.005) {
    const mx = await query(
      `SELECT MAX(payment_date)::date AS d FROM accounts_payable_payments WHERE account_payable_id = $1`,
      [accountPayableId]
    );
    const pd = mx.rows[0]?.d;
    await query(
      `UPDATE accounts_payable
       SET status = 'PAID', paid_date = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [pd, accountPayableId, userId]
    );
  } else {
    await query(
      `UPDATE accounts_payable
       SET status = 'PENDING', paid_date = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
      [accountPayableId, userId]
    );
  }
}

export async function expenseDescriptionForPayable(
  expenseId: number | null,
  userId: number,
  accountDescription: string
): Promise<string> {
  if (!expenseId) return `Abono: ${accountDescription}`;
  const r = await query(`SELECT description FROM expenses WHERE id = $1 AND user_id = $2`, [expenseId, userId]);
  if (r.rows.length === 0) return `Abono: ${accountDescription}`;
  const d = String(r.rows[0].description);
  const prefix = d.trimStart().startsWith('Pago:') ? 'Pago' : 'Abono';
  return `${prefix}: ${accountDescription}`;
}

export async function getTotalReceivedReceivable(accountReceivableId: number): Promise<number> {
  const r = await query(
    `SELECT COALESCE(SUM(amount), 0)::numeric as total FROM accounts_receivable_payments WHERE account_receivable_id = $1`,
    [accountReceivableId]
  );
  return roundMoney(parseFloat(r.rows[0].total));
}

export async function recalculateReceivableStatus(accountReceivableId: number, userId: number): Promise<void> {
  const acc = await query(
    `SELECT amount FROM accounts_receivable WHERE id = $1 AND user_id = $2`,
    [accountReceivableId, userId]
  );
  if (acc.rows.length === 0) return;
  const totalDue = roundMoney(parseFloat(acc.rows[0].amount));
  const totalReceived = await getTotalReceivedReceivable(accountReceivableId);
  if (totalReceived >= totalDue - 0.005) {
    const mx = await query(
      `SELECT MAX(payment_date)::date AS d FROM accounts_receivable_payments WHERE account_receivable_id = $1`,
      [accountReceivableId]
    );
    const rd = mx.rows[0]?.d;
    await query(
      `UPDATE accounts_receivable
       SET status = 'RECEIVED', received_date = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3`,
      [rd, accountReceivableId, userId]
    );
  } else {
    await query(
      `UPDATE accounts_receivable
       SET status = 'PENDING', received_date = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND user_id = $2`,
      [accountReceivableId, userId]
    );
  }
}

export async function incomeDescriptionForReceivable(
  incomeId: number | null,
  userId: number,
  accountDescription: string
): Promise<string> {
  if (!incomeId) return `Abono: ${accountDescription}`;
  const r = await query(`SELECT description FROM income WHERE id = $1 AND user_id = $2`, [incomeId, userId]);
  if (r.rows.length === 0) return `Abono: ${accountDescription}`;
  const d = String(r.rows[0].description);
  const prefix = d.trimStart().startsWith('Cobro:') ? 'Cobro' : 'Abono';
  return `${prefix}: ${accountDescription}`;
}

/** Valida PUT de gasto si está vinculado a un abono de cuenta por pagar. */
export async function validateExpenseUpdateForLinkedPayable(
  userId: number,
  expenseId: number,
  body: { amount?: unknown; currency?: unknown }
): Promise<string | null> {
  const link = await query(
    `SELECT p.id, p.account_payable_id FROM accounts_payable_payments p WHERE p.expense_id = $1 AND p.user_id = $2`,
    [expenseId, userId]
  );
  if (link.rows.length === 0) return null;

  const cur = await query(`SELECT amount, currency FROM expenses WHERE id = $1 AND user_id = $2`, [expenseId, userId]);
  if (cur.rows.length === 0) return null;

  const effectiveAmount =
    body.amount !== undefined && body.amount !== null && body.amount !== ''
      ? roundMoney(parseFloat(String(body.amount)))
      : roundMoney(parseFloat(cur.rows[0].amount));

  const apId = link.rows[0].account_payable_id;
  const payId = link.rows[0].id;
  const acc = await query(`SELECT amount, currency FROM accounts_payable WHERE id = $1 AND user_id = $2`, [apId, userId]);
  if (acc.rows.length === 0) return null;
  const totalDue = roundMoney(parseFloat(acc.rows[0].amount));

  if (
    body.currency !== undefined &&
    body.currency !== null &&
    String(body.currency).trim() !== '' &&
    String(body.currency) !== acc.rows[0].currency
  ) {
    return 'La moneda del gasto debe coincidir con la cuenta por pagar vinculada a este abono';
  }

  const other = await query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM accounts_payable_payments WHERE account_payable_id = $1 AND id <> $2`,
    [apId, payId]
  );
  const otherSum = roundMoney(parseFloat(other.rows[0].total));
  if (otherSum + effectiveAmount > totalDue + 0.005) {
    return `El monto del gasto no puede exceder el saldo pendiente de la cuenta por pagar (máximo ${roundMoney(totalDue - otherSum)} ${acc.rows[0].currency})`;
  }
  return null;
}

/** Tras actualizar fila en expenses: sincroniza abono y estado de la cuenta. */
export async function syncPayablePaymentFromExpense(userId: number, expenseId: number): Promise<void> {
  const link = await query(
    `SELECT id FROM accounts_payable_payments WHERE expense_id = $1 AND user_id = $2`,
    [expenseId, userId]
  );
  if (link.rows.length === 0) return;

  const exp = await query(
    `SELECT amount, date FROM expenses WHERE id = $1 AND user_id = $2`,
    [expenseId, userId]
  );
  if (exp.rows.length === 0) return;
  const newAmt = roundMoney(parseFloat(exp.rows[0].amount));
  const payDate = exp.rows[0].date;

  await query(
    `UPDATE accounts_payable_payments
     SET amount = $1,
         payment_date = COALESCE($2::date, payment_date)
     WHERE expense_id = $3 AND user_id = $4`,
    [newAmt, payDate, expenseId, userId]
  );

  const apRow = await query(
    `SELECT account_payable_id FROM accounts_payable_payments WHERE expense_id = $1 AND user_id = $2`,
    [expenseId, userId]
  );
  if (apRow.rows.length > 0) {
    await recalculatePayableStatus(apRow.rows[0].account_payable_id, userId);
  }
}

/** Elimina el abono en BD antes de borrar el gasto. */
export async function deletePayablePaymentByExpenseId(userId: number, expenseId: number): Promise<void> {
  const r = await query(
    `DELETE FROM accounts_payable_payments WHERE expense_id = $1 AND user_id = $2 RETURNING account_payable_id`,
    [expenseId, userId]
  );
  if (r.rows.length === 0) return;
  await recalculatePayableStatus(r.rows[0].account_payable_id, userId);
}

/** Valida PUT de ingreso si está vinculado a abono de cuenta por cobrar. */
export async function validateIncomeUpdateForLinkedReceivable(
  userId: number,
  incomeId: number,
  body: { amount?: unknown; currency?: unknown }
): Promise<string | null> {
  const link = await query(
    `SELECT p.id, p.account_receivable_id FROM accounts_receivable_payments p WHERE p.income_id = $1 AND p.user_id = $2`,
    [incomeId, userId]
  );
  if (link.rows.length === 0) return null;

  const cur = await query(`SELECT amount, currency FROM income WHERE id = $1 AND user_id = $2`, [incomeId, userId]);
  if (cur.rows.length === 0) return null;

  const effectiveAmount =
    body.amount !== undefined && body.amount !== null && body.amount !== ''
      ? roundMoney(parseFloat(String(body.amount)))
      : roundMoney(parseFloat(cur.rows[0].amount));

  const arId = link.rows[0].account_receivable_id;
  const payId = link.rows[0].id;
  const acc = await query(`SELECT amount, currency FROM accounts_receivable WHERE id = $1 AND user_id = $2`, [arId, userId]);
  if (acc.rows.length === 0) return null;
  const totalDue = roundMoney(parseFloat(acc.rows[0].amount));

  if (
    body.currency !== undefined &&
    body.currency !== null &&
    String(body.currency).trim() !== '' &&
    String(body.currency) !== acc.rows[0].currency
  ) {
    return 'La moneda del ingreso debe coincidir con la cuenta por cobrar vinculada a este abono';
  }

  const other = await query(
    `SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM accounts_receivable_payments WHERE account_receivable_id = $1 AND id <> $2`,
    [arId, payId]
  );
  const otherSum = roundMoney(parseFloat(other.rows[0].total));
  if (otherSum + effectiveAmount > totalDue + 0.005) {
    return `El monto del ingreso no puede exceder el saldo pendiente de la cuenta por cobrar (máximo ${roundMoney(totalDue - otherSum)} ${acc.rows[0].currency})`;
  }
  return null;
}

export async function syncReceivablePaymentFromIncome(userId: number, incomeId: number): Promise<void> {
  const link = await query(
    `SELECT id FROM accounts_receivable_payments WHERE income_id = $1 AND user_id = $2`,
    [incomeId, userId]
  );
  if (link.rows.length === 0) return;

  const inc = await query(`SELECT amount, date FROM income WHERE id = $1 AND user_id = $2`, [incomeId, userId]);
  if (inc.rows.length === 0) return;
  const newAmt = roundMoney(parseFloat(inc.rows[0].amount));
  const payDate = inc.rows[0].date;

  await query(
    `UPDATE accounts_receivable_payments
     SET amount = $1,
         payment_date = COALESCE($2::date, payment_date)
     WHERE income_id = $3 AND user_id = $4`,
    [newAmt, payDate, incomeId, userId]
  );

  const arRow = await query(
    `SELECT account_receivable_id FROM accounts_receivable_payments WHERE income_id = $1 AND user_id = $2`,
    [incomeId, userId]
  );
  if (arRow.rows.length > 0) {
    await recalculateReceivableStatus(arRow.rows[0].account_receivable_id, userId);
  }
}

export async function deleteReceivablePaymentByIncomeId(userId: number, incomeId: number): Promise<void> {
  const r = await query(
    `DELETE FROM accounts_receivable_payments WHERE income_id = $1 AND user_id = $2 RETURNING account_receivable_id`,
    [incomeId, userId]
  );
  if (r.rows.length === 0) return;
  await recalculateReceivableStatus(r.rows[0].account_receivable_id, userId);
}
