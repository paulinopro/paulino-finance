"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCashFlow = void 0;
const database_1 = require("../config/database");
const dateUtils_1 = require("../utils/dateUtils");
const getCashFlow = async (req, res) => {
    try {
        const userId = req.userId;
        const { startDate, endDate, period } = req.query;
        // Get user's exchange rate
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        let start;
        let end;
        if (startDate && endDate) {
            start = new Date(startDate);
            end = new Date(endDate);
        }
        else if (period === 'month') {
            const now = new Date();
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        }
        else if (period === 'year') {
            const now = new Date();
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear(), 11, 31);
        }
        else {
            // Default: last 30 days
            end = new Date();
            start = new Date();
            start.setDate(start.getDate() - 30);
        }
        // Get income
        const incomeResult = await (0, database_1.query)(`SELECT date, SUM(amount) as total, currency
       FROM income
       WHERE user_id = $1
         AND date >= $2 AND date <= $3
         AND income_type = 'VARIABLE'
       GROUP BY date, currency
       ORDER BY date ASC`, [userId, start, end]);
        // Get expenses
        const expensesResult = await (0, database_1.query)(`SELECT date, SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1
         AND date >= $2 AND date <= $3
         AND expense_type = 'NON_RECURRING'
       GROUP BY date, currency
       ORDER BY date ASC`, [userId, start, end]);
        // Get recurring monthly expenses
        const recurringExpensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM expenses
       WHERE user_id = $1 AND expense_type = 'RECURRING_MONTHLY'
       GROUP BY currency`, [userId]);
        // Get accounts payable paid
        const accountsPayableResult = await (0, database_1.query)(`SELECT paid_date as date, SUM(amount) as total, currency
       FROM accounts_payable
       WHERE user_id = $1
         AND status = 'PAID'
         AND paid_date >= $2 AND paid_date <= $3
       GROUP BY paid_date, currency
       ORDER BY paid_date ASC`, [userId, start, end]);
        // Get accounts receivable received
        const accountsReceivableResult = await (0, database_1.query)(`SELECT received_date as date, SUM(amount) as total, currency
       FROM accounts_receivable
       WHERE user_id = $1
         AND status = 'RECEIVED'
         AND received_date >= $2 AND received_date <= $3
       GROUP BY received_date, currency
       ORDER BY received_date ASC`, [userId, start, end]);
        // Combine all cash flows by date
        const cashFlowByDate = {};
        // Process variable income
        incomeResult.rows.forEach((row) => {
            const date = row.date.toISOString().split('T')[0];
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            if (!cashFlowByDate[date]) {
                cashFlowByDate[date] = { income: 0, expenses: 0 };
            }
            cashFlowByDate[date].income += amountDop;
        });
        // Process fixed income (recurring)
        const fixedIncomeResult = await (0, database_1.query)(`SELECT amount, currency, frequency, receipt_day, date
       FROM income
       WHERE user_id = $1 AND income_type = 'FIXED'`, [userId]);
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            let dates = [];
            if (frequency === 'MONTHLY' && row.receipt_day) {
                // Monthly: use receipt_day (day of month)
                dates = (0, dateUtils_1.calculateMonthlyRecurringDates)(parseInt(row.receipt_day), start, end);
            }
            else if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && row.date) {
                // Weekly/Biweekly: use date as start date and calculate recurring dates
                const startDate = new Date(row.date);
                dates = (0, dateUtils_1.calculateRecurringDates)(startDate, frequency, end);
            }
            // Add income to each calculated date
            dates.forEach((dateStr) => {
                if (!cashFlowByDate[dateStr]) {
                    cashFlowByDate[dateStr] = { income: 0, expenses: 0 };
                }
                cashFlowByDate[dateStr].income += amountDop;
            });
        });
        // Process non-recurring expenses
        expensesResult.rows.forEach((row) => {
            const date = row.date.toISOString().split('T')[0];
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            if (!cashFlowByDate[date]) {
                cashFlowByDate[date] = { income: 0, expenses: 0 };
            }
            cashFlowByDate[date].expenses += amountDop;
        });
        // Process recurring expenses (only on payment day)
        const recurringExpensesWithDayResult = await (0, database_1.query)(`SELECT amount, currency, payment_day
       FROM expenses
       WHERE user_id = $1 AND expense_type = 'RECURRING_MONTHLY' AND payment_day IS NOT NULL`, [userId]);
        recurringExpensesWithDayResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const paymentDay = parseInt(row.payment_day);
            // Calculate dates for recurring monthly expenses
            const dates = (0, dateUtils_1.calculateMonthlyRecurringDates)(paymentDay, start, end);
            dates.forEach((dateStr) => {
                if (!cashFlowByDate[dateStr]) {
                    cashFlowByDate[dateStr] = { income: 0, expenses: 0 };
                }
                cashFlowByDate[dateStr].expenses += amountDop;
            });
        });
        // Process accounts payable
        accountsPayableResult.rows.forEach((row) => {
            const date = row.date.toISOString().split('T')[0];
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            if (!cashFlowByDate[date]) {
                cashFlowByDate[date] = { income: 0, expenses: 0 };
            }
            cashFlowByDate[date].expenses += amountDop;
        });
        // Process accounts receivable
        accountsReceivableResult.rows.forEach((row) => {
            const date = row.date.toISOString().split('T')[0];
            const amount = parseFloat(row.total);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            if (!cashFlowByDate[date]) {
                cashFlowByDate[date] = { income: 0, expenses: 0 };
            }
            cashFlowByDate[date].income += amountDop;
        });
        // Convert to array and calculate running balance
        const cashFlowData = [];
        let runningBalance = 0;
        // Get all dates in the period
        const allDates = [];
        const currentDate = new Date(start);
        while (currentDate <= end) {
            allDates.push(currentDate.toISOString().split('T')[0]);
            currentDate.setDate(currentDate.getDate() + 1);
        }
        for (const dateStr of allDates) {
            const dayData = cashFlowByDate[dateStr] || { income: 0, expenses: 0 };
            const netFlow = dayData.income - dayData.expenses;
            runningBalance += netFlow;
            cashFlowData.push({
                date: dateStr,
                income: Math.round(dayData.income),
                expenses: Math.round(dayData.expenses),
                netFlow: Math.round(netFlow),
                balance: Math.round(runningBalance),
            });
        }
        // Calculate summary
        const totalIncome = cashFlowData.reduce((sum, day) => sum + day.income, 0);
        const totalExpenses = cashFlowData.reduce((sum, day) => sum + day.expenses, 0);
        const netCashFlow = totalIncome - totalExpenses;
        const finalBalance = cashFlowData[cashFlowData.length - 1]?.balance || 0;
        // Calculate income breakdown for debugging
        let variableIncomeTotal = 0;
        incomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.total);
            variableIncomeTotal += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        let fixedIncomeTotal = 0;
        fixedIncomeResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const frequency = row.frequency;
            let dates = [];
            if (frequency === 'MONTHLY' && row.receipt_day) {
                dates = (0, dateUtils_1.calculateMonthlyRecurringDates)(parseInt(row.receipt_day), start, end);
            }
            else if ((frequency === 'BIWEEKLY' || frequency === 'WEEKLY') && row.date) {
                const startDate = new Date(row.date);
                dates = (0, dateUtils_1.calculateRecurringDates)(startDate, frequency, end);
            }
            fixedIncomeTotal += amountDop * dates.length;
        });
        let accountsReceivableTotal = 0;
        accountsReceivableResult.rows.forEach((row) => {
            const amount = parseFloat(row.total);
            accountsReceivableTotal += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        // Calculate expenses breakdown
        let nonRecurringExpensesTotal = 0;
        expensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total);
            nonRecurringExpensesTotal += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        let recurringExpensesTotal = 0;
        recurringExpensesWithDayResult.rows.forEach((row) => {
            const amount = parseFloat(row.amount);
            const amountDop = row.currency === 'USD' ? amount * exchangeRate : amount;
            const paymentDay = parseInt(row.payment_day);
            const dates = (0, dateUtils_1.calculateMonthlyRecurringDates)(paymentDay, start, end);
            recurringExpensesTotal += amountDop * dates.length;
        });
        let accountsPayableTotal = 0;
        accountsPayableResult.rows.forEach((row) => {
            const amount = parseFloat(row.total);
            accountsPayableTotal += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        res.json({
            success: true,
            data: {
                startDate: start.toISOString().split('T')[0],
                endDate: end.toISOString().split('T')[0],
                dailyData: cashFlowData,
                summary: {
                    totalIncome,
                    totalExpenses,
                    netCashFlow,
                    finalBalance,
                },
                incomeBreakdown: {
                    variableIncome: Math.round(variableIncomeTotal),
                    fixedIncome: Math.round(fixedIncomeTotal),
                    accountsReceivable: Math.round(accountsReceivableTotal),
                    total: Math.round(variableIncomeTotal + fixedIncomeTotal + accountsReceivableTotal),
                },
                expensesBreakdown: {
                    nonRecurringExpenses: Math.round(nonRecurringExpensesTotal),
                    recurringExpenses: Math.round(recurringExpensesTotal),
                    accountsPayable: Math.round(accountsPayableTotal),
                    total: Math.round(nonRecurringExpensesTotal + recurringExpensesTotal + accountsPayableTotal),
                },
            },
        });
    }
    catch (error) {
        console.error('Get cash flow error:', error);
        res.status(500).json({ message: 'Error fetching cash flow', error: error.message });
    }
};
exports.getCashFlow = getCashFlow;
//# sourceMappingURL=cashFlowController.js.map