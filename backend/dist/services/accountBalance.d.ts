import { PoolClient } from 'pg';
import { type UserCurrencyPair } from '../utils/userCurrencyPair';
export type BankAccountMovementStatus = 'completed' | 'pending' | 'cancelled';
export type ApplyBalanceMovementMeta = {
    description?: string;
    status?: BankAccountMovementStatus;
};
/**
 * `currency_type` en BD: DOP = solo primer riel (moneda principal del usuario), USD = solo segundo riel
 * (secundaria), DUAL = ambos. Los nombres del enum son legado; el riel 1 va en `balance_dop`, el 2 en `balance_usd`.
 */
export declare function isCurrencyAllowedForAccount(currencyType: string, currency: string, pair: UserCurrencyPair): boolean;
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
export declare function parseBalanceForCurrency(row: AccountRow, currency: string, pair: UserCurrencyPair): number;
/**
 * Adds delta to the balance in the given currency leg (DOP or USD).
 */
export declare function applyBalanceDelta(userId: number, accountId: number, currency: string, delta: number, client?: PoolClient, movement?: ApplyBalanceMovementMeta | null): Promise<void>;
/** Registra un movimiento en el libro de la cuenta sin modificar saldo (p. ej. saldo inicial o ajuste manual ya reflejado en `bank_accounts`). */
export declare function recordBankAccountMovement(userId: number, accountId: number, currency: string, direction: 'IN' | 'OUT', amount: number, description: string, status?: BankAccountMovementStatus, client?: PoolClient): Promise<void>;
//# sourceMappingURL=accountBalance.d.ts.map