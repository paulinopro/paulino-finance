import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { resolveExchangeRateDopUsd } from '../utils/exchangeRate';
import { recurringAmountToMonthlySameCurrency } from '../utils/projectionsMonthlyEquivalent';

function toDop(amount: number, currency: string, exchangeRate: number): number {
  return currency === 'USD' ? amount * exchangeRate : amount;
}

export const getProjections = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { months = '6' } = req.query;

    const monthsToProject = parseInt(months as string, 10);
    if (Number.isNaN(monthsToProject) || monthsToProject < 1 || monthsToProject > 600) {
      return res.status(400).json({
        message: 'El parámetro months debe ser un entero entre 1 y 600',
      });
    }

    const userResult = await query(
      'SELECT exchange_rate_dop_usd FROM users WHERE id = $1',
      [userId]
    );
    const exchangeRate = resolveExchangeRateDopUsd(userResult.rows[0]?.exchange_rate_dop_usd);

    // Promedio mensual de ingresos/gastos únicos (últimos 3 meses), por moneda → luego DOP
    const avgIncomeResult = await query(
      `SELECT AVG(total) as avg_income, currency
       FROM (
         SELECT EXTRACT(MONTH FROM date) as month, EXTRACT(YEAR FROM date) as year, SUM(amount) as total, currency
         FROM income
         WHERE user_id = $1
           AND recurrence_type = 'non_recurrent'
           AND date >= CURRENT_DATE - INTERVAL '3 months'
         GROUP BY EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date), currency
       ) subquery
       GROUP BY currency`,
      [userId]
    );

    const avgExpensesResult = await query(
      `SELECT AVG(total) as avg_expenses, currency
       FROM (
         SELECT EXTRACT(MONTH FROM date) as month, EXTRACT(YEAR FROM date) as year, SUM(amount) as total, currency
         FROM expenses
         WHERE user_id = $1
           AND recurrence_type = 'non_recurrent'
           AND date >= CURRENT_DATE - INTERVAL '3 months'
         GROUP BY EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date), currency
       ) subquery
       GROUP BY currency`,
      [userId]
    );

    // Ingresos recurrentes: equivalente mensual según frequency (alineado con flujo de caja / taxonomía)
    const recurrentIncomeRows = await query(
      `SELECT amount, currency, frequency
       FROM income
       WHERE user_id = $1 AND recurrence_type = 'recurrent'`,
      [userId]
    );

    // Gastos recurrentes: todas las frecuencias con equivalente mensual (antes solo «monthly»)
    const recurrentExpenseRows = await query(
      `SELECT amount, currency, frequency
       FROM expenses
       WHERE user_id = $1 AND recurrence_type = 'recurrent'`,
      [userId]
    );

    const accountsResult = await query(
      `SELECT SUM(balance_dop) as total_dop, SUM(balance_usd) as total_usd
       FROM bank_accounts
       WHERE user_id = $1`,
      [userId]
    );
    const accounts = accountsResult.rows[0];
    const currentBalance = parseFloat(accounts.total_dop || 0) + (parseFloat(accounts.total_usd || 0) * exchangeRate);

    let avgMonthlyIncomeDop = 0;
    avgIncomeResult.rows.forEach((row) => {
      const amount = parseFloat(row.avg_income || 0);
      avgMonthlyIncomeDop += toDop(amount, row.currency, exchangeRate);
    });
    recurrentIncomeRows.rows.forEach((row) => {
      const raw = parseFloat(row.amount || 0);
      const monthlySame = recurringAmountToMonthlySameCurrency(raw, row.frequency);
      avgMonthlyIncomeDop += toDop(monthlySame, row.currency, exchangeRate);
    });

    let avgMonthlyExpensesDop = 0;
    avgExpensesResult.rows.forEach((row) => {
      const amount = parseFloat(row.avg_expenses || 0);
      avgMonthlyExpensesDop += toDop(amount, row.currency, exchangeRate);
    });
    recurrentExpenseRows.rows.forEach((row) => {
      const raw = parseFloat(row.amount || 0);
      const monthlySame = recurringAmountToMonthlySameCurrency(raw, row.frequency);
      avgMonthlyExpensesDop += toDop(monthlySame, row.currency, exchangeRate);
    });

    const projections = [];
    let runningBalance = currentBalance;

    for (let i = 0; i < monthsToProject; i++) {
      const projectionDate = new Date();
      projectionDate.setMonth(projectionDate.getMonth() + i);
      const monthName = projectionDate.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });

      const projectedIncome = avgMonthlyIncomeDop;
      const projectedExpenses = avgMonthlyExpensesDop;
      const netFlow = projectedIncome - projectedExpenses;
      runningBalance += netFlow;

      projections.push({
        month: monthName,
        monthNumber: projectionDate.getMonth() + 1,
        year: projectionDate.getFullYear(),
        projectedIncome: Math.round(projectedIncome),
        projectedExpenses: Math.round(projectedExpenses),
        netFlow: Math.round(netFlow),
        projectedBalance: Math.round(runningBalance),
      });
    }

    const totalProjectedIncome = projections.reduce((sum, p) => sum + p.projectedIncome, 0);
    const totalProjectedExpenses = projections.reduce((sum, p) => sum + p.projectedExpenses, 0);
    const totalNetFlow = totalProjectedIncome - totalProjectedExpenses;
    const finalProjectedBalance = projections[projections.length - 1]?.projectedBalance || currentBalance;

    res.json({
      success: true,
      data: {
        currentBalance,
        monthsToProject,
        monthlyProjections: projections,
        summary: {
          totalProjectedIncome,
          totalProjectedExpenses,
          totalNetFlow,
          finalProjectedBalance,
          avgMonthlyIncome: Math.round(avgMonthlyIncomeDop),
          avgMonthlyExpenses: Math.round(avgMonthlyExpensesDop),
        },
        methodology: {
          punctualWindow: 'Últimos 3 meses calendario (ingresos/gastos no recurrentes): promedio del total por mes.',
          recurrent: 'Recurrentes: importe por período según frecuencia convertido a equivalente mensual (misma lógica que el módulo de flujo de caja).',
          balance: 'Saldo inicial: suma de saldos en cuentas bancarias (DOP + USD×tasa del usuario).',
          excluded:
            'No incluye tarjetas de crédito, préstamos, cuentas por pagar/cobrar ni otros módulos; es una vista simplificada de ingresos/gastos registrados.',
        },
      },
    });
  } catch (error: any) {
    console.error('Get projections error:', error);
    res.status(500).json({ message: 'Error fetching projections', error: error.message });
  }
};
