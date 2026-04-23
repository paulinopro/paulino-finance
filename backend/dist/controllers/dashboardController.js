"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWeeklyHealth = exports.getDailyHealth = exports.getAnnualHealth = exports.getMonthlyHealth = exports.getStats = exports.getSummary = void 0;
exports.computeFinancialHealthMetrics = computeFinancialHealthMetrics;
const database_1 = require("../config/database");
const incomeExpenseTaxonomy_1 = require("../constants/incomeExpenseTaxonomy");
const recurrenceSql_1 = require("../constants/recurrenceSql");
const dateUtils_1 = require("../utils/dateUtils");
const exchangeRate_1 = require("../utils/exchangeRate");
const FIN_HEALTH_EPS = 1e-9;
function mergeCategoryTotals(target, delta) {
    for (const [k, v] of Object.entries(delta)) {
        target[k] = (target[k] || 0) + v;
    }
}
/** Suma por categoría y total DOP para gastos `EXPENSE_RECURRING_OTHER_FREQ` en [periodStart, periodEnd]. */
function otherFreqExpenseTotalsInPeriod(rows, periodStart, periodEnd, exchangeRate) {
    const byCategory = {};
    let totalDop = 0;
    for (const row of rows) {
        const amount = parseFloat(row.amount);
        const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
        const n = (0, dateUtils_1.getExpenseOccurrenceDatesInPeriod)({
            frequency: row.frequency,
            payment_day: row.payment_day,
            payment_month: row.payment_month,
            date: row.date,
        }, periodStart, periodEnd).length;
        const add = amountDop * n;
        if (add <= 0)
            continue;
        const cat = row.category || 'Sin categoría';
        byCategory[cat] = (byCategory[cat] || 0) + add;
        totalDop += add;
    }
    return { byCategory, totalDop };
}
function isMonthlyRecurringExpenseRow(row) {
    return row.recurrence_type === 'recurrent' && (0, incomeExpenseTaxonomy_1.normalizeFrequency)(row.frequency) === 'monthly';
}
/**
 * Métricas y score 0–100 coherentes cuando el ingreso del período es 0:
 * evita dividir entre 0 (ratios en 0) y el +10 artificial por gastos bajo 70% del ingreso
 * cuando hay gastos pero no ingreso declarado.
 */
function computeFinancialHealthMetrics(totalIncomeDop, totalExpensesDop, totalDebtsDop) {
    const savings = totalIncomeDop - totalExpensesDop;
    let savingsRate;
    let debtToIncomeRatio;
    let expenseToIncomeRatio;
    if (totalIncomeDop > FIN_HEALTH_EPS) {
        savingsRate = (savings / totalIncomeDop) * 100;
        debtToIncomeRatio = (totalDebtsDop / totalIncomeDop) * 100;
        expenseToIncomeRatio = (totalExpensesDop / totalIncomeDop) * 100;
    }
    else {
        const hasExpenses = totalExpensesDop > FIN_HEALTH_EPS;
        const hasDebt = totalDebtsDop > FIN_HEALTH_EPS;
        if (!hasExpenses && !hasDebt) {
            savingsRate = 0;
            debtToIncomeRatio = 0;
            expenseToIncomeRatio = 0;
        }
        else {
            savingsRate = hasExpenses ? -100 : 0;
            expenseToIncomeRatio = hasExpenses ? 100 : 0;
            debtToIncomeRatio = hasDebt ? 100 : 0;
        }
    }
    const hasIncome = totalIncomeDop > FIN_HEALTH_EPS;
    const isEmptyPeriod = totalIncomeDop <= FIN_HEALTH_EPS &&
        totalExpensesDop <= FIN_HEALTH_EPS &&
        totalDebtsDop <= FIN_HEALTH_EPS;
    let healthScore = 100;
    if (savingsRate < 0)
        healthScore -= 30;
    else if (hasIncome && savingsRate < 10)
        healthScore -= 15;
    else if (savingsRate >= 20)
        healthScore += 10;
    if (debtToIncomeRatio > 40)
        healthScore -= 25;
    else if (debtToIncomeRatio > 30)
        healthScore -= 15;
    else if (debtToIncomeRatio < 20 && !isEmptyPeriod)
        healthScore += 10;
    if (expenseToIncomeRatio > 90)
        healthScore -= 20;
    else if (expenseToIncomeRatio < 70 && !isEmptyPeriod)
        healthScore += 10;
    healthScore = Math.max(0, Math.min(100, healthScore));
    return { savings, savingsRate, debtToIncomeRatio, expenseToIncomeRatio, healthScore };
}
const getSummary = async (req, res) => {
    try {
        const userId = req.userId;
        // Get user's exchange rate
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = (0, exchangeRate_1.resolveExchangeRateDopUsd)(userResult.rows[0]?.exchange_rate_dop_usd);
        // Total assets (bank accounts)
        const accountsResult = await (0, database_1.query)(`SELECT SUM(balance_dop) as total_dop, SUM(balance_usd) as total_usd
       FROM bank_accounts
       WHERE user_id = $1`, [userId]);
        const accounts = accountsResult.rows[0];
        const totalAssetsDop = parseFloat(accounts.total_dop || 0);
        const totalAssetsUsd = parseFloat(accounts.total_usd || 0);
        const byKindResult = await (0, database_1.query)(`SELECT
        COALESCE(SUM(CASE WHEN account_kind = 'bank' THEN balance_dop ELSE 0 END), 0)::numeric AS bank_dop,
        COALESCE(SUM(CASE WHEN account_kind = 'bank' THEN balance_usd ELSE 0 END), 0)::numeric AS bank_usd,
        COALESCE(SUM(CASE WHEN account_kind IN ('cash', 'wallet') THEN balance_dop ELSE 0 END), 0)::numeric AS cash_dop,
        COALESCE(SUM(CASE WHEN account_kind IN ('cash', 'wallet') THEN balance_usd ELSE 0 END), 0)::numeric AS cash_usd
       FROM bank_accounts
       WHERE user_id = $1`, [userId]);
        const bk = byKindResult.rows[0];
        const bankDop = parseFloat(bk.bank_dop || 0);
        const bankUsd = parseFloat(bk.bank_usd || 0);
        const cashDop = parseFloat(bk.cash_dop || 0);
        const cashUsd = parseFloat(bk.cash_usd || 0);
        const bankDopUnified = bankDop + bankUsd * exchangeRate;
        const cashDopUnified = cashDop + cashUsd * exchangeRate;
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
        const bankAccountsCountResult = await (0, database_1.query)(`SELECT COUNT(*)::int AS count FROM bank_accounts WHERE user_id = $1`, [userId]);
        const bankAccountsCount = parseInt(bankAccountsCountResult.rows[0]?.count ?? 0, 10);
        const creditCardsCountResult = await (0, database_1.query)(`SELECT COUNT(*)::int AS count FROM credit_cards WHERE user_id = $1`, [userId]);
        const creditCardsCount = parseInt(creditCardsCountResult.rows[0]?.count ?? 0, 10);
        const loansCountResult = await (0, database_1.query)(`SELECT COUNT(*)::int AS count FROM loans WHERE user_id = $1`, [userId]);
        const loansCount = parseInt(loansCountResult.rows[0]?.count ?? 0, 10);
        res.json({
            success: true,
            summary: {
                assets: {
                    dop: totalAssetsDop,
                    usd: totalAssetsUsd,
                    dopUnified: totalAssetsDopUnified,
                    byKind: {
                        bank: {
                            dop: bankDop,
                            usd: bankUsd,
                            dopUnified: bankDopUnified,
                        },
                        cash: {
                            dop: cashDop,
                            usd: cashUsd,
                            dopUnified: cashDopUnified,
                        },
                    },
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
                bankAccounts: bankAccountsCount,
                creditCards: creditCardsCount,
                loans: loansCount,
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
        const exchangeRate = (0, exchangeRate_1.resolveExchangeRateDopUsd)(userResult.rows[0]?.exchange_rate_dop_usd);
        const monthStart = new Date(currentYear, currentMonth - 1, 1);
        const monthEnd = new Date(currentYear, currentMonth, 0);
        monthEnd.setHours(23, 59, 59, 999);
        // Expenses by category for the month (puntual + recurrente mensual/anual legacy + taxonomía)
        const expensesResult = await (0, database_1.query)(`SELECT category, SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.EXPENSE_STATS_MONTH_OR} )
       GROUP BY category, currency`, [userId, currentMonth, currentYear]);
        const expensesByCategory = {};
        expensesResult.rows.forEach((row) => {
            const category = row.category || 'Sin categoría';
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            expensesByCategory[category] = (expensesByCategory[category] || 0) + amountDop;
        });
        const otherFreqStats = await (0, database_1.query)(`SELECT category, amount, currency, frequency, payment_day, payment_month, date
       FROM expenses
       WHERE user_id = $1 AND ( ${recurrenceSql_1.EXPENSE_RECURRING_OTHER_FREQ} )`, [userId]);
        mergeCategoryTotals(expensesByCategory, otherFreqExpenseTotalsInPeriod(otherFreqStats.rows, monthStart, monthEnd, exchangeRate).byCategory);
        // Ingreso del mes: puntual en el mes + recurrentes expandidos
        const incomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.INCOME_PUNCTUAL_CALENDAR_MONTH} )
       GROUP BY currency`, [userId, currentMonth, currentYear]);
        let totalIncomeDop = 0;
        incomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        const fixedIncomeStatsResult = await (0, database_1.query)(`SELECT amount, currency, frequency, receipt_day, date
       FROM income
       WHERE user_id = $1 AND ( ${recurrenceSql_1.INCOME_RECURRENT_ROWS} )`, [userId]);
        fixedIncomeStatsResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const dates = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({ frequency: row.frequency, receipt_day: row.receipt_day, date: row.date }, monthStart, monthEnd);
            totalIncomeDop += amountDop * dates.length;
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
            const progress = totalAmount > 0 ? (totalPaid / totalAmount) * 100 : 0;
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
        const exchangeRate = (0, exchangeRate_1.resolveExchangeRateDopUsd)(userResult.rows[0]?.exchange_rate_dop_usd);
        // Monthly income - variable income + fixed income for this month
        const monthStart = new Date(currentYear, currentMonth - 1, 1);
        const monthEnd = new Date(currentYear, currentMonth, 0);
        monthEnd.setHours(23, 59, 59, 999);
        // Ingreso puntual del mes
        const incomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.INCOME_PUNCTUAL_CALENDAR_MONTH} )
       GROUP BY currency`, [userId, currentMonth, currentYear]);
        let totalIncomeDop = 0;
        incomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        const fixedIncomeResult = await (0, database_1.query)(`SELECT amount, currency, frequency, receipt_day, date
       FROM income
       WHERE user_id = $1 AND ( ${recurrenceSql_1.INCOME_RECURRENT_ROWS} )`, [userId]);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            const dates = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({ frequency, receipt_day: row.receipt_day, date: row.date }, monthStart, monthEnd);
            totalIncomeDop += amountDop * dates.length;
        });
        const expensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.EXPENSE_STATS_MONTH_OR} )
       GROUP BY currency`, [userId, currentMonth, currentYear]);
        let totalExpensesDop = 0;
        expensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        const otherFreqMonth = await (0, database_1.query)(`SELECT category, amount, currency, frequency, payment_day, payment_month, date
       FROM expenses
       WHERE user_id = $1 AND ( ${recurrenceSql_1.EXPENSE_RECURRING_OTHER_FREQ} )`, [userId]);
        const otherMonthTotals = otherFreqExpenseTotalsInPeriod(otherFreqMonth.rows, monthStart, monthEnd, exchangeRate);
        totalExpensesDop += otherMonthTotals.totalDop;
        const expensesByCategoryResult = await (0, database_1.query)(`SELECT category, SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.EXPENSE_STATS_MONTH_OR} )
       GROUP BY category, currency`, [userId, currentMonth, currentYear]);
        const expensesByCategory = {};
        expensesByCategoryResult.rows.forEach((row) => {
            const category = row.category || 'Sin categoría';
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            expensesByCategory[category] = (expensesByCategory[category] || 0) + amountDop;
        });
        mergeCategoryTotals(expensesByCategory, otherMonthTotals.byCategory);
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
        const { savings, savingsRate, debtToIncomeRatio, expenseToIncomeRatio, healthScore } = computeFinancialHealthMetrics(totalIncomeDop, totalExpensesDop, totalDebtsDop);
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
         AND ( ${recurrenceSql_1.INCOME_PUNCTUAL_CALENDAR_MONTH} )
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
            const dates = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({ frequency, receipt_day: row.receipt_day, date: row.date }, prevMonthStart, prevMonthEnd);
            prevIncomeDop += amountDop * dates.length;
        });
        const prevExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.EXPENSE_STATS_MONTH_OR} )
       GROUP BY currency`, [userId, prevMonth, prevYear]);
        let prevExpensesDop = 0;
        prevExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        prevExpensesDop += otherFreqExpenseTotalsInPeriod(otherFreqMonth.rows, prevMonthStart, prevMonthEnd, exchangeRate).totalDop;
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
        const exchangeRate = (0, exchangeRate_1.resolveExchangeRateDopUsd)(userResult.rows[0]?.exchange_rate_dop_usd);
        const incomeResult = await (0, database_1.query)(`SELECT 
         EXTRACT(MONTH FROM date) as month,
         SUM(amount) as total, 
         currency
       FROM income
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.INCOME_PUNCTUAL_CALENDAR_YEAR} )
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
        const yearStart = new Date(currentYear, 0, 1);
        const yearEnd = new Date(currentYear, 11, 31);
        yearEnd.setHours(23, 59, 59, 999);
        const fixedIncomeResult = await (0, database_1.query)(`SELECT amount, currency, frequency, receipt_day, date
       FROM income
       WHERE user_id = $1 AND ( ${recurrenceSql_1.INCOME_RECURRENT_ROWS} )`, [userId]);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            const dates = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({ frequency, receipt_day: row.receipt_day, date: row.date }, yearStart, yearEnd);
            // Distribute dates across months
            dates.forEach((dateStr) => {
                const date = new Date(dateStr);
                const month = date.getMonth() + 1;
                monthlyIncome[month] = (monthlyIncome[month] || 0) + amountDop;
            });
            totalIncomeDop += amountDop * dates.length;
        });
        const expensesResult = await (0, database_1.query)(`SELECT 
         EXTRACT(MONTH FROM date) as month,
         SUM(amount) as total, 
         currency
       FROM expenses
       WHERE user_id = $1
         AND (
           ( ${recurrenceSql_1.EXPENSE_PUNCTUAL_CALENDAR_YEAR} )
           OR ( ${recurrenceSql_1.EXPENSE_ANNUAL_ROW_IN_YEAR} )
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
        const recurringExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1 AND ( ${recurrenceSql_1.EXPENSE_RECURRING_MONTHLY} )
       GROUP BY currency`, [userId]);
        recurringExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            for (let month = 1; month <= 12; month++) {
                monthlyExpenses[month] = (monthlyExpenses[month] || 0) + amountDop;
            }
            totalExpensesDop += amountDop * 12;
        });
        const expensesByCategoryResult = await (0, database_1.query)(`SELECT category, SUM(amount) as total, currency, frequency, recurrence_type
       FROM expenses
       WHERE user_id = $1
         AND (
           ( ${recurrenceSql_1.EXPENSE_PUNCTUAL_CALENDAR_YEAR} )
           OR ( ${recurrenceSql_1.EXPENSE_RECURRING_MONTHLY} )
           OR ( ${recurrenceSql_1.EXPENSE_ANNUAL_ROW_IN_YEAR} )
         )
       GROUP BY category, currency, frequency, recurrence_type`, [userId, currentYear]);
        const expensesByCategory = {};
        expensesByCategoryResult.rows.forEach((row) => {
            const category = row.category || 'Sin categoría';
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const monthlyRec = isMonthlyRecurringExpenseRow(row);
            const finalAmount = monthlyRec ? amountDop * 12 : amountDop;
            expensesByCategory[category] = (expensesByCategory[category] || 0) + finalAmount;
        });
        const otherFreqAnnual = await (0, database_1.query)(`SELECT category, amount, currency, frequency, payment_day, payment_month, date
       FROM expenses
       WHERE user_id = $1 AND ( ${recurrenceSql_1.EXPENSE_RECURRING_OTHER_FREQ} )`, [userId]);
        for (let m = 1; m <= 12; m++) {
            const ms = new Date(currentYear, m - 1, 1);
            const me = new Date(currentYear, m, 0);
            me.setHours(23, 59, 59, 999);
            const t = otherFreqExpenseTotalsInPeriod(otherFreqAnnual.rows, ms, me, exchangeRate);
            monthlyExpenses[m] = (monthlyExpenses[m] || 0) + t.totalDop;
            totalExpensesDop += t.totalDop;
            mergeCategoryTotals(expensesByCategory, t.byCategory);
        }
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
        const { savings, savingsRate, debtToIncomeRatio, expenseToIncomeRatio, healthScore } = computeFinancialHealthMetrics(totalIncomeDop, totalExpensesDop, totalDebtsDop);
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
        const prevIncomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.INCOME_PUNCTUAL_CALENDAR_YEAR} )
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
            const dates = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({ frequency, receipt_day: row.receipt_day, date: row.date }, prevYearStart, prevYearEnd);
            prevIncomeDop += amountDop * dates.length;
        });
        const prevExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND (
           ( ${recurrenceSql_1.EXPENSE_PUNCTUAL_CALENDAR_YEAR} )
           OR ( ${recurrenceSql_1.EXPENSE_ANNUAL_ROW_IN_YEAR} )
         )
       GROUP BY currency`, [userId, prevYear]);
        let prevExpensesDop = 0;
        prevExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        recurringExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            prevExpensesDop += amountDop * 12;
        });
        prevExpensesDop += otherFreqExpenseTotalsInPeriod(otherFreqAnnual.rows, prevYearStart, prevYearEnd, exchangeRate).totalDop;
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
        const exchangeRate = (0, exchangeRate_1.resolveExchangeRateDopUsd)(userResult.rows[0]?.exchange_rate_dop_usd);
        const targetDateObj = new Date(targetYear, targetMonth - 1, targetDay);
        const dayRangeStart = new Date(targetYear, targetMonth - 1, targetDay, 0, 0, 0, 0);
        const dayRangeEnd = new Date(targetYear, targetMonth - 1, targetDay, 23, 59, 59, 999);
        const incomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.INCOME_PUNCTUAL_CALENDAR_DAY} )
       GROUP BY currency`, [userId, targetYear, targetMonth, targetDay]);
        let totalIncomeDop = 0;
        incomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        const fixedIncomeResult = await (0, database_1.query)(`SELECT amount, currency, frequency, receipt_day, date
       FROM income
       WHERE user_id = $1 AND ( ${recurrenceSql_1.INCOME_RECURRENT_ROWS} )`, [userId]);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            const dayStr = (0, dateUtils_1.dateToYmdLocal)(targetDateObj);
            const occ = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({ frequency, receipt_day: row.receipt_day, date: row.date }, targetDateObj, targetDateObj);
            const shouldInclude = occ.includes(dayStr);
            if (shouldInclude) {
                totalIncomeDop += amountDop;
            }
        });
        const expensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.EXPENSE_DAILY_MATCH} )
       GROUP BY currency`, [userId, targetYear, targetMonth, targetDay]);
        let totalExpensesDop = 0;
        expensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        const expensesByCategoryResult = await (0, database_1.query)(`SELECT category, SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.EXPENSE_DAILY_MATCH} )
       GROUP BY category, currency`, [userId, targetYear, targetMonth, targetDay]);
        const expensesByCategory = {};
        expensesByCategoryResult.rows.forEach((row) => {
            const category = row.category || 'Sin categoría';
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            expensesByCategory[category] = (expensesByCategory[category] || 0) + amountDop;
        });
        const otherFreqDayRows = await (0, database_1.query)(`SELECT category, amount, currency, frequency, payment_day, payment_month, date
       FROM expenses
       WHERE user_id = $1 AND ( ${recurrenceSql_1.EXPENSE_RECURRING_OTHER_FREQ} )`, [userId]);
        const otherDay = otherFreqExpenseTotalsInPeriod(otherFreqDayRows.rows, dayRangeStart, dayRangeEnd, exchangeRate);
        totalExpensesDop += otherDay.totalDop;
        mergeCategoryTotals(expensesByCategory, otherDay.byCategory);
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
        const { savings, savingsRate, debtToIncomeRatio, expenseToIncomeRatio, healthScore } = computeFinancialHealthMetrics(totalIncomeDop, totalExpensesDop, totalDebtsDop);
        // Compare with previous day
        const prevDate = new Date(targetDate);
        prevDate.setDate(prevDate.getDate() - 1);
        const prevYear = prevDate.getFullYear();
        const prevMonth = prevDate.getMonth() + 1;
        const prevDay = prevDate.getDate();
        const prevIncomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.INCOME_PUNCTUAL_CALENDAR_DAY} )
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
            const prevDayStr = (0, dateUtils_1.dateToYmdLocal)(prevDateObj);
            const occPrev = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({ frequency, receipt_day: row.receipt_day, date: row.date }, prevDateObj, prevDateObj);
            const shouldInclude = occPrev.includes(prevDayStr);
            if (shouldInclude) {
                prevIncomeDop += amountDop;
            }
        });
        const prevDayRangeStart = new Date(prevYear, prevMonth - 1, prevDay, 0, 0, 0, 0);
        const prevDayRangeEnd = new Date(prevYear, prevMonth - 1, prevDay, 23, 59, 59, 999);
        const prevExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.EXPENSE_DAILY_MATCH} )
       GROUP BY currency`, [userId, prevYear, prevMonth, prevDay]);
        let prevExpensesDop = 0;
        prevExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        prevExpensesDop += otherFreqExpenseTotalsInPeriod(otherFreqDayRows.rows, prevDayRangeStart, prevDayRangeEnd, exchangeRate).totalDop;
        const incomeChange = prevIncomeDop > 0 ? ((totalIncomeDop - prevIncomeDop) / prevIncomeDop) * 100 : 0;
        const expensesChange = prevExpensesDop > 0 ? ((totalExpensesDop - prevExpensesDop) / prevExpensesDop) * 100 : 0;
        res.json({
            success: true,
            data: {
                date: (0, dateUtils_1.dateToYmdLocal)(targetDate),
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
        const exchangeRate = (0, exchangeRate_1.resolveExchangeRateDopUsd)(userResult.rows[0]?.exchange_rate_dop_usd);
        const incomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.INCOME_DATE_IN_RANGE_PUNCTUAL} )
       GROUP BY currency`, [userId, startDate, endDate]);
        let totalIncomeDop = 0;
        incomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        const fixedIncomeResult = await (0, database_1.query)(`SELECT amount, currency, frequency, receipt_day, date
       FROM income
       WHERE user_id = $1 AND ( ${recurrenceSql_1.INCOME_RECURRENT_ROWS} )`, [userId]);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            const dates = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({ frequency, receipt_day: row.receipt_day, date: row.date }, startDate, endDate);
            totalIncomeDop += amountDop * dates.length;
        });
        const expensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.EXPENSE_DATE_IN_RANGE_PUNCTUAL} )
       GROUP BY currency`, [userId, startDate, endDate]);
        let totalExpensesDop = 0;
        expensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        const recurringAllWeek = await (0, database_1.query)(`SELECT category, amount, currency, frequency, payment_day, payment_month, date
       FROM expenses
       WHERE user_id = $1
         AND (
           ( ${recurrenceSql_1.EXPENSE_RECURRING_MONTHLY} )
           OR ( ${recurrenceSql_1.EXPENSE_RECURRING_ANNUAL} )
           OR ( ${recurrenceSql_1.EXPENSE_RECURRING_OTHER_FREQ} )
         )`, [userId]);
        const recWeek = otherFreqExpenseTotalsInPeriod(recurringAllWeek.rows, startDate, endDate, exchangeRate);
        totalExpensesDop += recWeek.totalDop;
        const expensesByCategoryResult = await (0, database_1.query)(`SELECT category, SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.EXPENSE_DATE_IN_RANGE_PUNCTUAL} )
       GROUP BY category, currency`, [userId, startDate, endDate]);
        const expensesByCategory = {};
        expensesByCategoryResult.rows.forEach((row) => {
            const category = row.category || 'Sin categoría';
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            expensesByCategory[category] = (expensesByCategory[category] || 0) + amountDop;
        });
        mergeCategoryTotals(expensesByCategory, recWeek.byCategory);
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
        const { savings, savingsRate, debtToIncomeRatio, expenseToIncomeRatio, healthScore } = computeFinancialHealthMetrics(totalIncomeDop, totalExpensesDop, totalDebtsDop);
        // Compare with previous week
        const prevStartDate = new Date(startDate);
        prevStartDate.setDate(prevStartDate.getDate() - 7);
        const prevEndDate = new Date(prevStartDate);
        prevEndDate.setDate(prevEndDate.getDate() + 6);
        prevEndDate.setHours(23, 59, 59, 999);
        const prevIncomeResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.INCOME_DATE_IN_RANGE_PUNCTUAL} )
       GROUP BY currency`, [userId, prevStartDate, prevEndDate]);
        let prevIncomeDop = 0;
        prevIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevIncomeDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            const dates = (0, dateUtils_1.getFixedIncomeOccurrenceDates)({ frequency, receipt_day: row.receipt_day, date: row.date }, prevStartDate, prevEndDate);
            prevIncomeDop += amountDop * dates.length;
        });
        const prevExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND ( ${recurrenceSql_1.EXPENSE_DATE_IN_RANGE_PUNCTUAL} )
       GROUP BY currency`, [userId, prevStartDate, prevEndDate]);
        let prevExpensesDop = 0;
        prevExpensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            prevExpensesDop += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        prevExpensesDop += otherFreqExpenseTotalsInPeriod(recurringAllWeek.rows, prevStartDate, prevEndDate, exchangeRate).totalDop;
        const incomeChange = prevIncomeDop > 0 ? ((totalIncomeDop - prevIncomeDop) / prevIncomeDop) * 100 : 0;
        const expensesChange = prevExpensesDop > 0 ? ((totalExpensesDop - prevExpensesDop) / prevExpensesDop) * 100 : 0;
        res.json({
            success: true,
            data: {
                weekStart: (0, dateUtils_1.dateToYmdLocal)(startDate),
                weekEnd: (0, dateUtils_1.dateToYmdLocal)(endDate),
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