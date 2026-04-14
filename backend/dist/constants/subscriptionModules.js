"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBSCRIPTION_MODULE_KEYS = void 0;
exports.defaultEnabledModulesAll = defaultEnabledModulesAll;
exports.defaultEnabledModulesFree = defaultEnabledModulesFree;
exports.modulesFromJson = modulesFromJson;
/** Claves de módulos alineadas con rutas de la app (API y front). */
exports.SUBSCRIPTION_MODULE_KEYS = [
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
function modulesFromJson(json) {
    if (!json || typeof json !== 'object')
        return [];
    const out = [];
    for (const [k, v] of Object.entries(json)) {
        if (v === true)
            out.push(k);
    }
    return out;
}
//# sourceMappingURL=subscriptionModules.js.map