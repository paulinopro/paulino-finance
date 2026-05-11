/**
 * Debe coincidir con `backend/src/constants/subscriptionModules.ts` (única fuente de claves en servidor).
 */
export const SUBSCRIPTION_MODULE_KEYS = [
  'dashboard',
  'cards',
  'loans',
  'income',
  'expenses',
  'accounts',
  'reports',
  'calendar',
  'accounts_payable',
  'accounts_receivable',
  'budgets',
  'financial_goals',
  'cash_flow',
  'projections',
  'vehicles',
  'notifications',
  'categories',
  'templates',
  'settings',
  'profile',
  'subscription',
] as const;

/** Valores de `user_subscriptions.status` en el filtro admin. Etiquetas: `pages.adminUsers.subscriptionStatus.*`. */
export const SUBSCRIPTION_STATUS_FILTER_VALUES = [
  'active',
  'trialing',
  'cancelled',
  'expired',
  'past_due',
] as const;

/** Al menos un módulo en `true` (misma regla que el API). */
export function enabledModulesHasAtLeastOne(
  m: Record<string, boolean> | null | undefined
): boolean {
  if (!m) return false;
  return SUBSCRIPTION_MODULE_KEYS.some((k) => m[k] === true);
}
