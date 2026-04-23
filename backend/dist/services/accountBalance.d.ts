import { PoolClient } from 'pg';
export declare function isCurrencyAllowedForAccount(currencyType: string, currency: string): boolean;
export type AccountRow = {
    id: number;
    user_id: number;
    balance_dop: string;
    balance_usd: string;
    currency_type: string;
    account_kind: string;
};
export declare function getAccountRow(userId: number, accountId: number, client?: PoolClient): Promise<AccountRow | undefined>;
export declare function parseBalanceForCurrency(row: AccountRow, currency: string): number;
/**
 * Adds delta to the balance in the given currency leg (DOP or USD).
 */
export declare function applyBalanceDelta(userId: number, accountId: number, currency: string, delta: number, client?: PoolClient): Promise<void>;
//# sourceMappingURL=accountBalance.d.ts.map