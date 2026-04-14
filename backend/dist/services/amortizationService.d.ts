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
 * Calculate effective annual rate (EAR) from nominal annual rate with monthly compounding
 *
 * Formula: EAR = (1 + nominal_rate/12)^12 - 1
 *
 * Example: 16% nominal annual
 * - EAR = (1 + 0.16/12)^12 - 1 ≈ 17.2%
 */
export declare const calculateEffectiveAnnualRate: (nominalAnnualRate: number) => number;
/**
 * Generate complete amortization schedule for a loan
 */
export declare const generateAmortizationSchedule: (loanId: number, userId?: number) => Promise<AmortizationScheduleItem[]>;
/**
 * Calculate interest accrued between two dates
 * Uses the specified calculation base: Interés = Saldo × Tasa_anual × (días / base)
 */
export declare const calculateAccruedInterest: (principal: number, interestRate: number, interestRateType: "ANNUAL" | "MONTHLY", fromDate: Date, toDate: Date, interestCalculationBase?: "ACTUAL_360" | "ACTUAL_365" | "30_360" | "30_365") => number;
/**
 * Process a payment and calculate distribution
 */
export declare const processPayment: (loanId: number, paymentDate: string, amountPaid: number, paymentType?: "COMPLETE" | "PARTIAL" | "ADVANCE" | "INTEREST", installmentNumber?: number) => Promise<{
    principalAmount: number;
    interestAmount: number;
    chargeAmount: number;
    lateFee: number;
    outstandingBalance: number;
    installmentNumber: number;
}>;
/**
 * Save or update amortization schedule in database
 */
export declare const saveAmortizationSchedule: (loanId: number, schedule: AmortizationScheduleItem[]) => Promise<void>;
//# sourceMappingURL=amortizationService.d.ts.map