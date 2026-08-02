"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getComprehensiveReport = exports.getAccountsReport = exports.getCardsReport = exports.getLoansReport = exports.getExpensesReport = void 0;
const database_1 = require("../config/database");
const userCurrencyConversion_1 = require("../services/userCurrencyConversion");
const incomeExpenseTaxonomy_1 = require("../constants/incomeExpenseTaxonomy");
const reportPdfLayout_1 = require("../utils/reportPdfLayout");
function cardDebtToPrimary(c, ctx) {
    if (c.currencyType === 'DOP')
        return (0, userCurrencyConversion_1.amountToPrimary)(c.currentDebtDop, ctx.pair.primary, ctx);
    if (c.currencyType === 'USD')
        return (0, userCurrencyConversion_1.amountToPrimary)(c.currentDebtUsd, ctx.pair.secondary, ctx);
    return (0, userCurrencyConversion_1.bankBalancesToPrimary)(c.currentDebtDop, c.currentDebtUsd, ctx);
}
function cardLimitToPrimary(c, ctx) {
    if (c.currencyType === 'DOP')
        return (0, userCurrencyConversion_1.amountToPrimary)(c.creditLimitDop, ctx.pair.primary, ctx);
    if (c.currencyType === 'USD')
        return (0, userCurrencyConversion_1.amountToPrimary)(c.creditLimitUsd, ctx.pair.secondary, ctx);
    return (0, userCurrencyConversion_1.bankBalancesToPrimary)(c.creditLimitDop, c.creditLimitUsd, ctx);
}
function accountToPrimary(a, ctx) {
    if (a.currencyType === 'DOP')
        return (0, userCurrencyConversion_1.amountToPrimary)(a.balanceDop, ctx.pair.primary, ctx);
    if (a.currencyType === 'USD')
        return (0, userCurrencyConversion_1.amountToPrimary)(a.balanceUsd, ctx.pair.secondary, ctx);
    return (0, userCurrencyConversion_1.bankBalancesToPrimary)(a.balanceDop, a.balanceUsd, ctx);
}
/** Formato moneda; `currency` = código ISO (p. ej. DOP, USD, EUR). */
const formatCurrency = (amount, currency) => {
    const code = String(currency || 'USD')
        .toUpperCase()
        .slice(0, 3);
    try {
        return new Intl.NumberFormat('es-DO', {
            style: 'currency',
            currency: code,
        }).format(amount);
    }
    catch {
        return `${amount.toFixed(2)} ${code}`;
    }
};
const rateSubtitle = (ctx) => {
    const p = ctx.pair.primary;
    const s = ctx.pair.secondary;
    const r = ctx.pairRateSecondaryPerPrimary;
    return `Par ${p}/${s} — ${s} por 1 ${p}: ${Number.isFinite(r) ? r.toFixed(4) : '—'}`;
};
// ——— PDF: layout unificado (reportPdfLayout) ———
const generateExpensesPDF = async (expenses, filters, ctx) => {
    const paid = expenses.filter((e) => e.isPaid);
    const pending = expenses.filter((e) => !e.isPaid);
    const totalPaid = paid.reduce((sum, e) => sum + (0, userCurrencyConversion_1.amountToPrimary)(e.amount, String(e.currency || 'DOP'), ctx), 0);
    const totalPending = pending.reduce((sum, e) => sum + (0, userCurrencyConversion_1.amountToPrimary)(e.amount, String(e.currency || 'DOP'), ctx), 0);
    const statusExtra = filters.status === 'paid' ? 'Solo pagados' : filters.status === 'pending' ? 'Solo pendientes' : undefined;
    const p = ctx.pair.primary;
    const kpis = [
        { label: `Total pagado (${p} eq.)`, value: formatCurrency(totalPaid, p), kind: 'pos' },
        { label: `Total pendiente (${p} eq.)`, value: formatCurrency(totalPending, p), kind: 'amber' },
        { label: 'Registros', value: String(expenses.length) },
        { label: 'Ratio pagados', value: `${paid.length} / ${pending.length}` },
    ];
    return (0, reportPdfLayout_1.renderReportPdf)('Reporte de gastos', 'Movimientos y sumarios del período seleccionado', (s) => {
        s.period(filters.fromDate, filters.toDate, statusExtra);
        s.kpis(kpis, 2);
        s.section('Detalle de movimientos');
        const rows = expenses.map((e) => {
            const desc = String(e.description || '—');
            const d = desc.length > 70 ? `${desc.slice(0, 67)}…` : desc;
            return [d, formatCurrency(e.amount, e.currency), e.category || '—', e.isPaid ? 'Pagado' : 'Pendiente', (0, incomeExpenseTaxonomy_1.describeExpenseScheduleEs)(e)];
        });
        s.table(['Descripción', 'Monto', 'Categoría', 'Estado', 'Calendario'], [150, 78, 72, 58, 141], rows);
    });
};
const generateLoansPDF = async (loans, filters, ctx) => {
    const active = loans.filter((l) => l.status === 'ACTIVE');
    const paidL = loans.filter((l) => l.status === 'PAID');
    const totalActive = active.reduce((sum, l) => sum +
        (0, userCurrencyConversion_1.amountToPrimary)(l.remainingBalance ?? l.totalAmount, String(l.currency || 'DOP'), ctx), 0);
    const totalPaid = paidL.reduce((sum, l) => sum + (0, userCurrencyConversion_1.amountToPrimary)(l.totalAmount, String(l.currency || 'DOP'), ctx), 0);
    const st = filters.status === 'active' ? 'Solo activos' : filters.status === 'paid' ? 'Solo pagados' : undefined;
    const p = ctx.pair.primary;
    const kpis = [
        { label: `Deuda en activos (${p} eq.)`, value: formatCurrency(totalActive, p), kind: 'neg' },
        { label: `Capital préstamos cerrados (${p} eq.)`, value: formatCurrency(totalPaid, p) },
        { label: 'Registros', value: String(loans.length) },
        { label: 'Activos / pagados', value: `${active.length} / ${paidL.length}` },
    ];
    return (0, reportPdfLayout_1.renderReportPdf)('Reporte de préstamos', 'Saldos, estados e hitos de pagos', (s) => {
        s.period(filters.fromDate, filters.toDate, st);
        s.kpis(kpis, 2);
        s.section('Detalle de préstamos');
        s.table(['Préstamo', 'Banco', 'Monto', 'Progreso', 'Estado'], [150, 88, 88, 48, 125], loans.map((loan) => [
            String(loan.loanName).slice(0, 50),
            loan.bankName || '—',
            formatCurrency(loan.totalAmount, loan.currency),
            `${(loan.progress ?? 0).toFixed(0)}%`,
            loan.status === 'PAID' ? 'Pagado' : loan.status === 'ACTIVE' ? 'Activo' : 'Mora',
        ]));
    });
};
/** Dual: un solo renglón (separador · sin salto a mitad de “+”). */
const limLine = (c, ctx) => {
    const p = ctx.pair.primary;
    const s = ctx.pair.secondary;
    if (c.currencyType === 'DOP')
        return formatCurrency(c.creditLimitDop, p);
    if (c.currencyType === 'USD')
        return formatCurrency(c.creditLimitUsd, s);
    return `${formatCurrency(c.creditLimitDop, p)}\u00A0·\u00A0${formatCurrency(c.creditLimitUsd, s)}`;
};
const debtLine = (c, ctx) => {
    const p = ctx.pair.primary;
    const s = ctx.pair.secondary;
    if (c.currencyType === 'DOP')
        return formatCurrency(c.currentDebtDop, p);
    if (c.currencyType === 'USD')
        return formatCurrency(c.currentDebtUsd, s);
    return `${formatCurrency(c.currentDebtDop, p)}\u00A0·\u00A0${formatCurrency(c.currentDebtUsd, s)}`;
};
const generateCardsPDF = async (cards, filters, ctx) => {
    const p = ctx.pair.primary;
    const totalDebt = cards.reduce((sum, c) => sum + cardDebtToPrimary(c, ctx), 0);
    const totalLimit = cards.reduce((sum, c) => sum + cardLimitToPrimary(c, ctx), 0);
    const avail = totalLimit - totalDebt;
    const kpis = [
        { label: `Límite total (${p} eq.)`, value: formatCurrency(totalLimit, p) },
        { label: `Deuda total (${p} eq.)`, value: formatCurrency(totalDebt, p), kind: 'neg' },
        { label: `Disponible (${p} eq.)`, value: formatCurrency(avail, p), kind: 'pos' },
        { label: 'Tarjetas', value: String(cards.length) },
    ];
    return (0, reportPdfLayout_1.renderReportPdf)('Reporte de tarjetas de crédito', `Límites\u00A0y\u00A0deudas — ${rateSubtitle(ctx)}`, (s) => {
        s.period(filters.fromDate, filters.toDate);
        s.kpis(kpis, 2);
        s.section('Detalle por tarjeta');
        s.table(['Tarjeta', 'Banco', 'Límites', 'Deudas', 'Corte/pago'], [94, 72, 132, 132, 70], cards.map((c) => [
            String(c.cardName).slice(0, 32),
            c.bankName,
            limLine(c, ctx),
            debtLine(c, ctx),
            `${c.cutOffDay ?? '—'}/${c.paymentDueDay ?? '—'}`,
        ]), { noWrapColumns: [2, 3] });
    });
};
const generateAccountsPDF = async (accounts, filters, ctx) => {
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
    const totalEq = accounts.reduce((sum, a) => sum + accountToPrimary(a, ctx), 0);
    const p = ctx.pair.primary;
    const s = ctx.pair.secondary;
    const kpis = [
        { label: `Balance ${p}`, value: formatCurrency(totalBalanceDop, p) },
        { label: `Balance ${s}`, value: formatCurrency(totalBalanceUsd, s) },
        { label: `Total (${p} eq.)`, value: formatCurrency(totalEq, p), kind: 'pos' },
        { label: 'Cuentas', value: String(accounts.length) },
    ];
    return (0, reportPdfLayout_1.renderReportPdf)('Reporte de cuentas bancarias', 'Saldos por moneda del par', (layout) => {
        layout.period(filters.fromDate, filters.toDate);
        layout.kpis(kpis, 2);
        layout.section('Detalle de cuentas');
        layout.table(['Banco', 'Tipo', 'N.º', p, s], [120, 68, 78, 98, 135], accounts.map((a) => [
            a.bankName,
            a.accountType === 'SAVINGS' ? 'Ahorro' : 'Corriente',
            a.accountNumber || '—',
            a.currencyType === 'USD' ? '—' : formatCurrency(a.balanceDop, p),
            a.currencyType === 'DOP' ? '—' : formatCurrency(a.balanceUsd, s),
        ]));
    });
};
const generateComprehensivePDF = async (data, filters, ctx) => {
    const { expenses, loans, cards, accounts } = data;
    const p = ctx.pair.primary;
    const totalBalance = accounts.reduce((sum, a) => sum + accountToPrimary(a, ctx), 0);
    const totalCardDebt = cards.reduce((sum, c) => sum + cardDebtToPrimary(c, ctx), 0);
    const totalLoanDebt = loans
        .filter((l) => l.status === 'ACTIVE')
        .reduce((sum, l) => sum +
        (0, userCurrencyConversion_1.amountToPrimary)(l.remainingBalance ?? l.totalAmount, String(l.currency || 'DOP'), ctx), 0);
    const netWorth = totalBalance - totalCardDebt - totalLoanDebt;
    const paidE = expenses.filter((e) => e.isPaid);
    const penE = expenses.filter((e) => !e.isPaid);
    const expensesEq = [...paidE, ...penE].reduce((x, e) => x + (0, userCurrencyConversion_1.amountToPrimary)(e.amount, String(e.currency || 'DOP'), ctx), 0);
    return (0, reportPdfLayout_1.renderReportPdf)('Reporte financiero completo', 'Resumen ejecutivo, KPIs y tablas detalladas', (s) => {
        s.period(filters.fromDate, filters.toDate);
        s.kpis([
            { label: `Balance cuentas (${p} eq.)`, value: formatCurrency(totalBalance, p), kind: 'pos' },
            { label: `Deuda tarjetas (${p} eq.)`, value: formatCurrency(totalCardDebt, p), kind: 'neg' },
            { label: `Deuda préstamos activos (${p} eq.)`, value: formatCurrency(totalLoanDebt, p), kind: 'neg' },
            { label: 'Patrimonio neto (aprox.)', value: formatCurrency(netWorth, p), kind: netWorth >= 0 ? 'pos' : 'neg' },
            { label: `Gastos (registros, ${p} eq.)`, value: formatCurrency(expensesEq, p) },
            { label: 'Gastos pag. / pend.', value: `${paidE.length} / ${penE.length}` },
        ], 2);
        s.section('Cuentas bancarias');
        if (accounts.length) {
            s.table(['Banco', 'Tipo', ctx.pair.primary, ctx.pair.secondary], [150, 90, 128, 131], accounts.map((a) => [
                a.bankName,
                a.accountType === 'SAVINGS' ? 'Ahorro' : 'Corriente',
                a.currencyType === 'USD' ? '—' : formatCurrency(a.balanceDop, ctx.pair.primary),
                a.currencyType === 'DOP' ? '—' : formatCurrency(a.balanceUsd, ctx.pair.secondary),
            ]));
        }
        else {
            s.note('— Sin cuentas en el período.');
        }
        s.section('Tarjetas de crédito');
        if (cards.length) {
            s.table(['Tarjeta', 'Banco', 'Límites', 'Deudas'], [100, 88, 156, 156], cards.map((c) => [String(c.cardName).slice(0, 40), c.bankName, limLine(c, ctx), debtLine(c, ctx)]), { noWrapColumns: [2, 3] });
        }
        else {
            s.note('— Sin tarjetas registradas.');
        }
        s.section('Préstamos');
        if (loans.length) {
            s.table(['Préstamo', 'Banco', 'Monto', 'Estado'], [150, 120, 100, 129], loans.map((l) => [
                String(l.loanName).slice(0, 45),
                l.bankName || '—',
                formatCurrency(l.totalAmount, l.currency),
                l.status === 'PAID' ? 'Pagado' : l.status === 'ACTIVE' ? 'Activo' : 'Mora',
            ]));
        }
        else {
            s.note('— Sin préstamos en el período.');
        }
        s.section('Gastos');
        if (expenses.length) {
            s.table(['Descripción', 'Monto', 'Categoría', 'Estado'], [200, 88, 90, 121], expenses.map((e) => {
                const d = String(e.description || '—');
                return [d.length > 55 ? d.slice(0, 52) + '…' : d, formatCurrency(e.amount, e.currency), e.category || '—', e.isPaid ? 'Pagado' : 'Pendiente'];
            }));
        }
        else {
            s.note('— Sin gastos en el período.');
        }
    });
};
// Get expenses report
const getExpensesReport = async (req, res) => {
    try {
        const userId = req.userId;
        const ctx = await (0, userCurrencyConversion_1.getConversionContextForUser)(userId);
        const { fromDate, toDate, status, format } = req.query;
        let queryText = `
      SELECT id, description, amount, currency, nature, category,
             payment_day, payment_month, date, is_paid, last_paid_month, last_paid_year,
             recurrence_type, frequency,
             created_at, updated_at
      FROM expenses
      WHERE user_id = $1 AND is_active = TRUE
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
            if (row.recurrence_type === 'recurrent' &&
                (0, incomeExpenseTaxonomy_1.normalizeFrequency)(row.frequency) === 'monthly') {
                if (row.last_paid_month !== currentMonth || row.last_paid_year !== currentYear) {
                    isPaid = false;
                }
            }
            return {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                nature: row.nature,
                recurrenceType: row.recurrence_type,
                frequency: row.frequency,
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
            }, ctx);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=reporte-gastos-${Date.now()}.pdf`);
            res.send(pdfBuffer);
        }
        else {
            const paidList = expenses.filter((e) => e.isPaid);
            const pendList = expenses.filter((e) => !e.isPaid);
            res.json({
                success: true,
                expenses,
                summary: {
                    total: expenses.length,
                    paid: paidList.length,
                    pending: pendList.length,
                    totalPaid: paidList.reduce((sum, e) => sum + (0, userCurrencyConversion_1.amountToPrimary)(e.amount, String(e.currency || 'DOP'), ctx), 0),
                    totalPending: pendList.reduce((sum, e) => sum + (0, userCurrencyConversion_1.amountToPrimary)(e.amount, String(e.currency || 'DOP'), ctx), 0),
                    primaryCurrency: ctx.pair.primary,
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
        const ctx = await (0, userCurrencyConversion_1.getConversionContextForUser)(userId);
        const { fromDate, toDate, status, format } = req.query;
        let queryText = `
      SELECT l.id, l.bank_name, l.loan_name, l.total_amount, l.interest_rate, l.interest_rate_type,
             l.total_installments, l.paid_installments, l.start_date, l.end_date,
             l.installment_amount, l.currency, l.status, l.created_at, l.updated_at,
             COALESCE(SUM(lp.amount), 0) as total_paid
      FROM loans l
      LEFT JOIN loan_payments lp ON l.id = lp.loan_id
      WHERE l.user_id = $1 AND l.is_active = TRUE
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
            }, ctx);
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=reporte-prestamos-${Date.now()}.pdf`);
            res.send(pdfBuffer);
        }
        else {
            const activeLoans = loans.filter((l) => l.status === 'ACTIVE');
            const paidLoans = loans.filter((l) => l.status === 'PAID');
            res.json({
                success: true,
                loans,
                summary: {
                    total: loans.length,
                    active: activeLoans.length,
                    paid: paidLoans.length,
                    totalActive: activeLoans.reduce((sum, l) => sum +
                        (0, userCurrencyConversion_1.amountToPrimary)(l.remainingBalance ?? l.totalAmount, String(l.currency || 'DOP'), ctx), 0),
                    totalPaid: paidLoans.reduce((sum, l) => sum + (0, userCurrencyConversion_1.amountToPrimary)(l.totalAmount, String(l.currency || 'DOP'), ctx), 0),
                    primaryCurrency: ctx.pair.primary,
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
        const ctx = await (0, userCurrencyConversion_1.getConversionContextForUser)(userId);
        const result = await (0, database_1.query)(`SELECT id, bank_name, card_name, credit_limit_dop, credit_limit_usd,
              current_debt_dop, current_debt_usd, minimum_payment_dop, minimum_payment_usd,
              cut_off_day, payment_due_day, currency_type, created_at, updated_at
       FROM credit_cards
       WHERE user_id = $1 AND is_active = TRUE
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
            const pdfBuffer = await generateCardsPDF(cards, {}, ctx);
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
                    totalDebt: cards.reduce((sum, c) => sum + cardDebtToPrimary(c, ctx), 0),
                    totalLimit: cards.reduce((sum, c) => sum + cardLimitToPrimary(c, ctx), 0),
                    primaryCurrency: ctx.pair.primary,
                    secondaryCurrency: ctx.pair.secondary,
                    exchangeRate: ctx.pairRateSecondaryPerPrimary,
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
        const ctx = await (0, userCurrencyConversion_1.getConversionContextForUser)(userId);
        let queryText = `
      SELECT id, bank_name, account_type, account_number, balance_dop, balance_usd,
              currency_type, created_at, updated_at
      FROM bank_accounts
      WHERE user_id = $1 AND is_active = TRUE
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
            }, ctx);
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
            const totalBalance = accounts.reduce((sum, a) => sum + accountToPrimary(a, ctx), 0);
            res.json({
                success: true,
                accounts,
                summary: {
                    total: accounts.length,
                    totalBalanceDop,
                    totalBalanceUsd,
                    totalBalance,
                    primaryCurrency: ctx.pair.primary,
                    secondaryCurrency: ctx.pair.secondary,
                    exchangeRate: ctx.pairRateSecondaryPerPrimary,
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
        // Get all data + tasa del usuario (.env si no hay valor en BD)
        const [expensesResult, loansResult, cardsResult, accountsResult] = await Promise.all([
            (0, database_1.query)(`SELECT id, description, amount, currency, nature, category, is_paid,
                last_paid_month, last_paid_year, recurrence_type, frequency, created_at
         FROM expenses WHERE user_id = $1 AND is_active = TRUE`, [userId]),
            (0, database_1.query)(`SELECT l.id, l.loan_name, l.bank_name, l.total_amount, l.status, l.currency,
                COALESCE(SUM(lp.amount), 0) as total_paid
         FROM loans l
         LEFT JOIN loan_payments lp ON l.id = lp.loan_id
         WHERE l.user_id = $1 AND l.is_active = TRUE
         GROUP BY l.id`, [userId]),
            (0, database_1.query)(`SELECT id, bank_name, card_name, credit_limit_dop, credit_limit_usd,
                current_debt_dop, current_debt_usd, currency_type
         FROM credit_cards WHERE user_id = $1 AND is_active = TRUE`, [userId]),
            (0, database_1.query)(`SELECT id, bank_name, account_type, account_number, balance_dop, balance_usd, currency_type
         FROM bank_accounts WHERE user_id = $1 AND is_active = TRUE`, [userId]),
        ]);
        const ctxReport = await (0, userCurrencyConversion_1.getConversionContextForUser)(userId);
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1;
        const currentYear = currentDate.getFullYear();
        const expenses = expensesResult.rows.map((row) => {
            let isPaid = row.is_paid;
            if (row.recurrence_type === 'recurrent' &&
                (0, incomeExpenseTaxonomy_1.normalizeFrequency)(row.frequency) === 'monthly') {
                if (row.last_paid_month !== currentMonth || row.last_paid_year !== currentYear) {
                    isPaid = false;
                }
            }
            return {
                id: row.id,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                nature: row.nature,
                recurrenceType: row.recurrence_type,
                frequency: row.frequency,
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
            accountNumber: row.account_number,
            balanceDop: parseFloat(row.balance_dop || 0),
            balanceUsd: parseFloat(row.balance_usd || 0),
            currencyType: row.currency_type,
        }));
        const totalBalanceForSummary = accounts.reduce((sum, a) => sum + (0, userCurrencyConversion_1.bankBalancesToPrimary)(a.balanceDop, a.balanceUsd, ctxReport), 0);
        const totalCardDebtForSummary = cards.reduce((sum, c) => sum + (0, userCurrencyConversion_1.bankBalancesToPrimary)(c.currentDebtDop, c.currentDebtUsd, ctxReport), 0);
        const totalLoanDebtForSummary = loans
            .filter((l) => l.status === 'ACTIVE')
            .reduce((sum, l) => sum +
            (0, userCurrencyConversion_1.amountToPrimary)(l.remainingBalance || 0, String(l.currency || 'DOP'), ctxReport), 0);
        const netWorthComputed = totalBalanceForSummary - totalCardDebtForSummary - totalLoanDebtForSummary;
        if (format === 'pdf') {
            const pdfBuffer = await generateComprehensivePDF({ expenses, loans, cards, accounts }, {
                fromDate: fromDate,
                toDate: toDate,
            }, ctxReport);
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
                    totalBalance: totalBalanceForSummary,
                    totalCardDebt: totalCardDebtForSummary,
                    totalLoanDebt: totalLoanDebtForSummary,
                    netWorth: netWorthComputed,
                    primaryCurrency: ctxReport.pair.primary,
                    secondaryCurrency: ctxReport.pair.secondary,
                    exchangeRate: ctxReport.pairRateSecondaryPerPrimary,
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