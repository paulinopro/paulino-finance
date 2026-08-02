"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.financialEntityUpdateRequiresActive = financialEntityUpdateRequiresActive;
const FINANCIAL_UPDATE_FIELDS = {
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
function financialEntityUpdateRequiresActive(entity, body) {
    const financialFields = FINANCIAL_UPDATE_FIELDS[entity];
    return Object.keys(body).some((key) => financialFields.has(key));
}
//# sourceMappingURL=financialEntityMutation.js.map