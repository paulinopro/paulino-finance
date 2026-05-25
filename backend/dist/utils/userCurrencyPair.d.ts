import { AllowedCurrencyCode } from '../constants/userPreferences';
export type UserCurrencyPair = {
    primary: AllowedCurrencyCode;
    secondary: AllowedCurrencyCode;
};
/** Moneda secundaria por defecto cuando falta dato o coincide con la principal */
export declare function defaultSecondaryForPrimary(primary: AllowedCurrencyCode): AllowedCurrencyCode;
/** Par estable a partir de columnas de usuario (sync, p. ej. respuestas auth). */
export declare function resolvedCurrencyPairFromRow(row: {
    currency_preference?: string | null;
    secondary_currency_preference?: string | null;
}): UserCurrencyPair;
/** Campos en camelCase para respuestas JSON de auth. */
export declare function userCurrencyPreferencePayload(row: {
    currency_preference?: string | null;
    secondary_currency_preference?: string | null;
}): {
    currencyPreference: AllowedCurrencyCode;
    secondaryCurrencyPreference: AllowedCurrencyCode;
};
export declare function getUserCurrencyPair(userId: number): Promise<UserCurrencyPair>;
export declare function isCurrencyInUserPair(pair: UserCurrencyPair, currency: string): boolean;
/** Movimientos / transferencias: la moneda debe ser la principal o la secundaria del perfil. */
export declare function validateLedgerCurrencyForUser(pair: UserCurrencyPair, currency: string): string | null;
//# sourceMappingURL=userCurrencyPair.d.ts.map