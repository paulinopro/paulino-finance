import { PoolClient } from 'pg';
export type BankAccountMovementStatus = 'completed' | 'pending' | 'cancelled';
export type ApplyBalanceMovementMeta = {
    description?: string;
    status?: BankAccountMovementStatus;
};
export declare function isCurrencyAllowedForAccount(currencyType: string, currency: string): boolean;
export type AccountRow = {
    id: number;
    user_id: number;
    balance_dop: string;
    balance_usd: string;
    currency_type: string;
    account_kind: string;
    bank_name: string | null;
};
export declare function getAccountRow(userId: number, accountId: number, client?: PoolClient): Promise<AccountRow | undefined>;
export declare function parseBalanceForCurrency(row: AccountRow, currency: string): number;
/**
 * Adds delta to the balance in the given currency leg (DOP or USD).
 */
export declare function applyBalanceDelta(userId: number, accountId: number, currency: string, delta: number, client?: PoolClient, movement?: ApplyBalanceMovementMeta | null): Promise<void>;
/** Registra un movimiento en el libro de la cuenta sin modificar saldo (p. ej. saldo inicial o ajuste manual ya reflejado en `bank_accounts`). */
export declare function recordBankAccountMovement(userId: number, accountId: number, currency: string, direction: 'IN' | 'OUT', amount: number, description: string, status?: BankAccountMovementStatus, client?: PoolClient): Promise<void>;
//# sourceMappingURL=accountBalance.d.ts.map