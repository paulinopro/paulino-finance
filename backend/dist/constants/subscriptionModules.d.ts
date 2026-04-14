/** Claves de módulos alineadas con rutas de la app (API y front). */
export declare const SUBSCRIPTION_MODULE_KEYS: readonly ["dashboard", "cards", "loans", "income", "expenses", "accounts", "reports", "calendar", "accounts_payable", "accounts_receivable", "budgets", "financial_goals", "cash_flow", "projections", "vehicles", "notifications", "categories", "templates", "settings", "profile", "subscription"];
export type SubscriptionModuleKey = (typeof SUBSCRIPTION_MODULE_KEYS)[number];
export declare function defaultEnabledModulesAll(): Record<string, boolean>;
/** Plan gratuito mínimo: panel, perfil, suscripción y preferencias básicas. */
export declare function defaultEnabledModulesFree(): Record<string, boolean>;
export declare function modulesFromJson(json: unknown): string[];
//# sourceMappingURL=subscriptionModules.d.ts.map