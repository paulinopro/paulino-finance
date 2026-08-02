export type FinancialEntity = 'cards' | 'loans' | 'income' | 'expenses' | 'accountsPayable' | 'accountsReceivable';

const FINANCIAL_UPDATE_FIELDS: Record<FinancialEntity, ReadonlySet<string>> = {
  cards: new Set(['currentDebtDop', 'currentDebtUsd']),
  loans: new Set([
    'totalAmount',
    'interestRate',
    'interestRateType',
    'totalInstallments',
    'paidInstallments',
    'startDate',
    'endDate',
    'installmentAmount',
    'fixedCharge',
    'paymentDay',
    'currency',
    'status',
    'interestCalculationBase',
  ]),
  income: new Set([
    'amount',
    'currency',
    'nature',
    'recurrenceType',
    'recurrence_type',
    'frequency',
    'receiptDay',
    'date',
    'bankAccountId',
    'isReceived',
    'recurrenceStartDate',
    'recurrenceEndDate',
  ]),
  accountsPayable: new Set(['amount', 'currency', 'dueDate']),
  accountsReceivable: new Set(['amount', 'currency', 'dueDate']),
  expenses: new Set([
    'amount',
    'currency',
    'nature',
    'recurrenceType',
    'recurrence_type',
    'frequency',
    'paymentDay',
    'paymentMonth',
    'date',
    'bankAccountId',
    'isPaid',
    'recurrenceStartDate',
    'recurrenceEndDate',
  ]),
};

export function financialEntityUpdateRequiresActive(
  entity: FinancialEntity,
  body: Record<string, unknown>
): boolean {
  const financialFields = FINANCIAL_UPDATE_FIELDS[entity];
  return Object.keys(body).some((key) => financialFields.has(key));
}
