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

/** Nombres visibles en español (planes, admin, UI). */
export const SUBSCRIPTION_MODULE_LABELS_ES: Record<(typeof SUBSCRIPTION_MODULE_KEYS)[number], string> = {
  dashboard: 'Resumen',
  cards: 'Tarjetas',
  loans: 'Préstamos',
  income: 'Ingresos',
  expenses: 'Gastos',
  accounts: 'Cuentas',
  reports: 'Reportes',
  calendar: 'Calendario',
  accounts_payable: 'Cuentas por pagar',
  accounts_receivable: 'Cuentas por cobrar',
  budgets: 'Presupuestos',
  financial_goals: 'Metas financieras',
  cash_flow: 'Flujo de caja',
  projections: 'Proyecciones',
  vehicles: 'Vehículos',
  notifications: 'Notificaciones',
  categories: 'Categorías',
  templates: 'Plantillas',
  settings: 'Configuración',
  profile: 'Mi perfil',
  subscription: 'Planes y suscripción',
};

export function subscriptionModuleLabelEs(key: string): string {
  if (key in SUBSCRIPTION_MODULE_LABELS_ES) {
    return SUBSCRIPTION_MODULE_LABELS_ES[key as keyof typeof SUBSCRIPTION_MODULE_LABELS_ES];
  }
  return key;
}

/** Valores de `user_subscriptions.status` en API; etiquetas para filtros y UI en español. */
export const SUBSCRIPTION_STATUS_FILTER_OPTIONS = [
  { value: 'active', label: 'Activa' },
  { value: 'trialing', label: 'Periodo de prueba' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'expired', label: 'Expirada' },
  { value: 'past_due', label: 'Pago atrasado' },
] as const;

/** Etiqueta en español para estado de suscripción; si no es un valor API conocido, devuelve el texto original. */
export function subscriptionStatusLabelEs(status: string | null | undefined): string {
  if (!status) return '—';
  const raw = String(status).trim();
  const low = raw.toLowerCase();
  const row = SUBSCRIPTION_STATUS_FILTER_OPTIONS.find((o) => o.value === low);
  if (row) return row.label;
  if (low === 'n/a') return 'No aplica';
  if (low === 'sin suscripción') return 'Sin suscripción';
  return raw;
}

/** Al menos un módulo en `true` (misma regla que el API). */
export function enabledModulesHasAtLeastOne(
  m: Record<string, boolean> | null | undefined
): boolean {
  if (!m) return false;
  return SUBSCRIPTION_MODULE_KEYS.some((k) => m[k] === true);
}
