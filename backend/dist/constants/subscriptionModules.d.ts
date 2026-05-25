/**
 * Claves de módulos alineadas con rutas de la app (API y front).
 * Espejo en el cliente: `frontend/src/constants/subscriptionModules.ts` — mantener sincronizados.
 */
export declare const SUBSCRIPTION_MODULE_KEYS: readonly ["dashboard", "cards", "loans", "income", "expenses", "accounts", "reports", "calendar", "agenda", "accounts_payable", "accounts_receivable", "budgets", "financial_goals", "cash_flow", "projections", "vehicles", "notifications", "categories", "templates", "settings", "profile", "subscription"];
export type SubscriptionModuleKey = (typeof SUBSCRIPTION_MODULE_KEYS)[number];
export declare function defaultEnabledModulesAll(): Record<string, boolean>;
/** Plan gratuito mínimo: panel, perfil, suscripción y preferencias básicas. */
export declare function defaultEnabledModulesFree(): Record<string, boolean>;
/**
 * Aplica payload de `enabled_modules` (objeto clave → boolean) dejando solo claves conocidas.
 * Valores faltantes quedan en `false` (nunca se aceptan claves extra).
 */
export declare function normalizeEnabledModulesObject(raw: unknown): Record<string, boolean>;
/** `true` si al menos un módulo está habilitado (planes de suscripción no deben quedar con todos en false). */
export declare function enabledModulesHasAtLeastOne(m: Record<string, boolean>): boolean;
export declare function modulesFromJson(json: unknown): string[];
//# sourceMappingURL=subscriptionModules.d.ts.map