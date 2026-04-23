export interface User {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  /** Cédula de identidad (opcional) */
  cedula?: string | null;
  telegramChatId?: string;
  currencyPreference: string;
  exchangeRateDopUsd: number;
  timezone?: string;
  isSuperAdmin?: boolean;
  isActive?: boolean;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  /** Fila en `user_subscriptions` (fuente de verdad en servidor). Evita redirección errónea a /subscription al recargar. */
  hasUserSubscriptionRecord?: boolean;
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
  bankAccountId?: number | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CardPayment {
  id: number;
  amount: number;
  currency: string;
  paymentDate: string;
  bankAccountId?: number | null;
  notes?: string;
  createdAt: string;
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

/** Tipo fijo/variable — API `nature` */
export type IncomeNature = 'fixed' | 'variable';
/** Recurrente vs único — API `recurrence_type` */
export type IncomeRecurrenceType = 'recurrent' | 'non_recurrent';
/** Frecuencia canónica (minúsculas) — API `frequency` */
export type IncomeFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'semi_monthly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual';

export interface Income {
  id: number;
  description: string;
  amount: number;
  currency: string;
  nature: IncomeNature;
  recurrenceType?: IncomeRecurrenceType;
  frequency?: string | null;
  receiptDay?: number;
  date?: string;
  bankAccountId?: number | null;
  /** Ingreso acreditado en la cuenta (actualiza saldo al marcar «Recibido» si hay cuenta vinculada) */
  isReceived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Tipo (fijo / variable) — API `nature` */
export type ExpenseNature = 'fixed' | 'variable';
/** Naturaleza (recurrente / único) — API `recurrence_type` */
export type ExpenseRecurrenceType = 'recurrent' | 'non_recurrent';
/** Frecuencia — API `frequency` (minúsculas) */
export type ExpenseFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'semi_monthly'
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual';

export interface Expense {
  id: number;
  description: string;
  amount: number;
  currency: string;
  nature: ExpenseNature;
  /** Recurrente vs único */
  recurrenceType?: ExpenseRecurrenceType;
  /** Frecuencia para gastos recurrentes */
  frequency?: ExpenseFrequency | null;
  category?: string;
  paymentDay?: number;
  paymentMonth?: number;
  date?: string;
  isPaid: boolean;
  bankAccountId?: number | null;
  /** Si el gasto está vinculado a un vehículo (origen módulo Vehículos) */
  vehicleId?: number | null;
  vehicleLabel?: string | null;
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
  /** banco vs efectivo / billetera */
  accountKind: 'bank' | 'cash' | 'wallet';
  createdAt: string;
  updatedAt: string;
}

/** Notificación in-app (evitar el nombre `Notification`: choca con la API del navegador en el bundler). */
export interface AppNotification {
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
    byKind?: {
      bank: { dop: number; usd: number; dopUnified: number };
      cash: { dop: number; usd: number; dopUnified: number };
    };
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
  /** Cantidad de cuentas en bank_accounts */
  bankAccounts: number;
  /** Cantidad de tarjetas registradas */
  creditCards: number;
  /** Cantidad de préstamos registrados */
  loans: number;
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