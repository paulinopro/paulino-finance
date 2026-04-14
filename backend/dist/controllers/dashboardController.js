"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWeeklyHealth = exports.getDailyHealth = exports.getAnnualHealth = exports.getMonthlyHealth = exports.getStats = exports.getSummary = void 0;
const database_1 = require("../config/database");
const dateUtils_1 = require("../utils/dateUtils");
const getSummary = async (req, res) => {
    try {
        const userId = req.userId;
        // Get user's exchange rate
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        // Total assets (bank accounts)
        const accountsResult = await (0, database_1.query)(`SELECT SUM(balance_dop) as total_dop, SUM(balance_usd) as total_usd
       FROM bank_accounts
       WHERE user_id = $1`, [userId]);
        const accounts = accountsResult.rows[0];
        const totalAssetsDop = parseFloat(accounts.total_dop || 0);
        const totalAssetsUsd = parseFloat(accounts.total_usd || 0);
        // Total debts (credit cards + loans)
        const cardsResult = await (0, database_1.query)(`SELECT SUM(current_debt_dop) as total_dop, SUM(current_debt_usd) as total_usd
       FROM credit_cards
       WHERE user_id = $1`, [userId]);
        const cards = cardsResult.rows[0];
        const totalCardDebtDop = parseFloat(cards.total_dop || 0);
        const totalCardDebtUsd = parseFloat(cards.total_usd || 0);
        const loansResult = await (0, database_1.query)(`SELECT l.total_amount, COALESCE(SUM(lp.amount), 0) as total_paid, l.currency
       FROM loans l
       LEFT JOIN loan_payments lp ON l.id = lp.loan_id
       WHERE l.user_id = $1 AND l.status = 'ACTIVE'
       GROUP BY l.id, l.total_amount, l.currency`, [userId]);
        let totalLoanDebtDop = 0;
        let totalLoanDebtUsd = 0;
        loansResult.rows.forEach((loan) => {
            const remaining = parseFloat(loan.total_amount) - parseFloat(loan.total_paid);
            if (loan.currency === 'DOP') {
                totalLoanDebtDop += remaining;
            }
            else if (loan.currency === 'USD') {
                totalLoanDebtUsd += remaining;
            }
        });
        const totalDebtsDop = totalCardDebtDop + totalLoanDebtDop;
        const totalDebtsUsd = totalCardDebtUsd + totalLoanDebtUsd;
        // Net worth
        const netWorthDop = totalAssetsDop - totalDebtsDop;
        const netWorthUsd = totalAssetsUsd - totalDebtsUsd;
        // Convert everything to DOP for unified view
        const totalAssetsDopUnified = totalAssetsDop + (totalAssetsUsd * exchangeRate);
        const totalDebtsDopUnified = totalDebtsDop + (totalDebtsUsd * exchangeRate);
        const netWorthDopUnified = netWorthDop + (netWorthUsd * exchangeRate);
        // Accounts Payable (Pending)
        const accountsPayableResult = await (0, database_1.query)(`SELECT COUNT(*) as count, SUM(amount) as total, currency
       FROM accounts_payable
       WHERE user_id = $1 AND status = 'PENDING'
       GROUP BY currency`, [userId]);
        let accountsPayableCount = 0;
        let accountsPayableTotalDop = 0;
        accountsPayableResult.rows.forEach((row) => {
            accountsPayableCount += parseInt(row.count);
            const amount = parseFloat(row.total || 0);
            accountsPayableTotalDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Accounts Receivable (Pending)
        const accountsReceivableResult = await (0, database_1.query)(`SELECT COUNT(*) as count, SUM(amount) as total, currency
       FROM accounts_receivable
       WHERE user_id = $1 AND status = 'PENDING'
       GROUP BY currency`, [userId]);
        let accountsReceivableCount = 0;
        let accountsReceivableTotalDop = 0;
        accountsReceivableResult.rows.forEach((row) => {
            accountsReceivableCount += parseInt(row.count);
            const amount = parseFloat(row.total || 0);
            accountsReceivableTotalDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Active Budgets
        const budgetsResult = await (0, database_1.query)(`SELECT COUNT(*) as count
       FROM budgets
       WHERE user_id = $1
         AND (
           (period_type = 'MONTHLY' AND period_month = EXTRACT(MONTH FROM CURRENT_DATE) AND period_year = EXTRACT(YEAR FROM CURRENT_DATE))
           OR (period_type = 'YEARLY' AND period_year = EXTRACT(YEAR FROM CURRENT_DATE))
         )`, [userId]);
        const activeBudgetsCount = parseInt(budgetsResult.rows[0]?.count || 0);
        // Active Financial Goals
        const goalsResult = await (0, database_1.query)(`SELECT COUNT(*) as count
       FROM financial_goals
       WHERE user_id = $1 AND status = 'ACTIVE'`, [userId]);
        const activeGoalsCount = parseInt(goalsResult.rows[0]?.count || 0);
        // Vehicles
        const vehiclesResult = await (0, database_1.query)(`SELECT COUNT(*) as count
       FROM vehicles
       WHERE user_id = $1`, [userId]);
        const vehiclesCount = parseInt(vehiclesResult.rows[0]?.count || 0);
        res.json({
            success: true,
            summary: {
                assets: {
                    dop: totalAssetsDop,
                    usd: totalAssetsUsd,
                    dopUnified: totalAssetsDopUnified,
                },
                debts: {
                    dop: totalDebtsDop,
                    usd: totalDebtsUsd,
                    dopUnified: totalDebtsDopUnified,
                    cards: {
                        dop: totalCardDebtDop,
                        usd: totalCardDebtUsd,
                    },
                    loans: {
                        dop: totalLoanDebtDop,
                        usd: totalLoanDebtUsd,
                    },
                },
                netWorth: {
                    dop: netWorthDop,
                    usd: netWorthUsd,
                    dopUnified: netWorthDopUnified,
                },
                accountsPayable: {
                    count: accountsPayableCount,
                    totalDop: accountsPayableTotalDop,
                },
                accountsReceivable: {
                    count: accountsReceivableCount,
                    totalDop: accountsReceivableTotalDop,
                },
                activeBudgets: activeBudgetsCount,
                activeGoals: activeGoalsCount,
                vehicles: vehiclesCount,
                exchangeRate,
            },
        });
    }
    catch (error) {
        console.error('Get summary error:', error);
        res.status(500).json({ message: 'Error fetching summary', error: error.message });
    }
};
exports.getSummary = getSummary;
const getStats = async (req, res) => {
    try {
        const userId = req.userId;
        const { month, year } = req.query;
        const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        const currentYear = year ? parseInt(year) : new Date().getFullYear();
        // Get user's exchange rate
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        // Expenses by category for the month
        const expensesResult = await (0, database_1.query)(`SELECT category, SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND (
           (expense_type = 'NON_RECURRING' AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3)
           OR (expense_type = 'RECURRING_MONTHLY' AND payment_day IS NOT NULL)
           OR (expense_type = 'ANNUAL' AND payment_month = $2 AND EXTRACT(YEAR FROM date) = $3)
         )
       GROUP BY category, currency`, [userId, currentMonth, currentYear]);
        const expensesByCategory = {};
        expensesResult.rows.forEach((row) => {
            const category = row.category || 'Sin categoría';
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            expensesByCategory[category] = (expensesByCategory[category] || 0) + amountDop;
        });
        // Monthly income vs expenses
        const incomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND (
           (income_type = 'VARIABLE' AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3)
           OR (income_type = 'FIXED' AND receipt_day IS NOT NULL)
         )
       GROUP BY currency`, [userId, currentMonth, currentYear]);
        let totalIncomeDop = 0;
        incomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        let totalExpensesDop = 0;
        Object.values(expensesByCategory).forEach((amount) => {
            totalExpensesDop += amount;
        });
        // Debt progress (loans)
        const loansResult = await (0, database_1.query)(`SELECT l.id, l.loan_name, l.bank_name, l.total_amount, l.paid_installments, l.total_installments,
              COALESCE(SUM(lp.amount), 0) as total_paid, l.currency
       FROM loans l
       LEFT JOIN loan_payments lp ON l.id = lp.loan_id
       WHERE l.user_id = $1 AND l.status = 'ACTIVE'
       GROUP BY l.id, l.loan_name, l.bank_name, l.total_amount, l.paid_installments, l.total_installments, l.currency`, [userId]);
        const debtProgress = loansResult.rows.map((loan) => {
            const totalPaid = parseFloat(loan.total_paid);
            const totalAmount = parseFloat(loan.total_amount);
            const progress = (totalPaid / totalAmount) * 100;
            return {
                id: loan.id,
                loanName: loan.loan_name,
                bankName: loan.bank_name,
                totalAmount: totalAmount,
                totalPaid: totalPaid,
                remaining: totalAmount - totalPaid,
                progress: Math.round(progress * 100) / 100,
                paidInstallments: loan.paid_installments,
                totalInstallments: loan.total_installments,
                currency: loan.currency,
            };
        });
        res.json({
            success: true,
            stats: {
                expensesByCategory,
                incomeVsExpenses: {
                    income: totalIncomeDop,
                    expenses: totalExpensesDop,
                    difference: totalIncomeDop - totalExpensesDop,
                },
                debtProgress,
                exchangeRate,
            },
        });
    }
    catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ message: 'Error fetching stats', error: error.message });
    }
};
exports.getStats = getStats;
const getMonthlyHealth = async (req, res) => {
    try {
        const userId = req.userId;
        const { month, year } = req.query;
        const currentMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        const currentYear = year ? parseInt(year) : new Date().getFullYear();
        // Get user's exchange rate
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        // Monthly income - variable income + fixed income for this month
        const monthStart = new Date(currentYear, currentMonth - 1, 1);
        const monthEnd = new Date(currentYear, currentMonth, 0);
        monthEnd.setHours(23, 59, 59, 999);
        // Variable income
        const incomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND income_type = 'VARIABLE'
         AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
       GROUP BY currency`, [userId, currentMonth, currentYear]);
        let totalIncomeDop = 0;
        incomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Fixed income - calculate based on frequency
        const fixedIncomeResult = await (0, database_1.query)(`SELECT amount, currency, frequency, receipt_day, date
       FROM income
       WHERE user_id = $1 AND income_type = 'FIXED'`, [userId]);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            let dates = [];
            if (frequency === 'MONTHLY' && row.receipt_day) {
                dates = (0, dateUtils_1.calculateMonthlyRecurringDates)(parseInt(row.receipt_day), monthStart, monthEnd);
            }
            else if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && row.date) {
                const startDate = new Date(row.date);
                dates = (0, dateUtils_1.calculateRecurringDates)(startDate, frequency, monthEnd);
                // Filter dates to only include those in the current month
                dates = dates.filter(dateStr => {
                    const date = new Date(dateStr);
                    return date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear;
                });
            }
            totalIncomeDop += amountDop * dates.length;
        });
        // Monthly expenses - non-recurring + recurring monthly + annual for this month
        const expensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND (
           (expense_type = 'NON_RECURRING' AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3)
           OR (expense_type = 'RECURRING_MONTHLY' AND payment_day IS NOT NULL)
           OR (expense_type = 'ANNUAL' AND payment_month = $2 AND EXTRACT(YEAR FROM date) = $3)
         )
       GROUP BY currency`, [userId, currentMonth, currentYear]);
        let totalExpensesDop = 0;
        expensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Expenses by category
        const expensesByCategoryResult = await (0, database_1.query)(`SELECT category, SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND (
           (expense_type = 'NON_RECURRING' AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3)
           OR (expense_type = 'RECURRING_MONTHLY' AND payment_day IS NOT NULL)
           OR (expense_type = 'ANNUAL' AND payment_month = $2 AND EXTRACT(YEAR FROM date) = $3)
         )
       GROUP BY category, currency`, [userId, currentMonth, currentYear]);
        const expensesByCategory = {};
        expensesByCategoryResult.rows.forEach((row) => {
            const category = row.category || 'Sin categoría';
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            expensesByCategory[category] = (expensesByCategory[category] || 0) + amountDop;
        });
        // Total debts
        const cardsResult = await (0, database_1.query)(`SELECT SUM(current_debt_dop) as total_dop, SUM(current_debt_usd) as total_usd
       FROM credit_cards
       WHERE user_id = $1`, [userId]);
        const cards = cardsResult.rows[0];
        const totalCardDebtDop = parseFloat(cards.total_dop || 0);
        const totalCardDebtUsd = parseFloat(cards.total_usd || 0);
        const loansResult = await (0, database_1.query)(`SELECT l.total_amount, COALESCE(SUM(lp.amount), 0) as total_paid, l.currency
       FROM loans l
       LEFT JOIN loan_payments lp ON l.id = lp.loan_id
       WHERE l.user_id = $1 AND l.status = 'ACTIVE'
       GROUP BY l.id, l.total_amount, l.currency`, [userId]);
        let totalLoanDebtDop = 0;
        let totalLoanDebtUsd = 0;
        loansResult.rows.forEach((loan) => {
            const remaining = parseFloat(loan.total_amount) - parseFloat(loan.total_paid);
            if (loan.currency === 'DOP') {
                totalLoanDebtDop += remaining;
            }
            else if (loan.currency === 'USD') {
                totalLoanDebtUsd += remaining;
            }
        });
        const totalDebtsDop = totalCardDebtDop + totalLoanDebtDop + (totalCardDebtUsd + totalLoanDebtUsd) * exchangeRate;
        // Calculate financial health metrics
        const savings = totalIncomeDop - totalExpensesDop;
        const savingsRate = totalIncomeDop > 0 ? (savings / totalIncomeDop) * 100 : 0;
        const debtToIncomeRatio = totalIncomeDop > 0 ? (totalDebtsDop / totalIncomeDop) * 100 : 0;
        const expenseToIncomeRatio = totalIncomeDop > 0 ? (totalExpensesDop / totalIncomeDop) * 100 : 0;
        // Financial health score (0-100)
        let healthScore = 100;
        if (savingsRate < 0)
            healthScore -= 30; // Negative savings
        else if (savingsRate < 10)
            healthScore -= 15; // Low savings
        else if (savingsRate >= 20)
            healthScore += 10; // Good savings
        if (debtToIncomeRatio > 40)
            healthScore -= 25; // High debt
        else if (debtToIncomeRatio > 30)
            healthScore -= 15;
        else if (debtToIncomeRatio < 20)
            healthScore += 10; // Low debt
        if (expenseToIncomeRatio > 90)
            healthScore -= 20; // High expenses
        else if (expenseToIncomeRatio < 70)
            healthScore += 10; // Low expenses
        healthScore = Math.max(0, Math.min(100, healthScore));
        // Monthly trend (compare with previous month)
        const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
        const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
        // Previous month income
        const prevMonthStart = new Date(prevYear, prevMonth - 1, 1);
        const prevMonthEnd = new Date(prevYear, prevMonth, 0);
        prevMonthEnd.setHours(23, 59, 59, 999);
        const prevIncomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND income_type = 'VARIABLE'
         AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
       GROUP BY currency`, [userId, prevMonth, prevYear]);
        let prevIncomeDop = 0;
        prevIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Add fixed income for previous month
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            let dates = [];
            if (frequency === 'MONTHLY' && row.receipt_day) {
                dates = (0, dateUtils_1.calculateMonthlyRecurringDates)(parseInt(row.receipt_day), prevMonthStart, prevMonthEnd);
            }
            else if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && row.date) {
                const startDate = new Date(row.date);
                dates = (0, dateUtils_1.calculateRecurringDates)(startDate, frequency, prevMonthEnd);
                // Filter dates to only include those in the previous month
                dates = dates.filter(dateStr => {
                    const date = new Date(dateStr);
                    return date.getMonth() + 1 === prevMonth && date.getFullYear() === prevYear;
                });
            }
            prevIncomeDop += amountDop * dates.length;
        });
        // Previous month expenses
        const prevExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND (
           (expense_type = 'NON_RECURRING' AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3)
           OR (expense_type = 'RECURRING_MONTHLY' AND payment_day IS NOT NULL)
           OR (expense_type = 'ANNUAL' AND payment_month = $2 AND EXTRACT(YEAR FROM date) = $3)
         )
       GROUP BY currency`, [userId, prevMonth, prevYear]);
        let prevExpensesDop = 0;
        prevExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        const incomeChange = prevIncomeDop > 0 ? ((totalIncomeDop - prevIncomeDop) / prevIncomeDop) * 100 : 0;
        const expensesChange = prevExpensesDop > 0 ? ((totalExpensesDop - prevExpensesDop) / prevExpensesDop) * 100 : 0;
        res.json({
            success: true,
            data: {
                month: currentMonth,
                year: currentYear,
                income: {
                    total: totalIncomeDop,
                    change: incomeChange,
                },
                expenses: {
                    total: totalExpensesDop,
                    change: expensesChange,
                    byCategory: expensesByCategory,
                },
                savings: {
                    amount: savings,
                    rate: savingsRate,
                },
                debts: {
                    total: totalDebtsDop,
                    cards: totalCardDebtDop + totalCardDebtUsd * exchangeRate,
                    loans: totalLoanDebtDop + totalLoanDebtUsd * exchangeRate,
                },
                ratios: {
                    debtToIncome: debtToIncomeRatio,
                    expenseToIncome: expenseToIncomeRatio,
                },
                healthScore,
                exchangeRate,
            },
        });
    }
    catch (error) {
        console.error('Get monthly health error:', error);
        res.status(500).json({ message: 'Error fetching monthly health', error: error.message });
    }
};
exports.getMonthlyHealth = getMonthlyHealth;
const getAnnualHealth = async (req, res) => {
    try {
        const userId = req.userId;
        const { year } = req.query;
        const currentYear = year ? parseInt(year) : new Date().getFullYear();
        // Get user's exchange rate
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        // Annual income - only variable income by month
        const incomeResult = await (0, database_1.query)(`SELECT 
         EXTRACT(MONTH FROM date) as month,
         SUM(amount) as total, 
         currency
       FROM income
       WHERE user_id = $1
         AND income_type = 'VARIABLE'
         AND EXTRACT(YEAR FROM date) = $2
       GROUP BY EXTRACT(MONTH FROM date), currency
       ORDER BY month`, [userId, currentYear]);
        const monthlyIncome = {};
        let totalIncomeDop = 0;
        incomeResult.rows.forEach((row) => {
            const month = parseInt(row.month);
            const amount = parseFloat(row.total || 0);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            monthlyIncome[month] = (monthlyIncome[month] || 0) + amountDop;
            totalIncomeDop += amountDop;
        });
        // Add fixed income for all months
        const yearStart = new Date(currentYear, 0, 1);
        const yearEnd = new Date(currentYear, 11, 31);
        yearEnd.setHours(23, 59, 59, 999);
        const fixedIncomeResult = await (0, database_1.query)(`SELECT amount, currency, frequency, receipt_day, date
       FROM income
       WHERE user_id = $1 AND income_type = 'FIXED'`, [userId]);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            let dates = [];
            if (frequency === 'MONTHLY' && row.receipt_day) {
                dates = (0, dateUtils_1.calculateMonthlyRecurringDates)(parseInt(row.receipt_day), yearStart, yearEnd);
            }
            else if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && row.date) {
                const startDate = new Date(row.date);
                dates = (0, dateUtils_1.calculateRecurringDates)(startDate, frequency, yearEnd);
                // Filter dates to only include those in the current year
                dates = dates.filter(dateStr => {
                    const date = new Date(dateStr);
                    return date.getFullYear() === currentYear;
                });
            }
            // Distribute dates across months
            dates.forEach((dateStr) => {
                const date = new Date(dateStr);
                const month = date.getMonth() + 1;
                monthlyIncome[month] = (monthlyIncome[month] || 0) + amountDop;
            });
            totalIncomeDop += amountDop * dates.length;
        });
        // Annual expenses - only non-recurring and annual expenses by month
        const expensesResult = await (0, database_1.query)(`SELECT 
         EXTRACT(MONTH FROM date) as month,
         SUM(amount) as total, 
         currency
       FROM expenses
       WHERE user_id = $1
         AND (
           (expense_type = 'NON_RECURRING' AND EXTRACT(YEAR FROM date) = $2)
           OR (expense_type = 'ANNUAL' AND EXTRACT(YEAR FROM date) = $2)
         )
       GROUP BY EXTRACT(MONTH FROM date), currency
       ORDER BY month`, [userId, currentYear]);
        const monthlyExpenses = {};
        let totalExpensesDop = 0;
        expensesResult.rows.forEach((row) => {
            const month = parseInt(row.month);
            const amount = parseFloat(row.total || 0);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            monthlyExpenses[month] = (monthlyExpenses[month] || 0) + amountDop;
            totalExpensesDop += amountDop;
        });
        // Add recurring monthly expenses for all months
        const recurringExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1 AND expense_type = 'RECURRING_MONTHLY'
       GROUP BY currency`, [userId]);
        recurringExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            for (let month = 1; month <= 12; month++) {
                monthlyExpenses[month] = (monthlyExpenses[month] || 0) + amountDop;
            }
            totalExpensesDop += amountDop * 12;
        });
        // Expenses by category for the year (avoid duplication)
        const expensesByCategoryResult = await (0, database_1.query)(`SELECT category, SUM(amount) as total, currency, expense_type
       FROM expenses
       WHERE user_id = $1
         AND (
           (expense_type = 'NON_RECURRING' AND EXTRACT(YEAR FROM date) = $2)
           OR (expense_type = 'RECURRING_MONTHLY')
           OR (expense_type = 'ANNUAL' AND EXTRACT(YEAR FROM date) = $2)
         )
       GROUP BY category, currency, expense_type`, [userId, currentYear]);
        const expensesByCategory = {};
        expensesByCategoryResult.rows.forEach((row) => {
            const category = row.category || 'Sin categoría';
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            // For recurring monthly, multiply by 12 for annual total
            const finalAmount = row.expense_type === 'RECURRING_MONTHLY' ? amountDop * 12 : amountDop;
            expensesByCategory[category] = (expensesByCategory[category] || 0) + finalAmount;
        });
        // Total debts
        const cardsResult = await (0, database_1.query)(`SELECT SUM(current_debt_dop) as total_dop, SUM(current_debt_usd) as total_usd
       FROM credit_cards
       WHERE user_id = $1`, [userId]);
        const cards = cardsResult.rows[0];
        const totalCardDebtDop = parseFloat(cards.total_dop || 0);
        const totalCardDebtUsd = parseFloat(cards.total_usd || 0);
        const loansResult = await (0, database_1.query)(`SELECT l.total_amount, COALESCE(SUM(lp.amount), 0) as total_paid, l.currency
       FROM loans l
       LEFT JOIN loan_payments lp ON l.id = lp.loan_id
       WHERE l.user_id = $1 AND l.status = 'ACTIVE'
       GROUP BY l.id, l.total_amount, l.currency`, [userId]);
        let totalLoanDebtDop = 0;
        let totalLoanDebtUsd = 0;
        loansResult.rows.forEach((loan) => {
            const remaining = parseFloat(loan.total_amount) - parseFloat(loan.total_paid);
            if (loan.currency === 'DOP') {
                totalLoanDebtDop += remaining;
            }
            else if (loan.currency === 'USD') {
                totalLoanDebtUsd += remaining;
            }
        });
        const totalDebtsDop = totalCardDebtDop + totalLoanDebtDop + (totalCardDebtUsd + totalLoanDebtUsd) * exchangeRate;
        // Calculate financial health metrics
        const savings = totalIncomeDop - totalExpensesDop;
        const savingsRate = totalIncomeDop > 0 ? (savings / totalIncomeDop) * 100 : 0;
        const debtToIncomeRatio = totalIncomeDop > 0 ? (totalDebtsDop / totalIncomeDop) * 100 : 0;
        const expenseToIncomeRatio = totalIncomeDop > 0 ? (totalExpensesDop / totalIncomeDop) * 100 : 0;
        // Financial health score (0-100)
        let healthScore = 100;
        if (savingsRate < 0)
            healthScore -= 30;
        else if (savingsRate < 10)
            healthScore -= 15;
        else if (savingsRate >= 20)
            healthScore += 10;
        if (debtToIncomeRatio > 40)
            healthScore -= 25;
        else if (debtToIncomeRatio > 30)
            healthScore -= 15;
        else if (debtToIncomeRatio < 20)
            healthScore += 10;
        if (expenseToIncomeRatio > 90)
            healthScore -= 20;
        else if (expenseToIncomeRatio < 70)
            healthScore += 10;
        healthScore = Math.max(0, Math.min(100, healthScore));
        // Prepare monthly data for charts
        const monthlyData = [];
        for (let month = 1; month <= 12; month++) {
            monthlyData.push({
                month: month,
                monthName: new Date(currentYear, month - 1, 1).toLocaleDateString('es-DO', { month: 'short' }),
                income: monthlyIncome[month] || 0,
                expenses: monthlyExpenses[month] || 0,
                savings: (monthlyIncome[month] || 0) - (monthlyExpenses[month] || 0),
            });
        }
        // Compare with previous year
        const prevYear = currentYear - 1;
        // Previous year variable income
        const prevIncomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND income_type = 'VARIABLE'
         AND EXTRACT(YEAR FROM date) = $2
       GROUP BY currency`, [userId, prevYear]);
        let prevIncomeDop = 0;
        prevIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Add fixed income for previous year
        const prevYearStart = new Date(prevYear, 0, 1);
        const prevYearEnd = new Date(prevYear, 11, 31);
        prevYearEnd.setHours(23, 59, 59, 999);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            let dates = [];
            if (frequency === 'MONTHLY' && row.receipt_day) {
                dates = (0, dateUtils_1.calculateMonthlyRecurringDates)(parseInt(row.receipt_day), prevYearStart, prevYearEnd);
            }
            else if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && row.date) {
                const startDate = new Date(row.date);
                dates = (0, dateUtils_1.calculateRecurringDates)(startDate, frequency, prevYearEnd);
                // Filter dates to only include those in the previous year
                dates = dates.filter(dateStr => {
                    const date = new Date(dateStr);
                    return date.getFullYear() === prevYear;
                });
            }
            prevIncomeDop += amountDop * dates.length;
        });
        // Previous year expenses
        const prevExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND (
           (expense_type = 'NON_RECURRING' AND EXTRACT(YEAR FROM date) = $2)
           OR (expense_type = 'ANNUAL' AND EXTRACT(YEAR FROM date) = $2)
         )
       GROUP BY currency`, [userId, prevYear]);
        let prevExpensesDop = 0;
        prevExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Add recurring expenses for previous year (same as current year since it's recurring)
        recurringExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            prevExpensesDop += amountDop * 12;
        });
        const incomeChange = prevIncomeDop > 0 ? ((totalIncomeDop - prevIncomeDop) / prevIncomeDop) * 100 : 0;
        const expensesChange = prevExpensesDop > 0 ? ((totalExpensesDop - prevExpensesDop) / prevExpensesDop) * 100 : 0;
        res.json({
            success: true,
            data: {
                year: currentYear,
                income: {
                    total: totalIncomeDop,
                    change: incomeChange,
                    monthly: monthlyData.map((d) => ({ month: d.monthName, value: d.income })),
                },
                expenses: {
                    total: totalExpensesDop,
                    change: expensesChange,
                    monthly: monthlyData.map((d) => ({ month: d.monthName, value: d.expenses })),
                    byCategory: expensesByCategory,
                },
                savings: {
                    amount: savings,
                    rate: savingsRate,
                    monthly: monthlyData.map((d) => ({ month: d.monthName, value: d.savings })),
                },
                debts: {
                    total: totalDebtsDop,
                    cards: totalCardDebtDop + totalCardDebtUsd * exchangeRate,
                    loans: totalLoanDebtDop + totalLoanDebtUsd * exchangeRate,
                },
                ratios: {
                    debtToIncome: debtToIncomeRatio,
                    expenseToIncome: expenseToIncomeRatio,
                },
                healthScore,
                monthlyData,
                exchangeRate,
            },
        });
    }
    catch (error) {
        console.error('Get annual health error:', error);
        res.status(500).json({ message: 'Error fetching annual health', error: error.message });
    }
};
exports.getAnnualHealth = getAnnualHealth;
const getDailyHealth = async (req, res) => {
    try {
        const userId = req.userId;
        const { date } = req.query;
        const targetDate = date ? new Date(date) : new Date();
        const targetYear = targetDate.getFullYear();
        const targetMonth = targetDate.getMonth() + 1;
        const targetDay = targetDate.getDate();
        // Get user's exchange rate
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        // Daily income - variable income
        const incomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND income_type = 'VARIABLE'
         AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(DAY FROM date) = $4
       GROUP BY currency`, [userId, targetYear, targetMonth, targetDay]);
        let totalIncomeDop = 0;
        incomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Add fixed income for the day
        const targetDateObj = new Date(targetYear, targetMonth - 1, targetDay);
        const fixedIncomeResult = await (0, database_1.query)(`SELECT amount, currency, frequency, receipt_day, date
       FROM income
       WHERE user_id = $1 AND income_type = 'FIXED'`, [userId]);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            let shouldInclude = false;
            if (frequency === 'MONTHLY' && row.receipt_day) {
                // For monthly, check if day of month matches
                shouldInclude = targetDay === parseInt(row.receipt_day);
            }
            else if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && row.date) {
                // For weekly/biweekly, check if target date is in the recurring dates
                const startDate = new Date(row.date);
                const dates = (0, dateUtils_1.calculateRecurringDates)(startDate, frequency, targetDateObj);
                shouldInclude = dates.includes(targetDateObj.toISOString().split('T')[0]);
            }
            if (shouldInclude) {
                totalIncomeDop += amountDop;
            }
        });
        // Daily expenses
        const expensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND (
           (expense_type = 'NON_RECURRING' AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(DAY FROM date) = $4)
           OR (expense_type = 'RECURRING_MONTHLY' AND payment_day = $4)
           OR (expense_type = 'ANNUAL' AND payment_month = $3 AND payment_day = $4)
         )
       GROUP BY currency`, [userId, targetYear, targetMonth, targetDay]);
        let totalExpensesDop = 0;
        expensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Expenses by category
        const expensesByCategoryResult = await (0, database_1.query)(`SELECT category, SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND (
           (expense_type = 'NON_RECURRING' AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(DAY FROM date) = $4)
           OR (expense_type = 'RECURRING_MONTHLY' AND payment_day = $4)
           OR (expense_type = 'ANNUAL' AND payment_month = $3 AND payment_day = $4)
         )
       GROUP BY category, currency`, [userId, targetYear, targetMonth, targetDay]);
        const expensesByCategory = {};
        expensesByCategoryResult.rows.forEach((row) => {
            const category = row.category || 'Sin categoría';
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            expensesByCategory[category] = (expensesByCategory[category] || 0) + amountDop;
        });
        // Total debts
        const cardsResult = await (0, database_1.query)(`SELECT SUM(current_debt_dop) as total_dop, SUM(current_debt_usd) as total_usd
       FROM credit_cards
       WHERE user_id = $1`, [userId]);
        const cards = cardsResult.rows[0];
        const totalCardDebtDop = parseFloat(cards.total_dop || 0);
        const totalCardDebtUsd = parseFloat(cards.total_usd || 0);
        const loansResult = await (0, database_1.query)(`SELECT l.total_amount, COALESCE(SUM(lp.amount), 0) as total_paid, l.currency
       FROM loans l
       LEFT JOIN loan_payments lp ON l.id = lp.loan_id
       WHERE l.user_id = $1 AND l.status = 'ACTIVE'
       GROUP BY l.id, l.total_amount, l.currency`, [userId]);
        let totalLoanDebtDop = 0;
        let totalLoanDebtUsd = 0;
        loansResult.rows.forEach((loan) => {
            const remaining = parseFloat(loan.total_amount) - parseFloat(loan.total_paid);
            if (loan.currency === 'DOP') {
                totalLoanDebtDop += remaining;
            }
            else if (loan.currency === 'USD') {
                totalLoanDebtUsd += remaining;
            }
        });
        const totalDebtsDop = totalCardDebtDop + totalLoanDebtDop + (totalCardDebtUsd + totalLoanDebtUsd) * exchangeRate;
        // Calculate financial health metrics
        const savings = totalIncomeDop - totalExpensesDop;
        const savingsRate = totalIncomeDop > 0 ? (savings / totalIncomeDop) * 100 : 0;
        const debtToIncomeRatio = totalIncomeDop > 0 ? (totalDebtsDop / totalIncomeDop) * 100 : 0;
        const expenseToIncomeRatio = totalIncomeDop > 0 ? (totalExpensesDop / totalIncomeDop) * 100 : 0;
        // Financial health score (0-100)
        let healthScore = 100;
        if (savingsRate < 0)
            healthScore -= 30;
        else if (savingsRate < 10)
            healthScore -= 15;
        else if (savingsRate >= 20)
            healthScore += 10;
        if (debtToIncomeRatio > 40)
            healthScore -= 25;
        else if (debtToIncomeRatio > 30)
            healthScore -= 15;
        else if (debtToIncomeRatio < 20)
            healthScore += 10;
        if (expenseToIncomeRatio > 90)
            healthScore -= 20;
        else if (expenseToIncomeRatio < 70)
            healthScore += 10;
        healthScore = Math.max(0, Math.min(100, healthScore));
        // Compare with previous day
        const prevDate = new Date(targetDate);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevYear = prevDate.getFullYear();
        const prevMonth = prevDate.getMonth() + 1;
        const prevDay = prevDate.getDate();
        // Previous day income - variable
        const prevIncomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND income_type = 'VARIABLE'
         AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(DAY FROM date) = $4
       GROUP BY currency`, [userId, prevYear, prevMonth, prevDay]);
        let prevIncomeDop = 0;
        prevIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Add fixed income for previous day
        const prevDateObj = new Date(prevYear, prevMonth - 1, prevDay);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            let shouldInclude = false;
            if (frequency === 'MONTHLY' && row.receipt_day) {
                shouldInclude = prevDay === parseInt(row.receipt_day);
            }
            else if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && row.date) {
                const startDate = new Date(row.date);
                const dates = (0, dateUtils_1.calculateRecurringDates)(startDate, frequency, prevDateObj);
                shouldInclude = dates.includes(prevDateObj.toISOString().split('T')[0]);
            }
            if (shouldInclude) {
                prevIncomeDop += amountDop;
            }
        });
        const prevExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND (
           (expense_type = 'NON_RECURRING' AND EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(DAY FROM date) = $4)
           OR (expense_type = 'RECURRING_MONTHLY' AND payment_day = $4)
           OR (expense_type = 'ANNUAL' AND payment_month = $3 AND payment_day = $4)
         )
       GROUP BY currency`, [userId, prevYear, prevMonth, prevDay]);
        let prevExpensesDop = 0;
        prevExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        const incomeChange = prevIncomeDop > 0 ? ((totalIncomeDop - prevIncomeDop) / prevIncomeDop) * 100 : 0;
        const expensesChange = prevExpensesDop > 0 ? ((totalExpensesDop - prevExpensesDop) / prevExpensesDop) * 100 : 0;
        res.json({
            success: true,
            data: {
                date: targetDate.toISOString().split('T')[0],
                income: {
                    total: totalIncomeDop,
                    change: incomeChange,
                },
                expenses: {
                    total: totalExpensesDop,
                    change: expensesChange,
                    byCategory: expensesByCategory,
                },
                savings: {
                    amount: savings,
                    rate: savingsRate,
                },
                debts: {
                    total: totalDebtsDop,
                    cards: totalCardDebtDop + totalCardDebtUsd * exchangeRate,
                    loans: totalLoanDebtDop + totalLoanDebtUsd * exchangeRate,
                },
                ratios: {
                    debtToIncome: debtToIncomeRatio,
                    expenseToIncome: expenseToIncomeRatio,
                },
                healthScore,
                exchangeRate,
            },
        });
    }
    catch (error) {
        console.error('Get daily health error:', error);
        res.status(500).json({ message: 'Error fetching daily health', error: error.message });
    }
};
exports.getDailyHealth = getDailyHealth;
const getWeeklyHealth = async (req, res) => {
    try {
        const userId = req.userId;
        const { weekStart } = req.query;
        let startDate;
        if (weekStart) {
            startDate = new Date(weekStart);
        }
        else {
            // Get start of current week (Monday)
            startDate = new Date();
            const day = startDate.getDay();
            const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
            startDate.setDate(diff);
            startDate.setHours(0, 0, 0, 0);
        }
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        // Get user's exchange rate
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        // Weekly income - variable income in the week
        const incomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND income_type = 'VARIABLE'
         AND date >= $2 AND date <= $3
       GROUP BY currency`, [userId, startDate, endDate]);
        let totalIncomeDop = 0;
        incomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Add fixed income that falls within the week
        const weekStartDay = startDate.getDate();
        const weekEndDay = endDate.getDate();
        const weekStartMonth = startDate.getMonth() + 1;
        const weekEndMonth = endDate.getMonth() + 1;
        const fixedIncomeResult = await (0, database_1.query)(`SELECT amount, currency, frequency, receipt_day, date
       FROM income
       WHERE user_id = $1 AND income_type = 'FIXED'`, [userId]);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            let dates = [];
            if (frequency === 'MONTHLY' && row.receipt_day) {
                // For monthly, check if receipt_day falls within the week
                const receiptDay = parseInt(row.receipt_day);
                if ((weekStartMonth === weekEndMonth && receiptDay >= weekStartDay && receiptDay <= weekEndDay) ||
                    (weekStartMonth !== weekEndMonth && (receiptDay >= weekStartDay || receiptDay <= weekEndDay))) {
                    dates = [startDate.toISOString().split('T')[0]]; // Add one occurrence
                }
            }
            else if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && row.date) {
                // For weekly/biweekly, calculate dates from start date
                const startDate = new Date(row.date);
                dates = (0, dateUtils_1.calculateRecurringDates)(startDate, frequency, endDate);
                // Filter dates to only include those in the current week
                dates = dates.filter(dateStr => {
                    const date = new Date(dateStr);
                    return date >= startDate && date <= endDate;
                });
            }
            totalIncomeDop += amountDop * dates.length;
        });
        // Weekly expenses - non-recurring
        const expensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND expense_type = 'NON_RECURRING'
         AND date >= $2 AND date <= $3
       GROUP BY currency`, [userId, startDate, endDate]);
        let totalExpensesDop = 0;
        expensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // weekStartDay, weekEndDay, weekStartMonth, weekEndMonth already defined above
        const recurringExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency, payment_day
       FROM expenses
       WHERE user_id = $1 AND expense_type = 'RECURRING_MONTHLY' AND payment_day IS NOT NULL
       GROUP BY currency, payment_day`, [userId]);
        recurringExpensesResult.rows.forEach((row) => {
            const paymentDay = parseInt(row.payment_day);
            // Check if payment day falls within the week
            if ((weekStartMonth === weekEndMonth && paymentDay >= weekStartDay && paymentDay <= weekEndDay) ||
                (weekStartMonth !== weekEndMonth && (paymentDay >= weekStartDay || paymentDay <= weekEndDay))) {
                const amount = parseFloat(row.total || 0);
                totalExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
            }
        });
        // Add annual expenses if they fall within the week
        const annualExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency, payment_month, payment_day
       FROM expenses
       WHERE user_id = $1 AND expense_type = 'ANNUAL' AND payment_month IS NOT NULL AND payment_day IS NOT NULL
       GROUP BY currency, payment_month, payment_day`, [userId]);
        annualExpensesResult.rows.forEach((row) => {
            const paymentMonth = parseInt(row.payment_month);
            const paymentDay = parseInt(row.payment_day);
            if (paymentMonth === weekStartMonth &&
                paymentDay >= weekStartDay &&
                paymentDay <= (weekStartMonth === weekEndMonth ? weekEndDay : 31)) {
                const amount = parseFloat(row.total || 0);
                totalExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
            }
        });
        // Expenses by category
        const expensesByCategoryResult = await (0, database_1.query)(`SELECT category, SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND expense_type = 'NON_RECURRING'
         AND date >= $2 AND date <= $3
       GROUP BY category, currency`, [userId, startDate, endDate]);
        const expensesByCategory = {};
        expensesByCategoryResult.rows.forEach((row) => {
            const category = row.category || 'Sin categoría';
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            expensesByCategory[category] = (expensesByCategory[category] || 0) + amountDop;
        });
        // Add recurring expenses to categories
        recurringExpensesResult.rows.forEach((row) => {
            const paymentDay = parseInt(row.payment_day);
            if ((weekStartMonth === weekEndMonth && paymentDay >= weekStartDay && paymentDay <= weekEndDay) ||
                (weekStartMonth !== weekEndMonth && (paymentDay >= weekStartDay || paymentDay <= weekEndDay))) {
                const category = 'Recurrente Mensual';
                const amount = parseFloat(row.total || 0);
                const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
                expensesByCategory[category] = (expensesByCategory[category] || 0) + amountDop;
            }
        });
        annualExpensesResult.rows.forEach((row) => {
            const paymentMonth = parseInt(row.payment_month);
            const paymentDay = parseInt(row.payment_day);
            if (paymentMonth === weekStartMonth &&
                paymentDay >= weekStartDay &&
                paymentDay <= (weekStartMonth === weekEndMonth ? weekEndDay : 31)) {
                const category = 'Anual';
                const amount = parseFloat(row.total || 0);
                const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
                expensesByCategory[category] = (expensesByCategory[category] || 0) + amountDop;
            }
        });
        // Total debts
        const cardsResult = await (0, database_1.query)(`SELECT SUM(current_debt_dop) as total_dop, SUM(current_debt_usd) as total_usd
       FROM credit_cards
       WHERE user_id = $1`, [userId]);
        const cards = cardsResult.rows[0];
        const totalCardDebtDop = parseFloat(cards.total_dop || 0);
        const totalCardDebtUsd = parseFloat(cards.total_usd || 0);
        const loansResult = await (0, database_1.query)(`SELECT l.total_amount, COALESCE(SUM(lp.amount), 0) as total_paid, l.currency
       FROM loans l
       LEFT JOIN loan_payments lp ON l.id = lp.loan_id
       WHERE l.user_id = $1 AND l.status = 'ACTIVE'
       GROUP BY l.id, l.total_amount, l.currency`, [userId]);
        let totalLoanDebtDop = 0;
        let totalLoanDebtUsd = 0;
        loansResult.rows.forEach((loan) => {
            const remaining = parseFloat(loan.total_amount) - parseFloat(loan.total_paid);
            if (loan.currency === 'DOP') {
                totalLoanDebtDop += remaining;
            }
            else if (loan.currency === 'USD') {
                totalLoanDebtUsd += remaining;
            }
        });
        const totalDebtsDop = totalCardDebtDop + totalLoanDebtDop + (totalCardDebtUsd + totalLoanDebtUsd) * exchangeRate;
        // Calculate financial health metrics
        const savings = totalIncomeDop - totalExpensesDop;
        const savingsRate = totalIncomeDop > 0 ? (savings / totalIncomeDop) * 100 : 0;
        const debtToIncomeRatio = totalIncomeDop > 0 ? (totalDebtsDop / totalIncomeDop) * 100 : 0;
        const expenseToIncomeRatio = totalIncomeDop > 0 ? (totalExpensesDop / totalIncomeDop) * 100 : 0;
        // Financial health score (0-100)
        let healthScore = 100;
        if (savingsRate < 0)
            healthScore -= 30;
        else if (savingsRate < 10)
            healthScore -= 15;
        else if (savingsRate >= 20)
            healthScore += 10;
        if (debtToIncomeRatio > 40)
            healthScore -= 25;
        else if (debtToIncomeRatio > 30)
            healthScore -= 15;
        else if (debtToIncomeRatio < 20)
            healthScore += 10;
        if (expenseToIncomeRatio > 90)
            healthScore -= 20;
        else if (expenseToIncomeRatio < 70)
            healthScore += 10;
        healthScore = Math.max(0, Math.min(100, healthScore));
        // Compare with previous week
        const prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - 7);
        const prevEndDate = new Date(prevStartDate);
        prevEndDate.setDate(prevEndDate.getDate() + 6);
        prevEndDate.setHours(23, 59, 59, 999);
        const prevWeekStartDay = prevStartDate.getDate();
        const prevWeekEndDay = prevEndDate.getDate();
        const prevWeekStartMonth = prevStartDate.getMonth() + 1;
        const prevWeekEndMonth = prevEndDate.getMonth() + 1;
        // Previous week income - variable income
        const prevIncomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND income_type = 'VARIABLE'
         AND date >= $2 AND date <= $3
       GROUP BY currency`, [userId, prevStartDate, prevEndDate]);
        let prevIncomeDop = 0;
        prevIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Add fixed income for previous week
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            let dates = [];
            if (frequency === 'MONTHLY' && row.receipt_day) {
                // For monthly, check if receipt_day falls within the previous week
                const receiptDay = parseInt(row.receipt_day);
                if ((prevWeekStartMonth === prevWeekEndMonth && receiptDay >= prevWeekStartDay && receiptDay <= prevWeekEndDay) ||
                    (prevWeekStartMonth !== prevWeekEndMonth && (receiptDay >= prevWeekStartDay || receiptDay <= prevWeekEndDay))) {
                    dates = [prevStartDate.toISOString().split('T')[0]]; // Add one occurrence
                }
            }
            else if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && row.date) {
                // For weekly/biweekly, calculate dates from start date
                const startDate = new Date(row.date);
                dates = (0, dateUtils_1.calculateRecurringDates)(startDate, frequency, prevEndDate);
                // Filter dates to only include those in the previous week
                dates = dates.filter(dateStr => {
                    const date = new Date(dateStr);
                    return date >= prevStartDate && date <= prevEndDate;
                });
            }
            prevIncomeDop += amountDop * dates.length;
        });
        // Previous week expenses
        const prevExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND expense_type = 'NON_RECURRING'
         AND date >= $2 AND date <= $3
       GROUP BY currency`, [userId, prevStartDate, prevEndDate]);
        let prevExpensesDop = 0;
        prevExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Add recurring expenses for previous week
        recurringExpensesResult.rows.forEach((row) => {
            const paymentDay = parseInt(row.payment_day);
            if ((prevWeekStartMonth === prevWeekEndMonth && paymentDay >= prevWeekStartDay && paymentDay <= prevWeekEndDay) ||
                (prevWeekStartMonth !== prevWeekEndMonth && (paymentDay >= prevWeekStartDay || paymentDay <= prevWeekEndDay))) {
                const amount = parseFloat(row.total || 0);
                prevExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
            }
        });
        annualExpensesResult.rows.forEach((row) => {
            const paymentMonth = parseInt(row.payment_month);
            const paymentDay = parseInt(row.payment_day);
            if (paymentMonth === prevWeekStartMonth &&
                paymentDay >= prevWeekStartDay &&
                paymentDay <= (prevWeekStartMonth === prevWeekEndMonth ? prevWeekEndDay : 31)) {
                const amount = parseFloat(row.total || 0);
                prevExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
            }
        });
        const incomeChange = prevIncomeDop > 0 ? ((totalIncomeDop - prevIncomeDop) / prevIncomeDop) * 100 : 0;
        const expensesChange = prevExpensesDop > 0 ? ((totalExpensesDop - prevExpensesDop) / prevExpensesDop) * 100 : 0;
        res.json({
            success: true,
            data: {
                weekStart: startDate.toISOString().split('T')[0],
                weekEnd: endDate.toISOString().split('T')[0],
                income: {
                    total: totalIncomeDop,
                    change: incomeChange,
                },
                expenses: {
                    total: totalExpensesDop,
                    change: expensesChange,
                    byCategory: expensesByCategory,
                },
                savings: {
                    amount: savings,
                    rate: savingsRate,
                },
                debts: {
                    total: totalDebtsDop,
                    cards: totalCardDebtDop + totalCardDebtUsd * exchangeRate,
                    loans: totalLoanDebtDop + totalLoanDebtUsd * exchangeRate,
                },
                ratios: {
                    debtToIncome: debtToIncomeRatio,
                    expenseToIncome: expenseToIncomeRatio,
                },
                healthScore,
                exchangeRate,
            },
        });
    }
    catch (error) {
        console.error('Get weekly health error:', error);
        res.status(500).json({ message: 'Error fetching weekly health', error: error.message });
    }
};
exports.getWeeklyHealth = getWeeklyHealth;
//# sourceMappingURL=dashboardController.js.map