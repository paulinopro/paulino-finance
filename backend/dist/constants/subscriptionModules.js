"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBSCRIPTION_MODULE_KEYS = void 0;
exports.defaultEnabledModulesAll = defaultEnabledModulesAll;
exports.defaultEnabledModulesFree = defaultEnabledModulesFree;
exports.normalizeEnabledModulesObject = normalizeEnabledModulesObject;
exports.enabledModulesHasAtLeastOne = enabledModulesHasAtLeastOne;
exports.modulesFromJson = modulesFromJson;
/**
 * Claves de módulos alineadas con rutas de la app (API y front).
 * Espejo en el cliente: `frontend/src/constants/subscriptionModules.ts` — mantener sincronizados.
 */
exports.SUBSCRIPTION_MODULE_KEYS = [
    'dashboard',
    'cards',
    'loans',
    'income',
    'expenses',
    'accounts',
    'reports',
    'calendar',
    'agenda',
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
];
function defaultEnabledModulesAll() {
    const o = {};
    for (const k of exports.SUBSCRIPTION_MODULE_KEYS) {
        o[k] = true;
    }
    return o;
}
/** Plan gratuito mínimo: panel, perfil, suscripción y preferencias básicas. */
function defaultEnabledModulesFree() {
    const o = {};
    for (const k of exports.SUBSCRIPTION_MODULE_KEYS) {
        o[k] = ['dashboard', 'profile', 'subscription', 'settings', 'categories'].includes(k);
    }
    return o;
}
const validModuleSet = new Set(exports.SUBSCRIPTION_MODULE_KEYS);
/**
 * Aplica payload de `enabled_modules` (objeto clave → boolean) dejando solo claves conocidas.
 * Valores faltantes quedan en `false` (nunca se aceptan claves extra).
 */
function normalizeEnabledModulesObject(raw) {
    const o = {};
    for (const k of exports.SUBSCRIPTION_MODULE_KEYS) {
        o[k] = false;
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        for (const k of Object.keys(raw)) {
            if (validModuleSet.has(k) && raw[k] === true) {
                o[k] = true;
            }
        }
    }
    return o;
}
/** `true` si al menos un módulo está habilitado (planes de suscripción no deben quedar con todos en false). */
function enabledModulesHasAtLeastOne(m) {
    for (const v of Object.values(m)) {
        if (v === true)
            return true;
    }
    return false;
}
function modulesFromJson(json) {
    if (json == null)
        return [];
    if (Array.isArray(json)) {
        const out = [];
        for (const x of json) {
            if (typeof x === 'string' && validModuleSet.has(x))
                out.push(x);
        }
        return out;
    }
    if (typeof json === 'string') {
        try {
            return modulesFromJson(JSON.parse(json));
        }
        catch {
            return [];
        }
    }
    if (typeof json !== 'object')
        return [];
    const out = [];
    for (const [k, v] of Object.entries(json)) {
        if (v === true && validModuleSet.has(k))
            out.push(k);
    }
    return out;
}
//# sourceMappingURL=subscriptionModules.js.map