/**
 * Claves de módulos alineadas con rutas de la app (API y front).
 * Espejo en el cliente: `frontend/src/constants/subscriptionModules.ts` — mantener sincronizados.
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

/**
 * Aplica payload de `enabled_modules` (objeto clave → boolean) dejando solo claves conocidas.
 * Valores faltantes quedan en `false` (nunca se aceptan claves extra).
 */
export function normalizeEnabledModulesObject(raw: unknown): Record<string, boolean> {
  const o: Record<string, boolean> = {};
  for (const k of SUBSCRIPTION_MODULE_KEYS) {
    o[k] = false;
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const k of Object.keys(raw)) {
      if (validModuleSet.has(k) && (raw as Record<string, unknown>)[k] === true) {
        o[k] = true;
      }
    }
  }
  return o;
}

/** `true` si al menos un módulo está habilitado (planes de suscripción no deben quedar con todos en false). */
export function enabledModulesHasAtLeastOne(m: Record<string, boolean>): boolean {
  for (const v of Object.values(m)) {
    if (v === true) return true;
  }
  return false;
}

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
