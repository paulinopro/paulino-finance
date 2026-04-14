export interface User {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  telegramChatId?: string;
  currencyPreference: string;
  exchangeRateDopUsd: number;
  timezone?: string;
  isSuperAdmin?: boolean;
  isActive?: boolean;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
}

export interface CreditCard {
  id: number;
  bankName: string;
  cardName: string;
  creditLimitDop: number;
  creditLimitUsd: number;
  currentDebtDop: number;
  currentDebtUsd: number;
  minimumPaymentDop?: number;
  minimumPaymentUsd?: number;
  cutOffDay: number;
  paymentDueDay: number;
  currencyType: 'DOP' | 'USD' | 'DUAL';
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id: number;
  loanName: string;
  bankName?: string;
  totalAmount: number;
  interestRate: number;
  interestRateType: 'ANNUAL' | 'MONTHLY';
  totalInstallments: number;
  paidInstallments: number;
  startDate: string;
  endDate?: string;
  installmentAmount: number;
  paymentDay?: number;
  nextPaymentDate?: string;
  currency: string;
  status: 'ACTIVE' | 'PAID' | 'DEFAULTED';
  interestCalculationBase?: 'ACTUAL_360' | 'ACTUAL_365' | '30_360' | '30_365';
  totalPaid?: number;
  remainingBalance?: number;
  progress?: number;
  payments?: LoanPayment[];
  createdAt: string;
  updatedAt: string;
}

export interface LoanPayment {
  id: number;
  paymentDate: string;
  amount: number;
  principalAmount?: number;
  interestAmount?: number;
  chargeAmount?: number;
  lateFee?: number;
  installmentNumber: number;
  outstandingBalance?: number;
  paymentType?: 'COMPLETE' | 'PARTIAL' | 'ADVANCE';
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

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

export interface LoanAmortizationSummary {
  loanId: number;
  loanName: string;
  bankName?: string;
  originalAmount: number;
  currentBalance: number;
  balancePercentage: number;
  paidInstallments: number;
  totalInstallments: number;
  completionPercentage: number;
  totalPrincipalPaid: number;
  totalInterestPaid: number;
  startDate: string;
  currency: string;
  nextPaymentDate?: string;
}

export interface ExpenseCategory {
  id: number;
  name: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: number;
  eventType: 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'INCOME' | 'EXPENSE' | 'RECURRING_EXPENSE';
  relatedId: number;
  relatedType: string;
  eventDate: string;
  title: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'RECEIVED' | 'OVERDUE' | 'CANCELLED';
  isRecurring: boolean;
  recurrencePattern?: string;
  color: string;
  notes?: string;
}

export interface FinancialSummary {
  totalIncome: number;
  totalExpenses: number;
  balance: number;
  pendingPayments: number;
  overduePayments: number;
}

export interface Income {
  id: number;
  description: string;
  amount: number;
  currency: string;
  incomeType: 'FIXED' | 'VARIABLE';
  frequency?: string;
  receiptDay?: number;
  date?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: number;
  description: string;
  amount: number;
  currency: string;
  expenseType: 'RECURRING_MONTHLY' | 'NON_RECURRING' | 'ANNUAL';
  category?: string;
  paymentDay?: number;
  paymentMonth?: number;
  date?: string;
  isPaid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BankAccount {
  id: number;
  bankName: string;
  accountType: string;
  accountNumber?: string;
  balanceDop: number;
  balanceUsd: number;
  currencyType: 'DOP' | 'USD' | 'DUAL';
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  relatedId?: number;
  relatedType?: string;
  isRead: boolean;
  createdAt: string;
}

export interface DashboardSummary {
  assets: {
    dop: number;
    usd: number;
    dopUnified: number;
  };
  debts: {
    dop: number;
    usd: number;
    dopUnified: number;
    cards: {
      dop: number;
      usd: number;
    };
    loans: {
      dop: number;
      usd: number;
    };
  };
  netWorth: {
    dop: number;
    usd: number;
    dopUnified: number;
  };
  accountsPayable: {
    count: number;
    totalDop: number;
  };
  accountsReceivable: {
    count: number;
    totalDop: number;
  };
  activeBudgets: number;
  activeGoals: number;
  vehicles: number;
  exchangeRate: number;
}

export interface DashboardStats {
  expensesByCategory: { [key: string]: number };
  incomeVsExpenses: {
    income: number;
    expenses: number;
    difference: number;
  };
  debtProgress: Array<{
    id: number;
    loanName: string;
    bankName?: string;
    totalAmount: number;
    totalPaid: number;
    remaining: number;
    progress: number;
    paidInstallments: number;
    totalInstallments: number;
    currency: string;
  }>;
  exchangeRate: number;
}

export interface DailyHealthData {
  date: string;
  income: {
    total: number;
    change: number;
  };
  expenses: {
    total: number;
    change: number;
    byCategory: { [key: string]: number };
  };
  savings: {
    amount: number;
    rate: number;
  };
  debts: {
    total: number;
    cards: number;
    loans: number;
  };
  ratios: {
    debtToIncome: number;
    expenseToIncome: number;
  };
  healthScore: number;
  exchangeRate: number;
}

export interface WeeklyHealthData {
  weekStart: string;
  weekEnd: string;
  income: {
    total: number;
    change: number;
  };
  expenses: {
    total: number;
    change: number;
    byCategory: { [key: string]: number };
  };
  savings: {
    amount: number;
    rate: number;
  };
  debts: {
    total: number;
    cards: number;
    loans: number;
  };
  ratios: {
    debtToIncome: number;
    expenseToIncome: number;
  };
  healthScore: number;
  exchangeRate: number;
}

export interface MonthlyHealthData {
  month: number;
  year: number;
  income: {
    total: number;
    change: number;
  };
  expenses: {
    total: number;
    change: number;
    byCategory: { [key: string]: number };
  };
  savings: {
    amount: number;
    rate: number;
  };
  debts: {
    total: number;
    cards: number;
    loans: number;
  };
  ratios: {
    debtToIncome: number;
    expenseToIncome: number;
  };
  healthScore: number;
  exchangeRate: number;
}

export interface AnnualHealthData {
  year: number;
  income: {
    total: number;
    change: number;
    monthly: Array<{ month: string; value: number }>;
  };
  expenses: {
    total: number;
    change: number;
    monthly: Array<{ month: string; value: number }>;
    byCategory: { [key: string]: number };
  };
  savings: {
    amount: number;
    rate: number;
    monthly: Array<{ month: string; value: number }>;
  };
  debts: {
    total: number;
    cards: number;
    loans: number;
  };
  ratios: {
    debtToIncome: number;
    expenseToIncome: number;
  };
  healthScore: number;
  monthlyData: Array<{
    month: number;
    monthName: string;
    income: number;
    expenses: number;
    savings: number;
  }>;
  exchangeRate: number;
}