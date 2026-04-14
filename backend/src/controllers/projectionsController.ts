import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getProjections = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { months = '6' } = req.query;

    const monthsToProject = parseInt(months as string);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + monthsToProject);

    // Get user's exchange rate
    const userResult = await query(
      'SELECT exchange_rate_dop_usd FROM users WHERE id = $1',
      [userId]
    );
    const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);

    // Get average monthly income from last 3 months
    const avgIncomeResult = await query(
      `SELECT AVG(total) as avg_income, currency
       FROM (
         SELECT EXTRACT(MONTH FROM date) as month, EXTRACT(YEAR FROM date) as year, SUM(amount) as total, currency
         FROM income
         WHERE user_id = $1
           AND income_type = 'VARIABLE'
           AND date >= CURRENT_DATE - INTERVAL '3 months'
         GROUP BY EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date), currency
       ) subquery
       GROUP BY currency`,
      [userId]
    );

    // Get fixed income
    const fixedIncomeResult = await query(
      `SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1 AND income_type = 'FIXED'
       GROUP BY currency`,
      [userId]
    );

    // Get average monthly expenses from last 3 months
    const avgExpensesResult = await query(
      `SELECT AVG(total) as avg_expenses, currency
       FROM (
         SELECT EXTRACT(MONTH FROM date) as month, EXTRACT(YEAR FROM date) as year, SUM(amount) as total, currency
         FROM expenses
         WHERE user_id = $1
           AND expense_type = 'NON_RECURRING'
           AND date >= CURRENT_DATE - INTERVAL '3 months'
         GROUP BY EXTRACT(MONTH FROM date), EXTRACT(YEAR FROM date), currency
       ) subquery
       GROUP BY currency`,
      [userId]
    );

    // Get recurring monthly expenses
    const recurringExpensesResult = await query(
      `SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1 AND expense_type = 'RECURRING_MONTHLY'
       GROUP BY currency`,
      [userId]
    );

    // Get current balance from bank accounts
    const accountsResult = await query(
      `SELECT SUM(balance_dop) as total_dop, SUM(balance_usd) as total_usd
       FROM bank_accounts
       WHERE user_id = $1`,
      [userId]
    );
    const accounts = accountsResult.rows[0];
    const currentBalance = parseFloat(accounts.total_dop || 0) + (parseFloat(accounts.total_usd || 0) * exchangeRate);

    // Calculate average monthly income in DOP
    let avgMonthlyIncomeDop = 0;
    avgIncomeResult.rows.forEach((row) => {
      const amount = parseFloat(row.avg_income || 0);
      avgMonthlyIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
    });
    fixedIncomeResult.rows.forEach((row) => {
      const amount = parseFloat(row.total || 0);
      avgMonthlyIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
    });

    // Calculate average monthly expenses in DOP
    let avgMonthlyExpensesDop = 0;
    avgExpensesResult.rows.forEach((row) => {
      const amount = parseFloat(row.avg_expenses || 0);
      avgMonthlyExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
    });
    recurringExpensesResult.rows.forEach((row) => {
      const amount = parseFloat(row.total || 0);
      avgMonthlyExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
    });

    // Generate monthly projections
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

    // Calculate summary
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
      },
    });
  } catch (error: any) {
    console.error('Get projections error:', error);
    res.status(500).json({ message: 'Error fetching projections', error: error.message });
  }
};
