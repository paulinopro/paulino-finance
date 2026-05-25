import { type UserCurrencyPair } from '../utils/userCurrencyPair';
export type UserConversionContext = {
    userId: number;
    pair: UserCurrencyPair;
    /** Tasas con base = moneda principal: amount_in_C / rates[C] = amount en principal */
    rates: Record<string, number>;
    /** Secundaria por 1 principal (para mostrar en UI). */
    pairRateSecondaryPerPrimary: number;
    usedManualPairRate: boolean;
};
/**
 * Contexto de conversión para un usuario: tasas con base = moneda principal.
 * Si `exchange_rate_manual` > 0, sustituye solo la tasa del código secundario del par.
 */
export declare function getConversionContextForUser(userId: number): Promise<UserConversionContext>;
/**
 * Convierte `amount` expresado en `currency` (ISO) a equivalente en moneda principal.
 * Usa tasas open.er con base = primary: `rates[C]` = unidades de C por 1 primary → primary_eq = amount / rates[C].
 */
export declare function amountToPrimary(amount: number, currency: string, ctx: UserConversionContext): number;
/**
 * Convierte saldos de cuenta bancaria a moneda principal.
 * Las columnas `balance_dop` / `balance_usd` son el primer y segundo “riel” del par del usuario
 * (principal / secundaria), no necesariamente DOP ni USD.
 */
export declare function bankBalancesToPrimary(balanceDop: number, balanceUsd: number, ctx: UserConversionContext): number;
//# sourceMappingURL=userCurrencyConversion.d.ts.map