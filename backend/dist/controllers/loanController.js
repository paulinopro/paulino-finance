"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePayment = exports.getAmortizationSchedule = exports.deletePayment = exports.recordPayment = exports.deleteLoan = exports.updateLoan = exports.createLoan = exports.getLoan = exports.getLoans = void 0;
const database_1 = require("../config/database");
const amortizationService_1 = require("../services/amortizationService");
const accountBalance_1 = require("../services/accountBalance");
const exchangeRate_1 = require("../utils/exchangeRate");
const dateUtils_1 = require("../utils/dateUtils");
function optionalBankAccountId(body) {
    const v = body.bankAccountId;
    if (v == null || v === '')
        return null;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? null : n;
}
function resolveBankAccountIdUpdate(body, previous) {
    if (!('bankAccountId' in body))
        return previous;
    const v = body.bankAccountId;
    if (v === null || v === undefined || v === '')
        return null;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? null : n;
}
/** Elimina un pago y regenera tabla de amortización (rollback interno o borrado explícito). */
async function removeLoanPaymentById(paymentId, userId) {
    const paymentResult = await (0, database_1.query)(`SELECT lp.id, lp.loan_id, lp.installment_number, l.paid_installments, l.total_installments
     FROM loan_payments lp
     INNER JOIN loans l ON lp.loan_id = l.id
     WHERE lp.id = $1 AND l.user_id = $2`, [paymentId, userId]);
    if (paymentResult.rows.length === 0)
        return;
    const payment = paymentResult.rows[0];
    const loanId = payment.loan_id;
    const newPaidInstallments = Math.max(0, payment.paid_installments - 1);
    await (0, database_1.query)('UPDATE amortization_schedule SET payment_id = NULL WHERE payment_id = $1', [paymentId]);
    await (0, database_1.query)('DELETE FROM loan_payments WHERE id = $1', [paymentId]);
    const updateStatus = newPaidInstallments >= payment.total_installments ? 'PAID' : 'ACTIVE';
    await (0, database_1.query)(`UPDATE loans 
     SET paid_installments = $1, status = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`, [newPaidInstallments, updateStatus, loanId]);
    const updatedSchedule = await (0, amortizationService_1.generateAmortizationSchedule)(loanId, userId);
    await (0, amortizationService_1.saveAmortizationSchedule)(loanId, updatedSchedule);
}
const getLoans = async (req, res) => {
    try {
        const userId = req.userId;
        const { search, bank } = req.query;
        let queryText = `
      SELECT l.id, l.loan_name, l.bank_name, l.total_amount, l.interest_rate, l.interest_rate_type,
              l.total_installments, l.paid_installments, l.start_date, l.end_date,
              l.installment_amount, l.fixed_charge, l.payment_day, l.next_payment_date, l.currency, l.status,
              l.interest_calculation_base, l.created_at, l.updated_at, 
              COALESCE(SUM(lp.amount), 0) as total_paid,
              COALESCE(SUM(lp.principal_amount), 0) as total_principal_paid
       FROM loans l
       LEFT JOIN loan_payments lp ON l.id = lp.loan_id
       WHERE l.user_id = $1
    `;
        const params = [userId];
        let paramIndex = 2;
        if (search) {
            queryText += ` AND (l.loan_name ILIKE $${paramIndex} OR l.bank_name ILIKE $${paramIndex})`;
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (bank) {
            queryText += ` AND l.bank_name ILIKE $${paramIndex}`;
            params.push(`%${bank}%`);
            paramIndex++;
        }
        queryText += ` GROUP BY l.id ORDER BY l.created_at DESC`;
        const result = await (0, database_1.query)(queryText, params);
        // Helper function to calculate next payment date
        const calculateNextPaymentDate = (loan) => {
            if (!loan.payment_day || loan.status === 'PAID')
                return null;
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            // Get last payment date or start date
            let lastPaymentDate;
            if (loan.next_payment_date) {
                lastPaymentDate = new Date(loan.next_payment_date);
            }
            else {
                lastPaymentDate = new Date(loan.start_date);
            }
            // Calculate next payment date based on payment_day
            const nextPayment = new Date(currentYear, currentMonth, loan.payment_day);
            // If payment day has passed this month, move to next month
            if (nextPayment < today) {
                nextPayment.setMonth(nextPayment.getMonth() + 1);
            }
            // If we have a last payment date, ensure next payment is after it
            if (lastPaymentDate && nextPayment <= lastPaymentDate) {
                nextPayment.setMonth(nextPayment.getMonth() + 1);
                nextPayment.setDate(loan.payment_day);
            }
            return (0, dateUtils_1.dateToYmdLocal)(nextPayment);
        };
        const loans = result.rows.map((row) => {
            const loan = {
                id: row.id,
                loan_name: row.loan_name,
                bank_name: row.bank_name,
                total_amount: row.total_amount,
                paid_installments: row.paid_installments,
                total_installments: row.total_installments,
                start_date: row.start_date,
                payment_day: row.payment_day,
                next_payment_date: row.next_payment_date,
                status: row.status,
            };
            const nextPaymentDate = calculateNextPaymentDate(loan);
            return {
                id: row.id,
                loanName: row.loan_name,
                bankName: row.bank_name,
                totalAmount: parseFloat(row.total_amount),
                interestRate: parseFloat(row.interest_rate),
                interestRateType: row.interest_rate_type,
                totalInstallments: row.total_installments,
                paidInstallments: row.paid_installments,
                startDate: row.start_date,
                endDate: row.end_date,
                installmentAmount: parseFloat(row.installment_amount),
                paymentDay: row.payment_day,
                nextPaymentDate: nextPaymentDate || row.next_payment_date,
                currency: row.currency,
                status: row.status,
                interestCalculationBase: row.interest_calculation_base || 'ACTUAL_360',
                totalPaid: parseFloat(row.total_paid),
                remainingBalance: parseFloat(row.total_amount) - parseFloat(row.total_principal_paid || 0),
                progress: (row.paid_installments / row.total_installments) * 100,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            };
        });
        // Get exchange rate once
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = (0, exchangeRate_1.resolveExchangeRateDopUsd)(userResult.rows[0]?.exchange_rate_dop_usd);
        // Calculate totals
        const totalRemaining = loans
            .filter((l) => l.status === 'ACTIVE')
            .reduce((sum, l) => {
            // Sum by currency, convert USD to DOP
            if (l.currency === 'DOP') {
                return sum + (l.remainingBalance || 0);
            }
            return sum + ((l.remainingBalance || 0) * exchangeRate);
        }, 0);
        const totalInstallment = loans
            .filter((l) => l.status === 'ACTIVE')
            .reduce((sum, l) => {
            // Sum by currency, convert USD to DOP
            if (l.currency === 'DOP') {
                return sum + l.installmentAmount;
            }
            return sum + (l.installmentAmount * exchangeRate);
        }, 0);
        res.json({
            success: true,
            loans,
            summary: {
                totalRemaining,
                totalInstallment,
                totalLoans: loans.length,
            },
        });
    }
    catch (error) {
        console.error('Get loans error:', error);
        res.status(500).json({ message: 'Error fetching loans', error: error.message });
    }
};
exports.getLoans = getLoans;
const getLoan = async (req, res) => {
    try {
        const userId = req.userId;
        const loanId = parseInt(req.params.id);
        const loanResult = await (0, database_1.query)(`SELECT id, loan_name, bank_name, total_amount, interest_rate, interest_rate_type,
              total_installments, paid_installments, start_date, end_date,
              installment_amount, fixed_charge, payment_day, next_payment_date, currency, status,
              interest_calculation_base, created_at, updated_at
       FROM loans
       WHERE id = $1 AND user_id = $2`, [loanId, userId]);
        if (loanResult.rows.length === 0) {
            return res.status(404).json({ message: 'Loan not found' });
        }
        const loan = loanResult.rows[0];
        // Get payments
        const paymentsResult = await (0, database_1.query)(`SELECT id, payment_date, amount, principal_amount, interest_amount, charge_amount, 
              late_fee, installment_number, outstanding_balance, payment_type, notes, bank_account_id,
              created_at, updated_at
       FROM loan_payments
       WHERE loan_id = $1
       ORDER BY payment_date DESC`, [loanId]);
        // Calculate total principal paid for remaining balance
        const principalPaidResult = await (0, database_1.query)(`SELECT COALESCE(SUM(principal_amount), 0) as total_principal_paid
       FROM loan_payments
       WHERE loan_id = $1`, [loanId]);
        const totalPrincipalPaid = parseFloat(principalPaidResult.rows[0]?.total_principal_paid || 0);
        const remainingBalance = parseFloat(loan.total_amount) - totalPrincipalPaid;
        // Generate amortization schedule to get next payment date dynamically
        const schedule = await (0, amortizationService_1.generateAmortizationSchedule)(loanId, userId);
        const nextInstallment = schedule.find((item) => item.status === 'PENDING' || item.status === 'OVERDUE' || item.status === 'FUTURE');
        const nextPaymentDate = nextInstallment ? nextInstallment.dueDate : null;
        // Return the actual dates from the database, not calculated ones
        // This ensures that when editing, the user sees the dates they originally saved
        const actualStartDate = loan.start_date;
        const actualEndDate = loan.end_date;
        res.json({
            success: true,
            loan: {
                id: loan.id,
                loanName: loan.loan_name,
                bankName: loan.bank_name,
                totalAmount: parseFloat(loan.total_amount),
                interestRate: parseFloat(loan.interest_rate),
                interestRateType: loan.interest_rate_type,
                totalInstallments: loan.total_installments,
                paidInstallments: loan.paid_installments,
                startDate: actualStartDate,
                endDate: actualEndDate,
                installmentAmount: parseFloat(loan.installment_amount),
                fixedCharge: parseFloat(loan.fixed_charge || 0),
                paymentDay: loan.payment_day,
                nextPaymentDate: nextPaymentDate,
                currency: loan.currency,
                status: loan.status,
                interestCalculationBase: loan.interest_calculation_base || 'ACTUAL_360',
                remainingBalance: remainingBalance,
                progress: (loan.paid_installments / loan.total_installments) * 100,
                payments: paymentsResult.rows.map((p) => ({
                    id: p.id,
                    paymentDate: p.payment_date,
                    amount: parseFloat(p.amount),
                    principalAmount: parseFloat(p.principal_amount || 0),
                    interestAmount: parseFloat(p.interest_amount || 0),
                    chargeAmount: parseFloat(p.charge_amount || 0),
                    lateFee: parseFloat(p.late_fee || 0),
                    installmentNumber: p.installment_number,
                    outstandingBalance: p.outstanding_balance ? parseFloat(p.outstanding_balance) : undefined,
                    paymentType: p.payment_type,
                    notes: p.notes,
                    bankAccountId: p.bank_account_id != null ? p.bank_account_id : null,
                    createdAt: p.created_at,
                    updatedAt: p.updated_at,
                })),
                createdAt: loan.created_at,
                updatedAt: loan.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Get loan error:', error);
        res.status(500).json({ message: 'Error fetching loan', error: error.message });
    }
};
exports.getLoan = getLoan;
const createLoan = async (req, res) => {
    try {
        const userId = req.userId;
        const { loanName, bankName, totalAmount, interestRate, interestRateType, totalInstallments, startDate, endDate, installmentAmount, fixedCharge, paymentDay, currency, interestCalculationBase, } = req.body;
        if (!loanName || !totalAmount || !interestRate || !totalInstallments || !startDate || !installmentAmount) {
            return res.status(400).json({ message: 'Missing required fields' });
        }
        // Calculate next payment date based on payment_day and start_date
        let nextPaymentDate = null;
        if (paymentDay) {
            const start = new Date(startDate);
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            let nextPayment = new Date(currentYear, currentMonth, paymentDay);
            if (nextPayment < today || nextPayment < start) {
                nextPayment.setMonth(nextPayment.getMonth() + 1);
                nextPayment.setDate(paymentDay);
            }
            nextPaymentDate = (0, dateUtils_1.dateToYmdLocal)(nextPayment);
        }
        const result = await (0, database_1.query)(`INSERT INTO loans 
       (user_id, loan_name, bank_name, total_amount, interest_rate, interest_rate_type,
        total_installments, start_date, end_date, installment_amount, fixed_charge, payment_day, next_payment_date, currency, interest_calculation_base)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, loan_name, bank_name, total_amount, interest_rate, interest_rate_type,
                 total_installments, paid_installments, start_date, end_date,
                 installment_amount, fixed_charge, payment_day, next_payment_date, currency, status, interest_calculation_base, created_at, updated_at`, [
            userId,
            loanName,
            bankName || null,
            totalAmount,
            interestRate,
            interestRateType || 'ANNUAL',
            totalInstallments,
            startDate,
            endDate || null,
            installmentAmount,
            fixedCharge || 0,
            paymentDay || null,
            nextPaymentDate,
            currency || 'DOP',
            interestCalculationBase || 'ACTUAL_360',
        ]);
        const row = result.rows[0];
        res.status(201).json({
            success: true,
            message: 'Loan created successfully',
            loan: {
                id: row.id,
                loanName: row.loan_name,
                bankName: row.bank_name,
                totalAmount: parseFloat(row.total_amount),
                interestRate: parseFloat(row.interest_rate),
                interestRateType: row.interest_rate_type,
                totalInstallments: row.total_installments,
                paidInstallments: row.paid_installments,
                startDate: row.start_date,
                endDate: row.end_date,
                installmentAmount: parseFloat(row.installment_amount),
                paymentDay: row.payment_day,
                nextPaymentDate: row.next_payment_date,
                currency: row.currency,
                status: row.status,
                interestCalculationBase: row.interest_calculation_base || 'ACTUAL_360',
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Create loan error:', error);
        res.status(500).json({ message: 'Error creating loan', error: error.message });
    }
};
exports.createLoan = createLoan;
const updateLoan = async (req, res) => {
    try {
        const userId = req.userId;
        const loanId = parseInt(req.params.id);
        const { loanName, bankName, totalAmount, interestRate, interestRateType, totalInstallments, paidInstallments, startDate, endDate, installmentAmount, fixedCharge, paymentDay, currency, status, interestCalculationBase, } = req.body;
        const checkResult = await (0, database_1.query)('SELECT id FROM loans WHERE id = $1 AND user_id = $2', [loanId, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Loan not found' });
        }
        // Process dates: ensure startDate is always provided, endDate can be null
        // Convert empty string to null for both dates
        const processedStartDate = (startDate === '' || startDate === null || startDate === undefined) ? null : startDate;
        const processedEndDate = (endDate === '' || endDate === null || endDate === undefined) ? null : endDate;
        // Validate startDate is provided
        if (!processedStartDate) {
            return res.status(400).json({ message: 'Start date is required' });
        }
        // Calculate next payment date if payment_day is being updated
        let nextPaymentDate = null;
        if (paymentDay !== undefined) {
            const loanCheck = await (0, database_1.query)('SELECT start_date, next_payment_date FROM loans WHERE id = $1', [loanId]);
            const loanData = loanCheck.rows[0];
            const start = new Date(processedStartDate || loanData.start_date);
            const today = new Date();
            const currentMonth = today.getMonth();
            const currentYear = today.getFullYear();
            let nextPayment = new Date(currentYear, currentMonth, paymentDay);
            if (nextPayment < today || nextPayment < start) {
                nextPayment.setMonth(nextPayment.getMonth() + 1);
                nextPayment.setDate(paymentDay);
            }
            nextPaymentDate = (0, dateUtils_1.dateToYmdLocal)(nextPayment);
        }
        const result = await (0, database_1.query)(`UPDATE loans
       SET loan_name = COALESCE($1, loan_name),
           bank_name = COALESCE($2, bank_name),
           total_amount = COALESCE($3, total_amount),
           interest_rate = COALESCE($4, interest_rate),
           interest_rate_type = COALESCE($5, interest_rate_type),
           total_installments = COALESCE($6, total_installments),
           paid_installments = COALESCE($7, paid_installments),
           start_date = $8,
           end_date = $9,
           installment_amount = COALESCE($10, installment_amount),
           fixed_charge = COALESCE($11, fixed_charge),
           payment_day = COALESCE($12, payment_day),
           next_payment_date = COALESCE($13, next_payment_date),
           currency = COALESCE($14, currency),
           status = COALESCE($15, status),
           interest_calculation_base = COALESCE($16, interest_calculation_base),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $17 AND user_id = $18
       RETURNING id, loan_name, bank_name, total_amount, interest_rate, interest_rate_type,
                 total_installments, paid_installments, start_date, end_date,
                 installment_amount, fixed_charge, payment_day, next_payment_date, currency, status, interest_calculation_base, created_at, updated_at`, [
            loanName,
            bankName,
            totalAmount,
            interestRate,
            interestRateType,
            totalInstallments,
            paidInstallments,
            processedStartDate, // Always update start_date
            processedEndDate, // Always update end_date (can be null)
            installmentAmount,
            fixedCharge !== undefined ? fixedCharge : null,
            paymentDay,
            nextPaymentDate,
            currency,
            status,
            interestCalculationBase,
            loanId,
            userId,
        ]);
        const row = result.rows[0];
        res.json({
            success: true,
            message: 'Loan updated successfully',
            loan: {
                id: row.id,
                loanName: row.loan_name,
                bankName: row.bank_name,
                totalAmount: parseFloat(row.total_amount),
                interestRate: parseFloat(row.interest_rate),
                interestRateType: row.interest_rate_type,
                totalInstallments: row.total_installments,
                paidInstallments: row.paid_installments,
                startDate: row.start_date,
                endDate: row.end_date,
                installmentAmount: parseFloat(row.installment_amount),
                paymentDay: row.payment_day,
                nextPaymentDate: row.next_payment_date,
                currency: row.currency,
                status: row.status,
                interestCalculationBase: row.interest_calculation_base || 'ACTUAL_360',
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update loan error:', error);
        res.status(500).json({ message: 'Error updating loan', error: error.message });
    }
};
exports.updateLoan = updateLoan;
const deleteLoan = async (req, res) => {
    try {
        const userId = req.userId;
        const loanId = parseInt(req.params.id);
        const result = await (0, database_1.query)('DELETE FROM loans WHERE id = $1 AND user_id = $2 RETURNING id', [loanId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Loan not found' });
        }
        res.json({
            success: true,
            message: 'Loan deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete loan error:', error);
        res.status(500).json({ message: 'Error deleting loan', error: error.message });
    }
};
exports.deleteLoan = deleteLoan;
const recordPayment = async (req, res) => {
    try {
        const userId = req.userId;
        const loanId = parseInt(req.params.id);
        const { paymentDate, amount, paymentType, notes, installmentNumber } = req.body;
        const bankAccountId = optionalBankAccountId(req.body);
        if (!paymentDate || !amount) {
            return res.status(400).json({ message: 'Payment date and amount are required' });
        }
        // Verify loan exists and belongs to user
        const loanResult = await (0, database_1.query)('SELECT id, paid_installments, total_installments, payment_day, currency FROM loans WHERE id = $1 AND user_id = $2', [loanId, userId]);
        if (loanResult.rows.length === 0) {
            return res.status(404).json({ message: 'Loan not found' });
        }
        const loan = loanResult.rows[0];
        const loanCurrency = String(loan.currency || 'DOP');
        // Process payment with amortization logic
        const paymentDistribution = await (0, amortizationService_1.processPayment)(loanId, paymentDate, parseFloat(amount), paymentType || 'COMPLETE', installmentNumber !== undefined ? parseInt(installmentNumber) : undefined);
        // Insert payment with detailed breakdown
        const paymentResult = await (0, database_1.query)(`INSERT INTO loan_payments 
       (loan_id, payment_date, amount, principal_amount, interest_amount, charge_amount, 
        late_fee, installment_number, outstanding_balance, payment_type, notes, bank_account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, payment_date, amount, principal_amount, interest_amount, charge_amount,
                 late_fee, installment_number, outstanding_balance, payment_type, notes, bank_account_id, created_at`, [
            loanId,
            paymentDate,
            parseFloat(amount),
            paymentDistribution.principalAmount,
            paymentDistribution.interestAmount,
            paymentDistribution.chargeAmount,
            paymentDistribution.lateFee,
            paymentDistribution.installmentNumber,
            paymentDistribution.outstandingBalance,
            paymentType || 'COMPLETE',
            notes || null,
            bankAccountId,
        ]);
        const newPaymentId = paymentResult.rows[0].id;
        const payAmt = parseFloat(String(amount));
        // Update loan paid installments if this is a complete payment
        let newPaidInstallments = loan.paid_installments;
        if (paymentType === 'COMPLETE' || !paymentType) {
            // Check if this completes an installment
            const schedule = await (0, amortizationService_1.generateAmortizationSchedule)(loanId, userId);
            const installment = schedule.find((item) => item.installmentNumber === paymentDistribution.installmentNumber);
            if (installment && installment.status === 'PAID') {
                newPaidInstallments = Math.max(newPaidInstallments, paymentDistribution.installmentNumber);
            }
        }
        // Calculate next payment date
        let nextPaymentDate = null;
        if (loan.payment_day && newPaidInstallments < loan.total_installments) {
            const paymentDateObj = new Date(paymentDate);
            const currentMonth = paymentDateObj.getMonth();
            const currentYear = paymentDateObj.getFullYear();
            let nextPayment = new Date(currentYear, currentMonth, loan.payment_day);
            nextPayment.setMonth(nextPayment.getMonth() + 1);
            nextPaymentDate = (0, dateUtils_1.dateToYmdLocal)(nextPayment);
        }
        // Update loan
        const updateStatus = newPaidInstallments >= loan.total_installments ? 'PAID' : 'ACTIVE';
        await (0, database_1.query)(`UPDATE loans 
       SET paid_installments = $1, status = $2, next_payment_date = COALESCE($3, next_payment_date), updated_at = CURRENT_TIMESTAMP
       WHERE id = $4`, [newPaidInstallments, updateStatus, nextPaymentDate, loanId]);
        // Regenerate and save amortization schedule
        const updatedSchedule = await (0, amortizationService_1.generateAmortizationSchedule)(loanId, userId);
        await (0, amortizationService_1.saveAmortizationSchedule)(loanId, updatedSchedule);
        if (bankAccountId) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, loanCurrency, -payAmt);
            }
            catch (e) {
                await removeLoanPaymentById(newPaymentId, userId);
                if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
                    return res.status(400).json({
                        message: e.message === 'CURRENCY_MISMATCH'
                            ? 'La moneda de la cuenta no coincide con la moneda del préstamo'
                            : 'Cuenta no encontrada',
                    });
                }
                throw e;
            }
        }
        // Get next installment info
        const nextInstallment = updatedSchedule.find((item) => item.status === 'PENDING' || item.status === 'OVERDUE' || item.status === 'FUTURE');
        res.status(201).json({
            success: true,
            message: 'Payment recorded successfully',
            data: {
                payment: {
                    id: paymentResult.rows[0].id,
                    paymentDate: paymentResult.rows[0].payment_date,
                    amount: parseFloat(paymentResult.rows[0].amount),
                    principalAmount: parseFloat(paymentResult.rows[0].principal_amount),
                    interestAmount: parseFloat(paymentResult.rows[0].interest_amount),
                    chargeAmount: parseFloat(paymentResult.rows[0].charge_amount),
                    lateFee: parseFloat(paymentResult.rows[0].late_fee || 0),
                    installmentNumber: paymentResult.rows[0].installment_number,
                    outstandingBalance: parseFloat(paymentResult.rows[0].outstanding_balance),
                    paymentType: paymentResult.rows[0].payment_type,
                    notes: paymentResult.rows[0].notes,
                    bankAccountId: paymentResult.rows[0].bank_account_id != null ? paymentResult.rows[0].bank_account_id : null,
                    createdAt: paymentResult.rows[0].created_at,
                },
                distribution: {
                    principal: paymentDistribution.principalAmount,
                    interest: paymentDistribution.interestAmount,
                    charge: paymentDistribution.chargeAmount,
                    lateFee: paymentDistribution.lateFee,
                },
                nuevoSaldo: paymentDistribution.outstandingBalance,
                proximaCuota: nextInstallment ? {
                    fecha: nextInstallment.dueDate,
                    monto: nextInstallment.totalDue,
                    capital: nextInstallment.principalAmount,
                    interes: nextInstallment.interestAmount,
                } : null,
            },
        });
    }
    catch (error) {
        console.error('Record payment error:', error);
        res.status(500).json({ message: 'Error recording payment', error: error.message });
    }
};
exports.recordPayment = recordPayment;
const deletePayment = async (req, res) => {
    try {
        const userId = req.userId;
        const paymentId = parseInt(req.params.paymentId);
        const meta = await (0, database_1.query)(`SELECT lp.amount, lp.bank_account_id, l.currency
       FROM loan_payments lp
       INNER JOIN loans l ON lp.loan_id = l.id
       WHERE lp.id = $1 AND l.user_id = $2`, [paymentId, userId]);
        if (meta.rows.length === 0) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        const row = meta.rows[0];
        if (row.bank_account_id) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, row.bank_account_id, row.currency, parseFloat(row.amount));
            }
            catch (e) {
                console.error('Revert balance on loan payment delete:', e);
            }
        }
        await removeLoanPaymentById(paymentId, userId);
        res.json({
            success: true,
            message: 'Payment deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete payment error:', error);
        res.status(500).json({ message: 'Error deleting payment', error: error.message });
    }
};
exports.deletePayment = deletePayment;
// Get amortization schedule
const getAmortizationSchedule = async (req, res) => {
    try {
        const userId = req.userId;
        const loanId = parseInt(req.params.id);
        // Verify loan belongs to user
        const loanResult = await (0, database_1.query)('SELECT id FROM loans WHERE id = $1 AND user_id = $2', [loanId, userId]);
        if (loanResult.rows.length === 0) {
            return res.status(404).json({ message: 'Loan not found' });
        }
        // Generate or get amortization schedule with user timezone
        const schedule = await (0, amortizationService_1.generateAmortizationSchedule)(loanId, userId);
        // Get loan details for summary
        const loanDetailsResult = await (0, database_1.query)(`SELECT l.id, l.loan_name, l.bank_name, l.total_amount, l.start_date, l.currency,
              l.total_installments, l.paid_installments, l.fixed_charge,
              COALESCE(SUM(lp.principal_amount), 0) as total_principal_paid,
              COALESCE(SUM(lp.interest_amount), 0) as total_interest_paid
       FROM loans l
       LEFT JOIN loan_payments lp ON l.id = lp.loan_id
       WHERE l.id = $1
       GROUP BY l.id`, [loanId]);
        const loanDetails = loanDetailsResult.rows[0];
        const totalPrincipalPaid = parseFloat(loanDetails.total_principal_paid || 0);
        // Saldo actual = Monto total - Sumatoria del capital pagado
        const currentBalance = parseFloat(loanDetails.total_amount) - totalPrincipalPaid;
        // Count paid installments excluding installment 0 (disbursement)
        const paidInstallments = schedule.filter((item) => item.status === 'PAID' && item.installmentNumber !== 0).length;
        const totalInterestPaid = parseFloat(loanDetails.total_interest_paid || 0);
        const nextInstallment = schedule.find((item) => item.status === 'PENDING' || item.status === 'OVERDUE');
        res.json({
            success: true,
            summary: {
                loanId: loanDetails.id,
                loanName: loanDetails.loan_name,
                bankName: loanDetails.bank_name,
                originalAmount: parseFloat(loanDetails.total_amount),
                currentBalance: currentBalance,
                balancePercentage: (currentBalance / parseFloat(loanDetails.total_amount)) * 100,
                paidInstallments: paidInstallments,
                totalInstallments: loanDetails.total_installments,
                completionPercentage: (paidInstallments / loanDetails.total_installments) * 100,
                totalPrincipalPaid: totalPrincipalPaid,
                totalInterestPaid: totalInterestPaid,
                startDate: loanDetails.start_date,
                currency: loanDetails.currency,
                nextPaymentDate: nextInstallment?.dueDate || null,
            },
            schedule: schedule,
        });
    }
    catch (error) {
        console.error('Get amortization schedule error:', error);
        res.status(500).json({ message: 'Error fetching amortization schedule', error: error.message });
    }
};
exports.getAmortizationSchedule = getAmortizationSchedule;
// Update payment
const updatePayment = async (req, res) => {
    try {
        const userId = req.userId;
        const paymentId = parseInt(req.params.paymentId);
        const { paymentDate, amount, paymentType, notes } = req.body;
        const oldQ = await (0, database_1.query)(`SELECT lp.id, lp.loan_id, lp.installment_number, lp.amount, lp.bank_account_id, lp.payment_date, l.currency
       FROM loan_payments lp
       INNER JOIN loans l ON lp.loan_id = l.id
       WHERE lp.id = $1 AND l.user_id = $2`, [paymentId, userId]);
        if (oldQ.rows.length === 0) {
            return res.status(404).json({ message: 'Payment not found' });
        }
        const old = oldQ.rows[0];
        const loanId = old.loan_id;
        const loanCurrency = String(old.currency || 'DOP');
        const newBankId = resolveBankAccountIdUpdate(req.body, old.bank_account_id);
        const effDate = paymentDate !== undefined && paymentDate !== null ? paymentDate : old.payment_date;
        const effAmt = amount !== undefined && amount !== null && amount !== ''
            ? parseFloat(String(amount))
            : parseFloat(old.amount);
        if (old.bank_account_id) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, old.bank_account_id, loanCurrency, parseFloat(old.amount));
            }
            catch (e) {
                console.error('Revert balance on loan payment update:', e);
            }
        }
        const paymentDistribution = await (0, amortizationService_1.processPayment)(loanId, effDate, effAmt, (paymentType || 'COMPLETE'));
        const updateResult = await (0, database_1.query)(`UPDATE loan_payments
       SET payment_date = $1,
           amount = $2,
           principal_amount = $3,
           interest_amount = $4,
           charge_amount = $5,
           late_fee = $6,
           outstanding_balance = $7,
           payment_type = COALESCE($8, payment_type),
           notes = COALESCE($9, notes),
           bank_account_id = $10,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11
       RETURNING id, payment_date, amount, principal_amount, interest_amount, 
                 charge_amount, late_fee, installment_number, outstanding_balance, 
                 payment_type, notes, bank_account_id, updated_at`, [
            effDate,
            effAmt,
            paymentDistribution.principalAmount,
            paymentDistribution.interestAmount,
            paymentDistribution.chargeAmount,
            paymentDistribution.lateFee,
            paymentDistribution.outstandingBalance,
            paymentType || null,
            notes || null,
            newBankId,
            paymentId,
        ]);
        const updatedSchedule = await (0, amortizationService_1.generateAmortizationSchedule)(loanId, userId);
        await (0, amortizationService_1.saveAmortizationSchedule)(loanId, updatedSchedule);
        if (newBankId) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, newBankId, loanCurrency, -effAmt);
            }
            catch (e) {
                if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
                    return res.status(400).json({
                        message: e.message === 'CURRENCY_MISMATCH'
                            ? 'La moneda de la cuenta no coincide con la moneda del préstamo'
                            : 'Cuenta no encontrada',
                    });
                }
                throw e;
            }
        }
        res.json({
            success: true,
            message: 'Payment updated successfully',
            payment: {
                id: updateResult.rows[0].id,
                paymentDate: updateResult.rows[0].payment_date,
                amount: parseFloat(updateResult.rows[0].amount),
                principalAmount: parseFloat(updateResult.rows[0].principal_amount),
                interestAmount: parseFloat(updateResult.rows[0].interest_amount),
                chargeAmount: parseFloat(updateResult.rows[0].charge_amount),
                lateFee: parseFloat(updateResult.rows[0].late_fee || 0),
                installmentNumber: updateResult.rows[0].installment_number,
                outstandingBalance: parseFloat(updateResult.rows[0].outstanding_balance),
                paymentType: updateResult.rows[0].payment_type,
                notes: updateResult.rows[0].notes,
                bankAccountId: updateResult.rows[0].bank_account_id != null ? updateResult.rows[0].bank_account_id : null,
                updatedAt: updateResult.rows[0].updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update payment error:', error);
        res.status(500).json({ message: 'Error updating payment', error: error.message });
    }
};
exports.updatePayment = updatePayment;
//# sourceMappingURL=loanController.js.map