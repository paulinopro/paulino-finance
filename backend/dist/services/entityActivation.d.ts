declare const ENTITY_TABLES: {
    readonly accounts: "bank_accounts";
    readonly income: "income";
    readonly expenses: "expenses";
    readonly cards: "credit_cards";
    readonly loans: "loans";
    readonly accountsPayable: "accounts_payable";
    readonly accountsReceivable: "accounts_receivable";
};
export type ActivatableEntity = keyof typeof ENTITY_TABLES;
type QueryResultLike = {
    rows: any[];
};
export type ActivationQueryExecutor = (sql: string, params?: unknown[]) => Promise<QueryResultLike>;
export declare class InactiveEntityError extends Error {
    readonly code = "ENTITY_INACTIVE";
    constructor(message?: string);
}
export declare function setEntityActiveStatus(entity: ActivatableEntity, id: number, userId: number, isActive: boolean, executor?: ActivationQueryExecutor): Promise<{
    id: number;
    isActive: boolean;
} | null>;
export declare function requireEntityActive(entity: ActivatableEntity, id: number, userId: number, executor?: ActivationQueryExecutor): Promise<void | false>;
export declare function requireEntityActiveForUpdate(entity: ActivatableEntity, id: number, userId: number, executor?: ActivationQueryExecutor): Promise<void | false>;
export {};
//# sourceMappingURL=entityActivation.d.ts.map