import { PoolClient } from 'pg';
export declare function getExpensePeriodAmount(userId: number, expenseId: number, year: number, month: number, client?: PoolClient): Promise<number | null>;
export declare function upsertExpensePeriodAmount(client: PoolClient | undefined, userId: number, expenseId: number, year: number, month: number, amount: number): Promise<void>;
export declare function deleteExpensePeriodAmount(client: PoolClient | undefined, userId: number, expenseId: number, year: number, month: number): Promise<void>;
export declare function getIncomePeriodAmount(userId: number, incomeId: number, year: number, month: number, client?: PoolClient): Promise<number | null>;
export declare function upsertIncomePeriodAmount(client: PoolClient | undefined, userId: number, incomeId: number, year: number, month: number, amount: number): Promise<void>;
export declare function deleteIncomePeriodAmount(client: PoolClient | undefined, userId: number, incomeId: number, year: number, month: number): Promise<void>;
//# sourceMappingURL=recurringPeriodAmounts.d.ts.map