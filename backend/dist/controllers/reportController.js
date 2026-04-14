"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComprehensiveReport = exports.getAccountsReport = exports.getCardsReport = exports.getLoansReport = exports.getExpensesReport = void 0;
const database_1 = require("../config/database");
// Helper function to format currency
const formatCurrency = (amount, currency) => {
    return new Intl.NumberFormat('es-DO', {
        style: 'currency',
        currency: currency === 'DOP' ? 'DOP' : 'USD',
    }).format(amount);
};
// Helper function to format date
const formatDate = (date) => {
    const d = new Date(date);
    return d.toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' });
};
// Generate PDF for expenses report
const generateExpensesPDF = async (expenses, filters) => {
    return new Promise((resolve, reject) => {
        try {
            // Lazy-load pdfkit only when a PDF is actually requested
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                resolve(pdfBuffer);
            });
            // Header
            doc.fontSize(20).text('Reporte de Gastos', { align: 'center' });
            doc.moveDown();
            // Filters
            if (filters.fromDate || filters.toDate) {
                doc.fontSize(12).text('Período:', { continued: true });
                if (filters.fromDate) {
                    doc.text(` Desde: ${formatDate(filters.fromDate)}`, { continued: true });
                }
                if (filters.toDate) {
                    doc.text(` Hasta: ${formatDate(filters.toDate)}`);
                }
                doc.moveDown();
            }
            if (filters.status) {
                doc.fontSize(12).text(`Estado: ${filters.status === 'paid' ? 'Pagados' : 'Pendientes'}`);
                doc.moveDown();
            }
            // Summary
            const paid = expenses.filter((e) => e.isPaid);
            const pending = expenses.filter((e) => !e.isPaid);
            const totalPaid = paid.reduce((sum, e) => sum + e.amount, 0);
            const totalPending = pending.reduce((sum, e) => sum + e.amount, 0);
            doc.fontSize(14).text('Resumen', { underline: true });
            doc.fontSize(12);
            doc.text(`Total Pagados: ${formatCurrency(totalPaid, 'DOP')} (${paid.length} gastos)`);
            doc.text(`Total Pendientes: ${formatCurrency(totalPending, 'DOP')} (${pending.length} gastos)`);
            doc.text(`Total General: ${formatCurrency(totalPaid + totalPending, 'DOP')} (${expenses.length} gastos)`);
            doc.moveDown();
            // Expenses list
            doc.fontSize(14).text('Detalle de Gastos', { underline: true });
            doc.moveDown();
            expenses.forEach((expense, index) => {
                if (index > 0 && index % 20 === 0) {
                    doc.addPage();
                }
                doc.fontSize(10);
                doc.text(`${expense.description}`, { continued: true });
                doc.text(` - ${formatCurrency(expense.amount, expense.currency)}`, {
                    align: 'right',
                });
                doc.fontSize(8);
                doc.text(`Tipo: ${expense.expenseType === 'RECURRING_MONTHLY' ? 'Recurrente Mensual' : expense.expenseType === 'ANNUAL' ? 'Anual' : 'No Recurrente'} | ` +
                    `Categoría: ${expense.category || 'N/A'} | ` +
                    `Estado: ${expense.isPaid ? 'Pagado' : 'Pendiente'}`, { indent: 20 });
                doc.moveDown(0.5);
            });
            doc.end();
        }
        catch (error) {
            reject(error);
        }
    });
};
// Generate PDF for loans report
const generateLoansPDF = async (loans, filters) => {
    return new Promise((resolve, reject) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                resolve(pdfBuffer);
            });
            doc.fontSize(20).text('Reporte de Préstamos', { align: 'center' });
            doc.moveDown();
            if (filters.fromDate || filters.toDate) {
                doc.fontSize(12).text('Período:', { continued: true });
                if (filters.fromDate) {
                    doc.text(` Desde: ${formatDate(filters.fromDate)}`, { continued: true });
                }
                if (filters.toDate) {
                    doc.text(` Hasta: ${formatDate(filters.toDate)}`);
                }
                doc.moveDown();
            }
            // Summary
            const active = loans.filter((l) => l.status === 'ACTIVE');
            const paid = loans.filter((l) => l.status === 'PAID');
            const totalActive = active.reduce((sum, l) => sum + (l.remainingBalance || l.totalAmount), 0);
            const totalPaid = paid.reduce((sum, l) => sum + l.totalAmount, 0);
            doc.fontSize(14).text('Resumen', { underline: true });
            doc.fontSize(12);
            doc.text(`Préstamos Activos: ${active.length} - Total: ${formatCurrency(totalActive, 'DOP')}`);
            doc.text(`Préstamos Pagados: ${paid.length} - Total: ${formatCurrency(totalPaid, 'DOP')}`);
            doc.moveDown();
            doc.fontSize(14).text('Detalle de Préstamos', { underline: true });
            doc.moveDown();
            loans.forEach((loan, index) => {
                if (index > 0 && index % 15 === 0) {
                    doc.addPage();
                }
                doc.fontSize(10);
                doc.text(`${loan.loanName}${loan.bankName ? ` - ${loan.bankName}` : ''}`, {
                    continued: true,
                });
                doc.text(` ${formatCurrency(loan.totalAmount, loan.currency)}`, { align: 'right' });
                doc.fontSize(8);
                doc.text(`Estado: ${loan.status === 'ACTIVE' ? 'Activo' : loan.status === 'PAID' ? 'Pagado' : 'En Mora'} | ` +
                    `Progreso: ${loan.progress?.toFixed(1) || 0}% | ` +
                    `Cuotas: ${loan.paidInstallments}/${loan.totalInstallments}`, { indent: 20 });
                if (loan.remainingBalance !== undefined) {
                    doc.text(`Saldo Restante: ${formatCurrency(loan.remainingBalance, loan.currency)}`, {
                        indent: 20,
                    });
                }
                doc.moveDown(0.5);
            });
            doc.end();
        }
        catch (error) {
            reject(error);
        }
    });
};
// Generate PDF for cards report
const generateCardsPDF = async (cards, filters) => {
    return new Promise((resolve, reject) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                resolve(pdfBuffer);
            });
            doc.fontSize(20).text('Reporte de Tarjetas de Crédito', { align: 'center' });
            doc.moveDown();
            // Summary
            const totalDebt = cards.reduce((sum, c) => {
                if (c.currencyType === 'DOP')
                    return sum + c.currentDebtDop;
                if (c.currencyType === 'USD')
                    return sum + c.currentDebtUsd * 55; // Assuming exchange rate
                return sum + c.currentDebtDop + c.currentDebtUsd * 55;
            }, 0);
            const totalLimit = cards.reduce((sum, c) => {
                if (c.currencyType === 'DOP')
                    return sum + c.creditLimitDop;
                if (c.currencyType === 'USD')
                    return sum + c.creditLimitUsd * 55;
                return sum + c.creditLimitDop + c.creditLimitUsd * 55;
            }, 0);
            doc.fontSize(14).text('Resumen', { underline: true });
            doc.fontSize(12);
            doc.text(`Total de Tarjetas: ${cards.length}`);
            doc.text(`Límite Total: ${formatCurrency(totalLimit, 'DOP')}`);
            doc.text(`Deuda Total: ${formatCurrency(totalDebt, 'DOP')}`);
            doc.text(`Disponible: ${formatCurrency(totalLimit - totalDebt, 'DOP')}`);
            doc.moveDown();
            doc.fontSize(14).text('Detalle de Tarjetas', { underline: true });
            doc.moveDown();
            cards.forEach((card, index) => {
                if (index > 0 && index % 15 === 0) {
                    doc.addPage();
                }
                doc.fontSize(10);
                doc.text(`${card.cardName} - ${card.bankName}`, { continued: true });
                doc.fontSize(8);
                if (card.currencyType === 'DOP' || card.currencyType === 'DUAL') {
                    doc.text(`Límite DOP: ${formatCurrency(card.creditLimitDop, 'DOP')} | Deuda: ${formatCurrency(card.currentDebtDop, 'DOP')}`, { indent: 20 });
                }
                if (card.currencyType === 'USD' || card.currencyType === 'DUAL') {
                    doc.text(`Límite USD: ${formatCurrency(card.creditLimitUsd, 'USD')} | Deuda: ${formatCurrency(card.currentDebtUsd, 'USD')}`, { indent: 20 });
                }
                doc.text(`Corte: Día ${card.cutOffDay} | Vencimiento: Día ${card.paymentDueDay}`, {
                    indent: 20,
                });
                doc.moveDown(0.5);
            });
            doc.end();
        }
        catch (error) {
            reject(error);
        }
    });
};
// Generate PDF for accounts report
const generateAccountsPDF = async (accounts, filters) => {
    return new Promise((resolve, reject) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                resolve(pdfBuffer);
            });
            doc.fontSize(20).text('Reporte de Cuentas Bancarias', { align: 'center' });
            doc.moveDown();
            if (filters.fromDate || filters.toDate) {
                doc.fontSize(12).text('Período:', { continued: true });
                if (filters.fromDate) {
                    doc.text(` Desde: ${formatDate(filters.fromDate)}`, { continued: true });
                }
                if (filters.toDate) {
                    doc.text(` Hasta: ${formatDate(filters.toDate)}`);
                }
                doc.moveDown();
            }
            // Summary
            const totalBalanceDop = accounts.reduce((sum, a) => {
                if (a.currencyType === 'DOP' || a.currencyType === 'DUAL')
                    return sum + a.balanceDop;
                return sum;
            }, 0);
            const totalBalanceUsd = accounts.reduce((sum, a) => {
                if (a.currencyType === 'USD' || a.currencyType === 'DUAL')
                    return sum + a.balanceUsd;
                return sum;
            }, 0);
            const totalBalance = accounts.reduce((sum, a) => {
                if (a.currencyType === 'DOP')
                    return sum + a.balanceDop;
                if (a.currencyType === 'USD')
                    return sum + a.balanceUsd * 55; // Assuming exchange rate
                return sum + a.balanceDop + a.balanceUsd * 55;
            }, 0);
            doc.fontSize(14).text('Resumen', { underline: true });
            doc.fontSize(12);
            doc.text(`Total de Cuentas: ${accounts.length}`);
            doc.text(`Balance Total DOP: ${formatCurrency(totalBalanceDop, 'DOP')}`);
            doc.text(`Balance Total USD: ${formatCurrency(totalBalanceUsd, 'USD')}`);
            doc.text(`Balance Total General: ${formatCurrency(totalBalance, 'DOP')}`);
            doc.moveDown();
            doc.fontSize(14).text('Detalle de Cuentas', { underline: true });
            doc.moveDown();
            accounts.forEach((account, index) => {
                if (index > 0 && index % 15 === 0) {
                    doc.addPage();
                }
                doc.fontSize(10);
                doc.text(`${account.bankName} - ${account.accountType === 'SAVINGS' ? 'Ahorro' : 'Corriente'}`, {
                    continued: true,
                });
                if (account.accountNumber) {
                    doc.text(` (${account.accountNumber})`, { continued: true });
                }
                doc.fontSize(8);
                if (account.currencyType === 'DOP' || account.currencyType === 'DUAL') {
                    doc.text(`Balance DOP: ${formatCurrency(account.balanceDop, 'DOP')}`, { indent: 20 });
                }
                if (account.currencyType === 'USD' || account.currencyType === 'DUAL') {
                    doc.text(`Balance USD: ${formatCurrency(account.balanceUsd, 'USD')}`, { indent: 20 });
                }
                doc.moveDown(0.5);
            });
            doc.end();
        }
        catch (error) {
            reject(error);
        }
    });
};
// Generate comprehensive report PDF
const generateComprehensivePDF = async (data, filters) => {
    return new Promise((resolve, reject) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfBuffer = Buffer.concat(buffers);
                resolve(pdfBuffer);
            });
            doc.fontSize(24).text('Reporte Financiero Completo', { align: 'center' });
            doc.moveDown();
            doc.fontSize(10).text(`Generado el: ${formatDate(new Date())}`, { align: 'center' });
            doc.moveDown(2);
            if (filters.fromDate || filters.toDate) {
                doc.fontSize(12).text('Período:', { continued: true });
                if (filters.fromDate) {
                    doc.text(` Desde: ${formatDate(filters.fromDate)}`, { continued: true });
                }
                if (filters.toDate) {
                    doc.text(` Hasta: ${formatDate(filters.toDate)}`);
                }
                doc.moveDown(2);
            }
            // Accounts Summary
            doc.fontSize(18).text('Cuentas Bancarias', { underline: true });
            doc.moveDown();
            const totalBalance = data.accounts.reduce((sum, a) => {
                if (a.currencyType === 'DOP')
                    return sum + a.balanceDop;
                if (a.currencyType === 'USD')
                    return sum + a.balanceUsd * 55;
                return sum + a.balanceDop + a.balanceUsd * 55;
            }, 0);
            doc.fontSize(12).text(`Total en Cuentas: ${formatCurrency(totalBalance, 'DOP')}`);
            doc.fontSize(10).text(`Número de Cuentas: ${data.accounts.length}`);
            doc.moveDown();
            // Cards Summary
            doc.fontSize(18).text('Tarjetas de Crédito', { underline: true });
            doc.moveDown();
            const totalCardDebt = data.cards.reduce((sum, c) => {
                if (c.currencyType === 'DOP')
                    return sum + c.currentDebtDop;
                if (c.currencyType === 'USD')
                    return sum + c.currentDebtUsd * 55;
                return sum + c.currentDebtDop + c.currentDebtUsd * 55;
            }, 0);
            doc.fontSize(12).text(`Deuda Total en Tarjetas: ${formatCurrency(totalCardDebt, 'DOP')}`);
            doc.fontSize(10).text(`Número de Tarjetas: ${data.cards.length}`);
            doc.moveDown();
            // Loans Summary
            doc.fontSize(18).text('Préstamos', { underline: true });
            doc.moveDown();
            const totalLoanDebt = data.loans
                .filter((l) => l.status === 'ACTIVE')
                .reduce((sum, l) => sum + (l.remainingBalance || l.totalAmount), 0);
            doc.fontSize(12).text(`Deuda Total en Préstamos: ${formatCurrency(totalLoanDebt, 'DOP')}`);
            doc.fontSize(10).text(`Préstamos Activos: ${data.loans.filter((l) => l.status === 'ACTIVE').length}`);
            doc.moveDown();
            // Expenses Summary
            doc.fontSize(18).text('Gastos', { underline: true });
            doc.moveDown();
            const paidExpenses = data.expenses.filter((e) => e.isPaid);
            const pendingExpenses = data.expenses.filter((e) => !e.isPaid);
            const totalPaidExpenses = paidExpenses.reduce((sum, e) => sum + e.amount, 0);
            const totalPendingExpenses = pendingExpenses.reduce((sum, e) => sum + e.amount, 0);
            doc.fontSize(12).text(`Gastos Pagados: ${formatCurrency(totalPaidExpenses, 'DOP')} (${paidExpenses.length})`);
            doc.fontSize(12).text(`Gastos Pendientes: ${formatCurrency(totalPendingExpenses, 'DOP')} (${pendingExpenses.length})`);
            doc.moveDown();
            // Net Worth
            doc.fontSize(18).text('Patrimonio Neto', { underline: true });
            doc.moveDown();
            const netWorth = totalBalance - totalCardDebt - totalLoanDebt;
            doc.fontSize(14).text(`Patrimonio Neto: ${formatCurrency(netWorth, 'DOP')}`, {
                align: 'center',
            });
            doc.end();
        }
        catch (error) {
            reject(error);
        }
    });
};
// Get expenses report
const getExpensesReport = async (req, res) => {
    try {
        const userId = req.userId;
        const { fromDate, toDate, status, format } = req.query;
        let queryText = `
      SELECT id, description, amount, currency, expense_type, category,
             payment_day, payment_month, date, is_paid, last_paid_month, last_paid_year,
             created_at, updated_at
      FROM expenses
      WHERE user_id = $1
    `;
        const params = [userId];
        let paramIndex = 2;
        if (fromDate) {
            queryText += ` AND (date >= $${paramIndex} OR created_at >= $${paramIndex})`;
            params.push(fromDate);
            paramIndex++;
        }
        if (toDate) {
            queryText += ` AND (date <= $${paramIndex} OR created_at <= $${paramIndex})`;
            params.push(toDate);
            paramIndex++;
        }
        queryText += ' ORDER BY created_at DESC';
        const result = await (0, database_1.query)(queryText, params);
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        let expenses = result.rows.map((row) => {
            let isPaid = row.is_paid;
            if (row.expense_type === 'RECURRING_MONTHLY') {
                if (row.last_paid_month !== currentMonth || row.last_paid_year !== currentYear) {
                    isPaid = false;
                }
            }
            return {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                expenseType: row.expense_type,
                category: row.category,
                paymentDay: row.payment_day,
                paymentMonth: row.payment_month,
                date: row.date,
                isPaid: isPaid,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
        });
        // Filter by status if provided
        if (status === 'paid') {
            expenses = expenses.filter((e) => e.isPaid);
        }
        else if (status === 'pending') {
            expenses = expenses.filter((e) => !e.isPaid);
        }
        if (format === 'pdf') {
            const pdfBuffer = await generateExpensesPDF(expenses, {
                fromDate: fromDate,
                toDate: toDate,
                status: status,
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=reporte-gastos-${Date.now()}.pdf`);
            res.send(pdfBuffer);
        }
        else {
            res.json({
                success: true,
                expenses,
                summary: {
                    total: expenses.length,
                    paid: expenses.filter((e) => e.isPaid).length,
                    pending: expenses.filter((e) => !e.isPaid).length,
                    totalPaid: expenses.filter((e) => e.isPaid).reduce((sum, e) => sum + e.amount, 0),
                    totalPending: expenses.filter((e) => !e.isPaid).reduce((sum, e) => sum + e.amount, 0),
                },
            });
        }
    }
    catch (error) {
        console.error('Get expenses report error:', error);
        res.status(500).json({ message: 'Error generating expenses report', error: error.message });
    }
};
exports.getExpensesReport = getExpensesReport;
// Get loans report
const getLoansReport = async (req, res) => {
    try {
        const userId = req.userId;
        const { fromDate, toDate, status, format } = req.query;
        let queryText = `
      SELECT l.id, l.bank_name, l.loan_name, l.total_amount, l.interest_rate, l.interest_rate_type,
             l.total_installments, l.paid_installments, l.start_date, l.end_date,
             l.installment_amount, l.currency, l.status, l.created_at, l.updated_at,
             COALESCE(SUM(lp.amount), 0) as total_paid
      FROM loans l
      LEFT JOIN loan_payments lp ON l.id = lp.loan_id
      WHERE l.user_id = $1
    `;
        const params = [userId];
        let paramIndex = 2;
        if (fromDate) {
            queryText += ` AND l.start_date >= $${paramIndex}`;
            params.push(fromDate);
            paramIndex++;
        }
        if (toDate) {
            queryText += ` AND l.start_date <= $${paramIndex}`;
            params.push(toDate);
            paramIndex++;
        }
        queryText += ` GROUP BY l.id ORDER BY l.created_at DESC`;
        const result = await (0, database_1.query)(queryText, params);
        let loans = result.rows.map((row) => ({
            id: row.id,
            bankName: row.bank_name,
            loanName: row.loan_name,
            totalAmount: parseFloat(row.total_amount),
            interestRate: parseFloat(row.interest_rate),
            interestRateType: row.interest_rate_type,
            totalInstallments: row.total_installments,
            paidInstallments: row.paid_installments,
            startDate: row.start_date,
            endDate: row.end_date,
            installmentAmount: parseFloat(row.installment_amount),
            currency: row.currency,
            status: row.status,
            totalPaid: parseFloat(row.total_paid),
            remainingBalance: parseFloat(row.total_amount) - parseFloat(row.total_paid),
            progress: (parseFloat(row.total_paid) / parseFloat(row.total_amount)) * 100,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        // Filter by status if provided
        if (status === 'paid') {
            loans = loans.filter((l) => l.status === 'PAID');
        }
        else if (status === 'pending' || status === 'active') {
            loans = loans.filter((l) => l.status === 'ACTIVE');
        }
        if (format === 'pdf') {
            const pdfBuffer = await generateLoansPDF(loans, {
                fromDate: fromDate,
                toDate: toDate,
                status: status,
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=reporte-prestamos-${Date.now()}.pdf`);
            res.send(pdfBuffer);
        }
        else {
            res.json({
                success: true,
                loans,
                summary: {
                    total: loans.length,
                    active: loans.filter((l) => l.status === 'ACTIVE').length,
                    paid: loans.filter((l) => l.status === 'PAID').length,
                    totalActive: loans
                        .filter((l) => l.status === 'ACTIVE')
                        .reduce((sum, l) => sum + (l.remainingBalance || l.totalAmount), 0),
                    totalPaid: loans.filter((l) => l.status === 'PAID').reduce((sum, l) => sum + l.totalAmount, 0),
                },
            });
        }
    }
    catch (error) {
        console.error('Get loans report error:', error);
        res.status(500).json({ message: 'Error generating loans report', error: error.message });
    }
};
exports.getLoansReport = getLoansReport;
// Get cards report
const getCardsReport = async (req, res) => {
    try {
        const userId = req.userId;
        const { format } = req.query;
        const result = await (0, database_1.query)(`SELECT id, bank_name, card_name, credit_limit_dop, credit_limit_usd,
              current_debt_dop, current_debt_usd, minimum_payment_dop, minimum_payment_usd,
              cut_off_day, payment_due_day, currency_type, created_at, updated_at
       FROM credit_cards
       WHERE user_id = $1
       ORDER BY created_at DESC`, [userId]);
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
        if (format === 'pdf') {
            const pdfBuffer = await generateCardsPDF(cards, {});
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=reporte-tarjetas-${Date.now()}.pdf`);
            res.send(pdfBuffer);
        }
        else {
            res.json({
                success: true,
                cards,
                summary: {
                    total: cards.length,
                    totalDebt: cards.reduce((sum, c) => {
                        if (c.currencyType === 'DOP')
                            return sum + c.currentDebtDop;
                        if (c.currencyType === 'USD')
                            return sum + c.currentDebtUsd * 55;
                        return sum + c.currentDebtDop + c.currentDebtUsd * 55;
                    }, 0),
                    totalLimit: cards.reduce((sum, c) => {
                        if (c.currencyType === 'DOP')
                            return sum + c.creditLimitDop;
                        if (c.currencyType === 'USD')
                            return sum + c.creditLimitUsd * 55;
                        return sum + c.creditLimitDop + c.creditLimitUsd * 55;
                    }, 0),
                },
            });
        }
    }
    catch (error) {
        console.error('Get cards report error:', error);
        res.status(500).json({ message: 'Error generating cards report', error: error.message });
    }
};
exports.getCardsReport = getCardsReport;
// Get accounts report
const getAccountsReport = async (req, res) => {
    try {
        const userId = req.userId;
        const { fromDate, toDate, format } = req.query;
        let queryText = `
      SELECT id, bank_name, account_type, account_number, balance_dop, balance_usd,
              currency_type, created_at, updated_at
      FROM bank_accounts
      WHERE user_id = $1
    `;
        const params = [userId];
        let paramIndex = 2;
        if (fromDate) {
            queryText += ` AND created_at >= $${paramIndex}`;
            params.push(fromDate);
            paramIndex++;
        }
        if (toDate) {
            queryText += ` AND created_at <= $${paramIndex}`;
            params.push(toDate);
            paramIndex++;
        }
        queryText += ' ORDER BY created_at DESC';
        const result = await (0, database_1.query)(queryText, params);
        const accounts = result.rows.map((row) => ({
            id: row.id,
            bankName: row.bank_name,
            accountType: row.account_type,
            accountNumber: row.account_number,
            balanceDop: parseFloat(row.balance_dop || 0),
            balanceUsd: parseFloat(row.balance_usd || 0),
            currencyType: row.currency_type,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));
        if (format === 'pdf') {
            const pdfBuffer = await generateAccountsPDF(accounts, {
                fromDate: fromDate,
                toDate: toDate,
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=reporte-cuentas-${Date.now()}.pdf`);
            res.send(pdfBuffer);
        }
        else {
            const totalBalanceDop = accounts.reduce((sum, a) => {
                if (a.currencyType === 'DOP' || a.currencyType === 'DUAL')
                    return sum + a.balanceDop;
                return sum;
            }, 0);
            const totalBalanceUsd = accounts.reduce((sum, a) => {
                if (a.currencyType === 'USD' || a.currencyType === 'DUAL')
                    return sum + a.balanceUsd;
                return sum;
            }, 0);
            const totalBalance = accounts.reduce((sum, a) => {
                if (a.currencyType === 'DOP')
                    return sum + a.balanceDop;
                if (a.currencyType === 'USD')
                    return sum + a.balanceUsd * 55;
                return sum + a.balanceDop + a.balanceUsd * 55;
            }, 0);
            res.json({
                success: true,
                accounts,
                summary: {
                    total: accounts.length,
                    totalBalanceDop,
                    totalBalanceUsd,
                    totalBalance,
                    savings: accounts.filter((a) => a.accountType === 'SAVINGS').length,
                    checking: accounts.filter((a) => a.accountType === 'CHECKING').length,
                },
            });
        }
    }
    catch (error) {
        console.error('Get accounts report error:', error);
        res.status(500).json({ message: 'Error generating accounts report', error: error.message });
    }
};
exports.getAccountsReport = getAccountsReport;
// Get comprehensive report
const getComprehensiveReport = async (req, res) => {
    try {
        const userId = req.userId;
        const { fromDate, toDate, format } = req.query;
        // Get all data
        const [expensesResult, loansResult, cardsResult, accountsResult] = await Promise.all([
            (0, database_1.query)(`SELECT id, description, amount, currency, expense_type, category, is_paid, 
                last_paid_month, last_paid_year, created_at
         FROM expenses WHERE user_id = $1`, [userId]),
            (0, database_1.query)(`SELECT l.id, l.loan_name, l.bank_name, l.total_amount, l.status, l.currency,
                COALESCE(SUM(lp.amount), 0) as total_paid
         FROM loans l
         LEFT JOIN loan_payments lp ON l.id = lp.loan_id
         WHERE l.user_id = $1
         GROUP BY l.id`, [userId]),
            (0, database_1.query)(`SELECT id, bank_name, card_name, credit_limit_dop, credit_limit_usd,
                current_debt_dop, current_debt_usd, currency_type
         FROM credit_cards WHERE user_id = $1`, [userId]),
            (0, database_1.query)(`SELECT id, bank_name, account_type, balance_dop, balance_usd, currency_type
         FROM bank_accounts WHERE user_id = $1`, [userId]),
        ]);
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        const expenses = expensesResult.rows.map((row) => {
            let isPaid = row.is_paid;
            if (row.expense_type === 'RECURRING_MONTHLY') {
                if (row.last_paid_month !== currentMonth || row.last_paid_year !== currentYear) {
                    isPaid = false;
                }
            }
            return {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                expenseType: row.expense_type,
                category: row.category,
                isPaid,
            };
        });
        const loans = loansResult.rows.map((row) => ({
            id: row.id,
            loanName: row.loan_name,
            bankName: row.bank_name,
            totalAmount: parseFloat(row.total_amount),
            status: row.status,
            currency: row.currency,
            totalPaid: parseFloat(row.total_paid),
            remainingBalance: parseFloat(row.total_amount) - parseFloat(row.total_paid),
        }));
        const cards = cardsResult.rows.map((row) => ({
            id: row.id,
            bankName: row.bank_name,
            cardName: row.card_name,
            creditLimitDop: parseFloat(row.credit_limit_dop || 0),
            creditLimitUsd: parseFloat(row.credit_limit_usd || 0),
            currentDebtDop: parseFloat(row.current_debt_dop || 0),
            currentDebtUsd: parseFloat(row.current_debt_usd || 0),
            currencyType: row.currency_type,
        }));
        const accounts = accountsResult.rows.map((row) => ({
            id: row.id,
            bankName: row.bank_name,
            accountType: row.account_type,
            balanceDop: parseFloat(row.balance_dop || 0),
            balanceUsd: parseFloat(row.balance_usd || 0),
            currencyType: row.currency_type,
        }));
        if (format === 'pdf') {
            const pdfBuffer = await generateComprehensivePDF({ expenses, loans, cards, accounts }, {
                fromDate: fromDate,
                toDate: toDate,
            });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=reporte-completo-${Date.now()}.pdf`);
            res.send(pdfBuffer);
        }
        else {
            res.json({
                success: true,
                data: {
                    expenses,
                    loans,
                    cards,
                    accounts,
                },
                summary: {
                    totalBalance: accounts.reduce((sum, a) => {
                        if (a.currencyType === 'DOP')
                            return sum + a.balanceDop;
                        if (a.currencyType === 'USD')
                            return sum + a.balanceUsd * 55;
                        return sum + a.balanceDop + a.balanceUsd * 55;
                    }, 0),
                    totalCardDebt: cards.reduce((sum, c) => {
                        if (c.currencyType === 'DOP')
                            return sum + c.currentDebtDop;
                        if (c.currencyType === 'USD')
                            return sum + c.currentDebtUsd * 55;
                        return sum + c.currentDebtDop + c.currentDebtUsd * 55;
                    }, 0),
                    totalLoanDebt: loans
                        .filter((l) => l.status === 'ACTIVE')
                        .reduce((sum, l) => sum + (l.remainingBalance || l.totalAmount), 0),
                    netWorth: 0, // Will be calculated
                },
            });
        }
    }
    catch (error) {
        console.error('Get comprehensive report error:', error);
        res.status(500).json({ message: 'Error generating comprehensive report', error: error.message });
    }
};
exports.getComprehensiveReport = getComprehensiveReport;
//# sourceMappingURL=reportController.js.map