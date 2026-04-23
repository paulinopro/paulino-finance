export declare const roundMoney: (n: number) => number;
export declare function getTotalPaidPayable(accountPayableId: number): Promise<number>;
export declare function recalculatePayableStatus(accountPayableId: number, userId: number): Promise<void>;
export declare function expenseDescriptionForPayable(expenseId: number | null, userId: number, accountDescription: string): Promise<string>;
export declare function getTotalReceivedReceivable(accountReceivableId: number): Promise<number>;
export declare function recalculateReceivableStatus(accountReceivableId: number, userId: number): Promise<void>;
export declare function incomeDescriptionForReceivable(incomeId: number | null, userId: number, accountDescription: string): Promise<string>;
/** Valida PUT de gasto si está vinculado a un abono de cuenta por pagar. */
export declare function validateExpenseUpdateForLinkedPayable(userId: number, expenseId: number, body: {
    amount?: unknown;
    currency?: unknown;
}): Promise<string | null>;
/** Tras actualizar fila en expenses: sincroniza abono y estado de la cuenta. */
export declare function syncPayablePaymentFromExpense(userId: number, expenseId: number): Promise<void>;
/** Elimina el abono en BD antes de borrar el gasto. */
export declare function deletePayablePaymentByExpenseId(userId: number, expenseId: number): Promise<void>;
/** Valida PUT de ingreso si está vinculado a abono de cuenta por cobrar. */
export declare function validateIncomeUpdateForLinkedReceivable(userId: number, incomeId: number, body: {
    amount?: unknown;
    currency?: unknown;
}): Promise<string | null>;
export declare function syncReceivablePaymentFromIncome(userId: number, incomeId: number): Promise<void>;
export declare function deleteReceivablePaymentByIncomeId(userId: number, incomeId: number): Promise<void>;
//# sourceMappingURL=accountsPaymentLinkSync.d.ts.map