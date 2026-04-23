/** Claves de módulos alineadas con rutas de la app (API y front). */
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

export type SubscriptionModuleKey = (typeof SUBSCRIPTION_MODULE_KEYS)[number];

export function defaultEnabledModulesAll(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const k of SUBSCRIPTION_MODULE_KEYS) {
    o[k] = true;
  }
  return o;
}

/** Plan gratuito mínimo: panel, perfil, suscripción y preferencias básicas. */
export function defaultEnabledModulesFree(): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const k of SUBSCRIPTION_MODULE_KEYS) {
    o[k] = ['dashboard', 'profile', 'subscription', 'settings', 'categories'].includes(k);
  }
  return o;
}

const validModuleSet = new Set<string>(SUBSCRIPTION_MODULE_KEYS as unknown as string[]);

export function modulesFromJson(json: unknown): string[] {
  if (json == null) return [];
  if (Array.isArray(json)) {
    const out: string[] = [];
    for (const x of json) {
      if (typeof x === 'string' && validModuleSet.has(x)) out.push(x);
    }
    return out;
  }
  if (typeof json === 'string') {
    try {
      return modulesFromJson(JSON.parse(json));
    } catch {
      return [];
    }
  }
  if (typeof json !== 'object') return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(json as Record<string, boolean>)) {
    if (v === true && validModuleSet.has(k)) out.push(k);
  }
  return out;
}
