"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveBillingIntervalForRow = resolveBillingIntervalForRow;
exports.getAllowedModulesForUserId = getAllowedModulesForUserId;
exports.getSubscriptionDetailsForUser = getSubscriptionDetailsForUser;
exports.getSubscriptionPaymentHistoryByUserId = getSubscriptionPaymentHistoryByUserId;
exports.getSubscriptionPaymentHistoryForUser = getSubscriptionPaymentHistoryForUser;
exports.assignPlanToUser = assignPlanToUser;
const database_1 = require("../config/database");
const subscriptionModules_1 = require("../constants/subscriptionModules");
/** Resuelve mensual/anual desde columna persistida o comparando paypal_plan_id con el plan. */
function resolveBillingIntervalForRow(row) {
    const bi = row.billing_interval;
    if (bi === 'monthly' || bi === 'yearly')
        return bi;
    const pp = row.paypal_plan_id?.trim();
    if (!pp)
        return null;
    const m = row.paypal_plan_id_monthly?.trim();
    const y = row.paypal_plan_id_yearly?.trim();
    if (m && pp === m)
        return 'monthly';
    if (y && pp === y)
        return 'yearly';
    return null;
}
async function getAllowedModulesForUserId(userId) {
    const admin = await (0, database_1.query)(`SELECT is_super_admin FROM users WHERE id = $1`, [userId]);
    if (admin.rows[0]?.is_super_admin === true) {
        return [...subscriptionModules_1.SUBSCRIPTION_MODULE_KEYS];
    }
    const r = await (0, database_1.query)(`SELECT sp.enabled_modules
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1
       AND us.status IN ('active', 'trialing')
       AND (us.current_period_end IS NULL OR us.current_period_end > NOW())`, [userId]);
    if (r.rows.length === 0) {
        return [];
    }
    return (0, subscriptionModules_1.modulesFromJson)(r.rows[0].enabled_modules);
}
async function getSubscriptionDetailsForUser(userId) {
    const admin = await (0, database_1.query)(`SELECT is_super_admin FROM users WHERE id = $1`, [userId]);
    if (admin.rows[0]?.is_super_admin === true) {
        return {
            isSuperAdmin: true,
            status: 'active',
            plan: null,
            modules: [...subscriptionModules_1.SUBSCRIPTION_MODULE_KEYS],
            currentPeriodStart: null,
            currentPeriodEnd: null,
            billingInterval: null,
            paypalSubscriptionId: null,
        };
    }
    const r = await (0, database_1.query)(`SELECT us.status, us.current_period_start, us.current_period_end, us.paypal_subscription_id,
            us.billing_interval, us.paypal_plan_id,
            sp.id as plan_id, sp.name as plan_name, sp.slug as plan_slug,
            sp.price_monthly, sp.price_yearly, sp.currency, sp.enabled_modules,
            sp.paypal_plan_id_monthly, sp.paypal_plan_id_yearly
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1`, [userId]);
    if (r.rows.length === 0) {
        return {
            isSuperAdmin: false,
            status: 'none',
            plan: null,
            modules: [],
            currentPeriodStart: null,
            currentPeriodEnd: null,
            billingInterval: null,
            paypalSubscriptionId: null,
        };
    }
    const row = r.rows[0];
    const modules = (0, subscriptionModules_1.modulesFromJson)(row.enabled_modules);
    const active = (row.status === 'active' || row.status === 'trialing') &&
        (row.current_period_end == null || new Date(row.current_period_end) > new Date());
    const billingInterval = resolveBillingIntervalForRow(row);
    return {
        isSuperAdmin: false,
        status: active ? row.status : 'expired',
        plan: {
            id: row.plan_id,
            name: row.plan_name,
            slug: row.plan_slug,
            priceMonthly: parseFloat(row.price_monthly),
            priceYearly: parseFloat(row.price_yearly),
            currency: row.currency,
        },
        modules: active ? modules : [],
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        billingInterval,
        paypalSubscriptionId: row.paypal_subscription_id,
    };
}
/** Historial de pagos por `user_id` (sin comprobar actor). Usar solo desde `requireSuperAdmin` o propio usuario. */
async function getSubscriptionPaymentHistoryByUserId(userId) {
    const r = await (0, database_1.query)(`SELECT p.id, p.amount, p.currency, p.status, p.period_start, p.period_end, p.paid_at, p.source,
            sp.name as plan_name, sp.slug as plan_slug
     FROM subscription_payments p
     LEFT JOIN subscription_plans sp ON sp.id = p.plan_id
     WHERE p.user_id = $1
     ORDER BY p.paid_at DESC
     LIMIT 100`, [userId]);
    const toIso = (v) => (v == null || v === '' ? null : new Date(v).toISOString());
    return r.rows.map((row) => ({
        id: row.id,
        amount: String(row.amount),
        currency: String(row.currency || 'USD'),
        status: String(row.status || 'completed'),
        periodStart: toIso(row.period_start),
        periodEnd: toIso(row.period_end),
        paidAt: toIso(row.paid_at) || '',
        source: String(row.source || 'paypal'),
        planName: row.plan_name != null ? String(row.plan_name) : null,
        planSlug: row.plan_slug != null ? String(row.plan_slug) : null,
    }));
}
async function getSubscriptionPaymentHistoryForUser(userId) {
    const admin = await (0, database_1.query)(`SELECT is_super_admin FROM users WHERE id = $1`, [userId]);
    if (admin.rows[0]?.is_super_admin === true) {
        return [];
    }
    return getSubscriptionPaymentHistoryByUserId(userId);
}
/**
 * Asignación manual desde consola (sin flujo PayPal en ese momento). Fija un ciclo **mensual o anual**
 * a partir de ahora. Los webhooks `BILLING.SUBSCRIPTION.*` sobrescriben periodo e intervalo al sincronizar
 * con PayPal. El intervalo anual acota el riesgo de desalinear con un cobro anual en PayPal hasta el
 * próximo evento; ver `docs/Operacion_Super_Admin.md`.
 */
async function assignPlanToUser(userId, planId, options) {
    const bi = options?.billingInterval === 'yearly' ? 'yearly' : 'monthly';
    const pr = await (0, database_1.query)(`SELECT paypal_plan_id_monthly, paypal_plan_id_yearly FROM subscription_plans WHERE id = $1`, [planId]);
    const row0 = pr.rows[0];
    const paypalPlanId = bi === 'yearly' ? row0?.paypal_plan_id_yearly ?? null : row0?.paypal_plan_id_monthly ?? null;
    await (0, database_1.query)(`INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end, billing_interval, paypal_plan_id)
     VALUES (
       $1, $2, 'active', CURRENT_TIMESTAMP,
       CASE WHEN $3 = 'yearly' THEN CURRENT_TIMESTAMP + INTERVAL '1 year' ELSE CURRENT_TIMESTAMP + INTERVAL '1 month' END,
       $3, $4
     )
     ON CONFLICT (user_id) DO UPDATE SET
       plan_id = EXCLUDED.plan_id,
       status = 'active',
       updated_at = CURRENT_TIMESTAMP,
       current_period_start = CURRENT_TIMESTAMP,
       current_period_end = CASE WHEN $3 = 'yearly' THEN CURRENT_TIMESTAMP + INTERVAL '1 year' ELSE CURRENT_TIMESTAMP + INTERVAL '1 month' END,
       billing_interval = EXCLUDED.billing_interval,
       paypal_plan_id = EXCLUDED.paypal_plan_id`, [userId, planId, bi, paypalPlanId]);
}
//# sourceMappingURL=subscriptionService.js.map