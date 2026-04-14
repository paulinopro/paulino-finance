import { query, getClient } from '../config/database';
import { getUserTimezone, formatDateForTimezone } from '../utils/dateUtils';

export interface AmortizationScheduleItem {
  installmentNumber: number;
  dueDate: string;
  principalAmount: number;
  interestAmount: number;
  chargeAmount: number;
  totalDue: number;
  outstandingBalance: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'FUTURE';
  paymentId?: number;
}

export interface LoanDetails {
  id: number;
  totalAmount: number;
  interestRate: number;
  interestRateType: 'ANNUAL' | 'MONTHLY';
  totalInstallments: number;
  installmentAmount: number;
  fixedCharge: number;
  startDate: string;
  paymentDay: number;
  currency: string;
  interestCalculationBase: 'ACTUAL_360' | 'ACTUAL_365' | '30_360' | '30_365';
}

/**
 * Calculate monthly interest rate from annual or monthly rate
 * 
 * For annual nominal rates with monthly compounding:
 * - The monthly rate used for calculations is: annual_nominal / 12
 * - This monthly rate, when compounded 12 times, gives the effective annual rate
 * 
 * Example: 16% annual nominal
 * - Monthly rate = 16% / 12 = 1.333% per month
 * - Effective annual rate = (1 + 0.01333)^12 - 1 ≈ 17.2%
 * 
 * The monthly rate (1.333%) is what we use to calculate interest on each payment,
 * and the compounding effect is automatically reflected in the effective annual rate.
 * 
 * This function returns the monthly rate that, when applied monthly to the outstanding
 * balance, correctly calculates the interest with monthly compounding, resulting in
 * the effective annual rate shown in the example.
 */
const getMonthlyInterestRate = (interestRate: number, interestRateType: 'ANNUAL' | 'MONTHLY'): number => {
  if (interestRateType === 'MONTHLY') {
    return interestRate / 100;
  }
  // Annual nominal rate converted to monthly rate for calculations
  // This is the rate that, when applied monthly with compounding, gives us
  // the effective annual rate: EAR = (1 + monthly_rate)^12 - 1
  // For 16% nominal: monthly_rate = 0.16/12 = 0.01333
  // Effective annual = (1.01333)^12 - 1 ≈ 0.172 = 17.2%
  return interestRate / 100 / 12;
};

/**
 * Calculate effective annual rate (EAR) from nominal annual rate with monthly compounding
 * 
 * Formula: EAR = (1 + nominal_rate/12)^12 - 1
 * 
 * Example: 16% nominal annual
 * - EAR = (1 + 0.16/12)^12 - 1 ≈ 17.2%
 */
export const calculateEffectiveAnnualRate = (nominalAnnualRate: number): number => {
  const monthlyRate = nominalAnnualRate / 100 / 12;
  const effectiveAnnualRate = Math.pow(1 + monthlyRate, 12) - 1;
  return effectiveAnnualRate * 100; // Return as percentage
};

/**
 * Calculate number of days between two dates
 * Returns positive number of days from date1 to date2
 * Uses actual calendar days (inclusive of both dates)
 */
const daysBetween = (date1: Date, date2: Date): number => {
  // Create new date objects to avoid mutating originals
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  
  // Set both dates to midnight to avoid time issues
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  
  // Ensure d1 is before d2 (swap if needed)
  let startDate = d1;
  let endDate = d2;
  if (d1.getTime() > d2.getTime()) {
    startDate = d2;
    endDate = d1;
  }
  
  // Calculate difference in milliseconds
  const diffTime = endDate.getTime() - startDate.getTime();
  
  // Convert to days - use Math.floor for actual calendar days
  // This gives us the actual number of days between the two dates
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  // Return the actual number of days (always positive)
  return diffDays;
};

/**
 * Calculate days for interest calculation based on the calculation base
 * @param fromDate Start date of the period
 * @param toDate End date of the period
 * @param base Calculation base: ACTUAL_360, ACTUAL_365, 30_360, or 30_365
 * @returns Number of days to use in calculation
 */
const calculateDaysForBase = (
  fromDate: Date,
  toDate: Date,
  base: 'ACTUAL_360' | 'ACTUAL_365' | '30_360' | '30_365'
): number => {
  if (base === 'ACTUAL_360' || base === 'ACTUAL_365') {
    // Use actual days between dates
    return daysBetween(fromDate, toDate);
  } else {
    // 30_360 or 30_365: Use fixed 30 days per period
    return 30;
  }
};

/**
 * Get the denominator (base) for interest calculation
 * @param base Calculation base: ACTUAL_360, ACTUAL_365, 30_360, or 30_365
 * @returns Denominator value (360 or 365)
 */
const getBaseDenominator = (base: 'ACTUAL_360' | 'ACTUAL_365' | '30_360' | '30_365'): number => {
  if (base === 'ACTUAL_360' || base === '30_360') {
    return 360;
  } else {
    return 365;
  }
};

/**
 * Generate complete amortization schedule for a loan
 */
export const generateAmortizationSchedule = async (loanId: number, userId?: number): Promise<AmortizationScheduleItem[]> => {
  // Get user timezone if userId is provided
  const userTimezone = userId ? await getUserTimezone(userId) : 'America/Santo_Domingo';
  
  // Get loan details
  const loanResult = await query(
    `SELECT id, total_amount, interest_rate, interest_rate_type, total_installments,
            installment_amount, fixed_charge, start_date, payment_day, currency,
            interest_calculation_base
     FROM loans WHERE id = $1`,
    [loanId]
  );

  if (loanResult.rows.length === 0) {
    throw new Error('Loan not found');
  }

  const loan: LoanDetails = {
    id: loanResult.rows[0].id,
    totalAmount: parseFloat(loanResult.rows[0].total_amount),
    interestRate: parseFloat(loanResult.rows[0].interest_rate),
    interestRateType: loanResult.rows[0].interest_rate_type,
    totalInstallments: loanResult.rows[0].total_installments,
    installmentAmount: parseFloat(loanResult.rows[0].installment_amount),
    fixedCharge: parseFloat(loanResult.rows[0].fixed_charge || 0),
    startDate: loanResult.rows[0].start_date,
    paymentDay: loanResult.rows[0].payment_day,
    currency: loanResult.rows[0].currency,
    interestCalculationBase: loanResult.rows[0].interest_calculation_base || 'ACTUAL_360',
  };

  // Get existing payments to track what's been paid
  const paymentsResult = await query(
    `SELECT id, payment_date, principal_amount, interest_amount, charge_amount, 
            installment_number, outstanding_balance
     FROM loan_payments 
     WHERE loan_id = $1 
     ORDER BY payment_date ASC`,
    [loanId]
  );

  const payments = paymentsResult.rows.map((p) => ({
    id: p.id,
    paymentDate: p.payment_date,
    principalAmount: parseFloat(p.principal_amount || 0),
    interestAmount: parseFloat(p.interest_amount || 0),
    chargeAmount: parseFloat(p.charge_amount || 0),
    installmentNumber: p.installment_number,
    outstandingBalance: parseFloat(p.outstanding_balance || 0),
  }));

  const schedule: AmortizationScheduleItem[] = [];
  
  let currentBalance = loan.totalAmount;
  const startDate = new Date(loan.startDate);
  startDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Add installment 0 (disbursement) - start_date is the disbursement date
  const disbursementDateString = loan.startDate;
  
  // Check if there are payments for installment 0
  const disbursementPayments = payments.filter((p) => p.installmentNumber === 0);
  let disbursementBalance = loan.totalAmount;
  let disbursementPaymentId: number | undefined = undefined;
  
  // Calculate total principal paid for installment 0
  if (disbursementPayments.length > 0) {
    const totalPrincipalPaid = disbursementPayments.reduce((sum, p) => sum + p.principalAmount, 0);
    disbursementBalance = loan.totalAmount - totalPrincipalPaid;
    // Use the most recent payment ID
    disbursementPaymentId = disbursementPayments[disbursementPayments.length - 1].id;
  }
  
  schedule.push({
    installmentNumber: 0,
    dueDate: disbursementDateString,
    principalAmount: disbursementPayments.reduce((sum, p) => sum + p.principalAmount, 0),
    interestAmount: 0,
    chargeAmount: 0,
    totalDue: loan.totalAmount,
    outstandingBalance: Math.max(0, disbursementBalance),
    status: 'PAID',
    paymentId: disbursementPaymentId,
  });
  
  // Update currentBalance to reflect payments made to installment 0
  currentBalance = Math.max(0, disbursementBalance);

  // Get annual interest rate (convert to decimal)
  const annualRate = loan.interestRateType === 'ANNUAL' 
    ? loan.interestRate / 100 
    : (loan.interestRate * 12) / 100; // Convert monthly to annual

  // Calculate the first installment date based on start_date and payment_day
  // If payment_day > start_date day, first installment is same month
  // If payment_day == start_date day, first installment is next month
  // If payment_day < start_date day, first installment is next month
  const startDateDay = startDate.getDate();
  const paymentDay = loan.paymentDay || startDateDay;
  
  let firstInstallmentYear = startDate.getFullYear();
  let firstInstallmentMonth = startDate.getMonth();
  
  // If payment day is greater than start date day, first installment is same month
  // If payment day is equal or less than start date day, first installment is next month
  if (paymentDay <= startDateDay) {
    firstInstallmentMonth += 1;
    if (firstInstallmentMonth > 11) {
      firstInstallmentMonth = 0;
      firstInstallmentYear += 1;
    }
  }
  // If payment day > start date day, first installment is same month (use start_date month)

  // Calculate schedule for each installment
  for (let i = 1; i <= loan.totalInstallments; i++) {
    // Calculate due date: first installment uses calculated first month, then add months
    const targetYear = firstInstallmentYear;
    const targetMonth = firstInstallmentMonth + (i - 1);
    const finalYear = targetYear + Math.floor(targetMonth / 12);
    const finalMonth = targetMonth % 12;
    
    // Determine the day to use
    const dayToUse = paymentDay;
    
    // Create date directly with year, month, and day to avoid timezone issues
    // Get last day of month to handle edge cases
    const lastDayOfMonth = new Date(finalYear, finalMonth + 1, 0).getDate();
    const actualDay = Math.min(dayToUse, lastDayOfMonth);
    
    // Create date string in format YYYY-MM-DD to avoid timezone shifts
    const monthStr = String(finalMonth + 1).padStart(2, '0');
    const dayStr = String(actualDay).padStart(2, '0');
    const dueDateString = `${finalYear}-${monthStr}-${dayStr}`;
    
    // Validate the date string format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDateString)) {
      throw new Error(`Invalid date string format for installment ${i}: ${dueDateString}`);
    }
    
    // Parse the date string to ensure it's in local timezone
    const dueDate = new Date(dueDateString + 'T12:00:00'); // Use noon to avoid DST issues
    dueDate.setHours(0, 0, 0, 0);
    
    // Validate the date object
    if (isNaN(dueDate.getTime())) {
      throw new Error(`Invalid date created for installment ${i} from string: ${dueDateString}`);
    }
    
    // Calculate the start date of this period
    // Always use the previous installment's due date (cuota anterior)
    // For first installment (i=1), use installment 0 (disbursement) date
    // For others, use the previous installment's due date
    let periodStartDate: Date;
    if (i === 1) {
      // For first payment, use the disbursement date from installment 0
      // This ensures we calculate interest from the exact disbursement date
      const disbursementDateString = schedule[0].dueDate; // Installment 0 is always first
      // Parse the date string correctly - ensure it's a string first
      const dateStr = typeof disbursementDateString === 'string' ? disbursementDateString : String(disbursementDateString);
      if (dateStr.includes('T')) {
        periodStartDate = new Date(dateStr);
      } else {
        periodStartDate = new Date(dateStr + 'T12:00:00');
      }
    } else {
      // For subsequent payments, use the previous installment's due date
      // schedule[i-1] because schedule[0] is installment 0, schedule[1] is installment 1, etc.
      // When calculating installment i, schedule[i-1] is the previous installment
      const prevInstallment = schedule[i - 1];
      if (!prevInstallment || !prevInstallment.dueDate) {
        throw new Error(`Previous installment ${i - 1} not found or missing dueDate`);
      }
      const prevDueDateString = prevInstallment.dueDate;
      // Parse the date string correctly - ensure it's a string first
      const dateStr = typeof prevDueDateString === 'string' ? prevDueDateString : String(prevDueDateString);
      if (dateStr.includes('T')) {
        periodStartDate = new Date(dateStr);
      } else {
        periodStartDate = new Date(dateStr + 'T12:00:00');
      }
      
      // Validate the date
      if (isNaN(periodStartDate.getTime())) {
        throw new Error(`Invalid date string for previous installment: ${prevDueDateString}`);
      }
    }
    periodStartDate.setHours(0, 0, 0, 0);
    
    // Ensure dueDate is also at midnight
    dueDate.setHours(0, 0, 0, 0);
    
    // Validate that periodStartDate is before dueDate
    if (periodStartDate.getTime() > dueDate.getTime()) {
      throw new Error(`Period start date (${periodStartDate.toISOString()}) is after due date (${dueDate.toISOString()}) for installment ${i}`);
    }
    
    // Calculate days and base according to interest calculation base
    const calculationDays = calculateDaysForBase(periodStartDate, dueDate, loan.interestCalculationBase);
    const baseDenominator = getBaseDenominator(loan.interestCalculationBase);
    
    // Calculate interest using the selected base:
    // Interés = Saldo_anterior × Tasa_anual × (días / base)
    let interestAmount = currentBalance * annualRate * (calculationDays / baseDenominator);
    interestAmount = Math.round(interestAmount * 100) / 100;
    
    // Calculate principal using bank logic:
    // Capital = Cuota - Interés - Cargo_fijo
    let principalAmount = loan.installmentAmount - interestAmount - loan.fixedCharge;
    principalAmount = Math.max(0, Math.round(principalAmount * 100) / 100);
    
    // Update balance after this payment:
    // Saldo = Saldo_anterior - Capital
    let newBalance = currentBalance - principalAmount;
    newBalance = Math.max(0, Math.round(newBalance * 100) / 100);
    
    // Determine status
    let status: 'PENDING' | 'PAID' | 'OVERDUE' | 'FUTURE' = 'FUTURE';
    let paymentId: number | undefined;
    
    // Check if there's a payment for this installment
    const payment = payments.find((p) => p.installmentNumber === i);
    
    if (payment) {
      status = 'PAID';
      paymentId = payment.id;
      // Use actual payment data
      currentBalance = payment.outstandingBalance;
    } else {
      if (dueDate < today) {
        status = 'OVERDUE';
      } else if (dueDate.toDateString() === today.toDateString() || 
                 (dueDate < new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000))) {
        status = 'PENDING';
      }
      currentBalance = newBalance;
    }

    // Use the date string directly to avoid timezone shifts
    // The date was already created correctly above
    const formattedDueDate = dueDateString;
    
    schedule.push({
      installmentNumber: i,
      dueDate: formattedDueDate,
      principalAmount: payment ? Math.round(payment.principalAmount * 100) / 100 : principalAmount,
      interestAmount: payment ? Math.round(payment.interestAmount * 100) / 100 : interestAmount,
      chargeAmount: Math.round(loan.fixedCharge * 100) / 100,
      totalDue: Math.round(loan.installmentAmount * 100) / 100,
      outstandingBalance: Math.round(currentBalance * 100) / 100,
      status,
      paymentId,
    });
  }

  return schedule;
};

/**
 * Calculate interest accrued between two dates
 * Uses the specified calculation base: Interés = Saldo × Tasa_anual × (días / base)
 */
export const calculateAccruedInterest = (
  principal: number,
  interestRate: number,
  interestRateType: 'ANNUAL' | 'MONTHLY',
  fromDate: Date,
  toDate: Date,
  interestCalculationBase: 'ACTUAL_360' | 'ACTUAL_365' | '30_360' | '30_365' = 'ACTUAL_360'
): number => {
  // Get annual interest rate (convert to decimal)
  const annualRate = interestRateType === 'ANNUAL' 
    ? interestRate / 100 
    : (interestRate * 12) / 100; // Convert monthly to annual
  
  // Calculate days and base according to interest calculation base
  const calculationDays = calculateDaysForBase(fromDate, toDate, interestCalculationBase);
  const baseDenominator = getBaseDenominator(interestCalculationBase);
  
  // Calculate interest using the selected base: Interés = Saldo × Tasa_anual × (días / base)
  return principal * annualRate * (calculationDays / baseDenominator);
};

/**
 * Process a payment and calculate distribution
 */
export const processPayment = async (
  loanId: number,
  paymentDate: string,
  amountPaid: number,
  paymentType: 'COMPLETE' | 'PARTIAL' | 'ADVANCE' | 'INTEREST' = 'COMPLETE',
  installmentNumber?: number
): Promise<{
  principalAmount: number;
  interestAmount: number;
  chargeAmount: number;
  lateFee: number;
  outstandingBalance: number;
  installmentNumber: number;
}> => {
  // Get loan details
  const loanResult = await query(
    `SELECT id, total_amount, interest_rate, interest_rate_type, total_installments,
            installment_amount, fixed_charge, start_date, payment_day, currency,
            interest_calculation_base
     FROM loans WHERE id = $1`,
    [loanId]
  );

  if (loanResult.rows.length === 0) {
    throw new Error('Loan not found');
  }

  const loan: LoanDetails = {
    id: loanResult.rows[0].id,
    totalAmount: parseFloat(loanResult.rows[0].total_amount),
    interestRate: parseFloat(loanResult.rows[0].interest_rate),
    interestRateType: loanResult.rows[0].interest_rate_type,
    totalInstallments: loanResult.rows[0].total_installments,
    installmentAmount: parseFloat(loanResult.rows[0].installment_amount),
    fixedCharge: parseFloat(loanResult.rows[0].fixed_charge || 0),
    startDate: loanResult.rows[0].start_date,
    paymentDay: loanResult.rows[0].payment_day,
    currency: loanResult.rows[0].currency,
    interestCalculationBase: loanResult.rows[0].interest_calculation_base || 'ACTUAL_360',
  };

  // Get current outstanding balance
  const balanceResult = await query(
    `SELECT COALESCE(outstanding_balance, $1) as balance
     FROM loan_payments 
     WHERE loan_id = $2 
     ORDER BY payment_date DESC, id DESC 
     LIMIT 1`,
    [loan.totalAmount, loanId]
  );

  let currentBalance = balanceResult.rows.length > 0 
    ? parseFloat(balanceResult.rows[0].balance) 
    : loan.totalAmount;

  // Get last payment date to calculate accrued interest
  const lastPaymentResult = await query(
    `SELECT payment_date 
     FROM loan_payments 
     WHERE loan_id = $1 
     ORDER BY payment_date DESC 
     LIMIT 1`,
    [loanId]
  );

  const lastPaymentDate = lastPaymentResult.rows.length > 0
    ? new Date(lastPaymentResult.rows[0].payment_date)
    : new Date(loan.startDate);

  const paymentDateObj = new Date(paymentDate);
  
  // Validate dates
  if (isNaN(lastPaymentDate.getTime())) {
    throw new Error('Fecha de último pago inválida');
  }
  if (isNaN(paymentDateObj.getTime())) {
    throw new Error('Fecha de pago inválida');
  }
  
  // Allow payment date to be before last payment date if:
  // 1. A specific installment number is provided (allows retroactive payments for specific installments)
  // 2. OR if it's an INTEREST payment type (can be for any date)
  // Otherwise, only warn but don't block if there's no payment after this date
  if (paymentDateObj < lastPaymentDate) {
    // If a specific installment is provided, allow it (retroactive payment)
    if (installmentNumber !== undefined) {
      // Allow retroactive payments for specific installments
      // This is useful when paying a missed installment
    } else if (paymentType === 'INTEREST') {
      // Allow interest payments for any date
    } else {
      // For regular payments without specific installment, check if there's a conflict
      const laterPaymentResult = await query(
        `SELECT installment_number, payment_date 
         FROM loan_payments 
         WHERE loan_id = $1 AND payment_date > $2
         ORDER BY payment_date ASC
         LIMIT 1`,
        [loanId, paymentDate]
      );
      
      // If there's a payment after this date, warn but allow if it's for a different installment
      // This allows flexibility for retroactive payments
    }
  }
  
  // Calculate accrued interest since last payment
  const accruedInterest = calculateAccruedInterest(
    currentBalance,
    loan.interestRate,
    loan.interestRateType,
    lastPaymentDate,
    paymentDateObj,
    loan.interestCalculationBase
  );
  
  // Ensure accrued interest is valid
  if (isNaN(accruedInterest) || accruedInterest < 0) {
    throw new Error('Error al calcular intereses devengados');
  }

  // Determine which installment this payment is for
  const schedule = await generateAmortizationSchedule(loanId);
  let targetInstallmentNumber: number;
  
  if (installmentNumber !== undefined) {
    // If installment number is provided, use it (for cuota 0 or specific installment)
    targetInstallmentNumber = installmentNumber;
  } else {
    const nextPendingInstallment = schedule.find((item) => item.status === 'PENDING' || item.status === 'OVERDUE');
    targetInstallmentNumber = nextPendingInstallment 
      ? nextPendingInstallment.installmentNumber 
      : schedule.filter((item) => item.status === 'PAID').length + 1;
  }

  // Get expected payment for this installment
  const expectedPayment = schedule.find((item) => item.installmentNumber === targetInstallmentNumber);
  
  let interestAmount = 0;
  let principalAmount = 0;
  let chargeAmount = loan.fixedCharge;
  let lateFee = 0;

  // Handle payment type INTEREST - only pay interest, don't affect balance
  // Note: INTEREST payments cannot be made to installment 0 (disbursement)
  if (paymentType === 'INTEREST') {
    // For installment 0, INTEREST payments are not allowed
    if (targetInstallmentNumber === 0) {
      throw new Error('Los pagos de intereses no pueden aplicarse a la cuota 0 (Desembolso)');
    }
    
    if (expectedPayment) {
      interestAmount = Math.min(amountPaid, expectedPayment.interestAmount);
      // Don't update balance for interest-only payments
      return {
        principalAmount: 0,
        interestAmount: interestAmount,
        chargeAmount: 0,
        lateFee: 0,
        outstandingBalance: currentBalance, // Balance unchanged
        installmentNumber: targetInstallmentNumber,
      };
    } else {
      // If no expected payment, use accrued interest (but ensure it's valid)
      const validAccruedInterest = Math.max(0, accruedInterest);
      interestAmount = Math.min(amountPaid, validAccruedInterest);
      
      // Ensure we have a valid installment number
      if (targetInstallmentNumber < 1 || targetInstallmentNumber > loan.totalInstallments) {
        throw new Error(`Número de cuota inválido: ${targetInstallmentNumber}`);
      }
      
      return {
        principalAmount: 0,
        interestAmount: interestAmount,
        chargeAmount: 0,
        lateFee: 0,
        outstandingBalance: currentBalance, // Balance unchanged
        installmentNumber: targetInstallmentNumber,
      };
    }
  }

  // Handle installment 0 (disbursement) - payments go directly to capital
  if (targetInstallmentNumber === 0) {
    principalAmount = amountPaid;
    return {
      principalAmount: principalAmount,
      interestAmount: 0,
      chargeAmount: 0,
      lateFee: 0,
      outstandingBalance: Math.max(0, currentBalance - principalAmount),
      installmentNumber: 0,
    };
  }

  if (expectedPayment) {
    // Calculate if payment is late
    const dueDate = new Date(expectedPayment.dueDate);
    const daysLate = daysBetween(paymentDateObj, dueDate);
    
    if (daysLate > 0 && paymentDateObj > dueDate) {
      // Calculate late fee (example: 1% per day, max 5% of installment)
      const lateFeeRate = 0.01; // 1% per day
      lateFee = Math.min(
        currentBalance * lateFeeRate * daysLate,
        loan.installmentAmount * 0.05
      );
    }

    // Expected interest for this installment
    interestAmount = expectedPayment.interestAmount;
    
    // Distribution logic:
    // 1. First pay late fees
    // 2. Then pay interest
    // 3. Then pay fixed charge
    // 4. Remaining goes to principal
    
    let remainingAmount = amountPaid;
    
    // Pay late fee first
    if (lateFee > 0 && remainingAmount > 0) {
      const lateFeePaid = Math.min(remainingAmount, lateFee);
      lateFee = lateFeePaid;
      remainingAmount -= lateFeePaid;
    }
    
    // Pay interest
    if (remainingAmount > 0) {
      const interestPaid = Math.min(remainingAmount, interestAmount);
      interestAmount = interestPaid;
      remainingAmount -= interestPaid;
    }
    
    // Pay fixed charge
    if (remainingAmount > 0) {
      const chargePaid = Math.min(remainingAmount, chargeAmount);
      chargeAmount = chargePaid;
      remainingAmount -= chargePaid;
    }
    
    // Remaining goes to principal
    principalAmount = remainingAmount;
    
    // If payment type is COMPLETE, ensure we pay the full expected amount
    if (paymentType === 'COMPLETE' && amountPaid < expectedPayment.totalDue + lateFee) {
      // Adjust to ensure full payment
      const shortfall = (expectedPayment.totalDue + lateFee) - amountPaid;
      principalAmount += shortfall;
    }
  } else {
    // Advance payment - apply to next installment
    interestAmount = accruedInterest;
    principalAmount = amountPaid - interestAmount - chargeAmount;
  }

  // Update balance
  const outstandingBalance = Math.max(0, currentBalance - principalAmount);

  return {
    principalAmount: Math.max(0, principalAmount),
    interestAmount: Math.max(0, interestAmount),
    chargeAmount: Math.max(0, chargeAmount),
    lateFee: Math.max(0, lateFee),
    outstandingBalance,
    installmentNumber: targetInstallmentNumber,
  };
};

/**
 * Save or update amortization schedule in database
 */
export const saveAmortizationSchedule = async (
  loanId: number,
  schedule: AmortizationScheduleItem[]
): Promise<void> => {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');
    
    // Delete existing schedule
    await client.query('DELETE FROM amortization_schedule WHERE loan_id = $1', [loanId]);
    
    // Insert new schedule
    for (const item of schedule) {
      await client.query(
        `INSERT INTO amortization_schedule 
         (loan_id, installment_number, due_date, principal_amount, interest_amount, 
          charge_amount, total_due, outstanding_balance, status, payment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (loan_id, installment_number) 
         DO UPDATE SET
           principal_amount = EXCLUDED.principal_amount,
           interest_amount = EXCLUDED.interest_amount,
           charge_amount = EXCLUDED.charge_amount,
           total_due = EXCLUDED.total_due,
           outstanding_balance = EXCLUDED.outstanding_balance,
           status = EXCLUDED.status,
           payment_id = EXCLUDED.payment_id,
           updated_at = CURRENT_TIMESTAMP`,
        [
          loanId,
          item.installmentNumber,
          item.dueDate,
          item.principalAmount,
          item.interestAmount,
          item.chargeAmount,
          item.totalDue,
          item.outstandingBalance,
          item.status,
          item.paymentId || null,
        ]
      );
    }
    
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
