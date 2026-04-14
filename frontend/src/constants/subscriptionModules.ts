/** Debe coincidir con backend/src/constants/subscriptionModules.ts */
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
