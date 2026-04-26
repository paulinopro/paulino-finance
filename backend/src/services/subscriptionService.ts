import { query } from '../config/database';
import {
  SUBSCRIPTION_MODULE_KEYS,
  modulesFromJson,
} from '../constants/subscriptionModules';

/**
 * Glosario datos / UI (español) — ficha cliente y /subscription
 * - `current_period_start` / `current_period_end` (suscripción activa): ventana de **ciclo** actual
 *   (típ. desde último corte o último cobro reconocido hasta `next_billing_time` o fin de ciclo).
 * - Cada fila de `subscription_payments`: el periodo **facturado** por ese cobro (alineado cuando PayPal/BD
 *   lo permiten; ver `assignPlanToUser` y `paypalWebhookController`).
 * - `billing_interval`: intención de modalidad (mensual/anual) según plan PayPal o asignación manual.
 */

export type BillingInterval = 'monthly' | 'yearly';

/** Resuelve mensual/anual desde columna persistida o comparando paypal_plan_id con el plan. */
export function resolveBillingIntervalForRow(row: {
  billing_interval?: string | null;
  paypal_plan_id?: string | null;
  paypal_plan_id_monthly?: string | null;
  paypal_plan_id_yearly?: string | null;
}): BillingInterval | null {
  const bi = row.billing_interval;
  if (bi === 'monthly' || bi === 'yearly') return bi;
  const pp = row.paypal_plan_id?.trim();
  if (!pp) return null;
  const m = row.paypal_plan_id_monthly?.trim();
  const y = row.paypal_plan_id_yearly?.trim();
  if (m && pp === m) return 'monthly';
  if (y && pp === y) return 'yearly';
  return null;
}

/**
 * Módulos permitidos para el usuario: super admin = todos; si no, proviene de
 * `subscription_plans.enabled_modules` del plan vinculado a `user_subscriptions` (solo filas
 * con suscripción activa/trialing y periodo no vencido). Ver `modulesFromJson`.
 */
export async function getAllowedModulesForUserId(userId: number): Promise<string[]> {
  const admin = await query(`SELECT is_super_admin FROM users WHERE id = $1`, [userId]);
  if (admin.rows[0]?.is_super_admin === true) {
    return [...SUBSCRIPTION_MODULE_KEYS];
  }

  const r = await query(
    `SELECT sp.enabled_modules
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1
       AND us.status IN ('active', 'trialing')
       AND (us.current_period_end IS NULL OR us.current_period_end > NOW())`,
    [userId]
  );

  if (r.rows.length === 0) {
    return [];
  }

  return modulesFromJson(r.rows[0].enabled_modules);
}

export async function getSubscriptionDetailsForUser(userId: number) {
  const admin = await query(`SELECT is_super_admin FROM users WHERE id = $1`, [userId]);
  if (admin.rows[0]?.is_super_admin === true) {
    return {
      isSuperAdmin: true,
      status: 'active' as const,
      plan: null,
      modules: [...SUBSCRIPTION_MODULE_KEYS],
      currentPeriodStart: null,
      currentPeriodEnd: null,
      billingInterval: null,
      paypalSubscriptionId: null,
    };
  }

  const r = await query(
    `SELECT us.status, us.current_period_start, us.current_period_end, us.paypal_subscription_id,
            us.billing_interval, us.paypal_plan_id,
            sp.id as plan_id, sp.name as plan_name, sp.slug as plan_slug,
            sp.price_monthly, sp.price_yearly, sp.currency, sp.enabled_modules,
            sp.paypal_plan_id_monthly, sp.paypal_plan_id_yearly
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1`,
    [userId]
  );

  if (r.rows.length === 0) {
    return {
      isSuperAdmin: false,
      status: 'none' as const,
      plan: null,
      modules: [] as string[],
      currentPeriodStart: null,
      currentPeriodEnd: null,
      billingInterval: null,
      paypalSubscriptionId: null,
    };
  }

  const row = r.rows[0];
  const modules = modulesFromJson(row.enabled_modules);
  const active =
    (row.status === 'active' || row.status === 'trialing') &&
    (row.current_period_end == null || new Date(row.current_period_end) > new Date());
  const billingInterval = resolveBillingIntervalForRow(row as Parameters<typeof resolveBillingIntervalForRow>[0]);

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

export type SubscriptionPaymentRow = {
  id: number;
  amount: string;
  currency: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string;
  source: string;
  planName: string | null;
  planSlug: string | null;
};

/** Historial de pagos por `user_id` (sin comprobar actor). Usar solo desde `requireSuperAdmin` o propio usuario. */
export async function getSubscriptionPaymentHistoryByUserId(userId: number): Promise<SubscriptionPaymentRow[]> {
  const r = await query(
    `SELECT p.id, p.amount, p.currency, p.status, p.period_start, p.period_end, p.paid_at, p.source,
            sp.name as plan_name, sp.slug as plan_slug
     FROM subscription_payments p
     LEFT JOIN subscription_plans sp ON sp.id = p.plan_id
     WHERE p.user_id = $1
     ORDER BY p.paid_at DESC
     LIMIT 100`,
    [userId]
  );

  const toIso = (v: unknown) => (v == null || v === '' ? null : new Date(v as string | Date).toISOString());
  return r.rows.map((row: Record<string, unknown>) => ({
    id: row.id as number,
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

export async function getSubscriptionPaymentHistoryForUser(userId: number): Promise<SubscriptionPaymentRow[]> {
  const admin = await query(`SELECT is_super_admin FROM users WHERE id = $1`, [userId]);
  if (admin.rows[0]?.is_super_admin === true) {
    return [];
  }
  return getSubscriptionPaymentHistoryByUserId(userId);
}

type ManualAssignInterval = 'monthly' | 'yearly';

/**
 * Asignación manual desde consola (sin flujo PayPal en ese momento). Fija un ciclo **mensual o anual**
 * a partir de ahora. Los webhooks `BILLING.SUBSCRIPTION.*` sobrescriben periodo e intervalo al sincronizar
 * con PayPal. El intervalo anual acota el riesgo de desalinear con un cobro anual en PayPal hasta el
 * próximo evento; ver `docs/Operacion_Super_Admin.md`.
 */
export async function assignPlanToUser(
  userId: number,
  planId: number,
  options?: { billingInterval?: ManualAssignInterval }
): Promise<void> {
  const bi: ManualAssignInterval = options?.billingInterval === 'yearly' ? 'yearly' : 'monthly';
  const pr = await query(
    `SELECT paypal_plan_id_monthly, paypal_plan_id_yearly FROM subscription_plans WHERE id = $1`,
    [planId]
  );
  const row0 = pr.rows[0] as
    | { paypal_plan_id_monthly: string | null; paypal_plan_id_yearly: string | null }
    | undefined;
  const paypalPlanId = bi === 'yearly' ? row0?.paypal_plan_id_yearly ?? null : row0?.paypal_plan_id_monthly ?? null;

  await query(
    `INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end, billing_interval, paypal_plan_id)
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
       paypal_plan_id = EXCLUDED.paypal_plan_id`,
    [userId, planId, bi, paypalPlanId]
  );
}
