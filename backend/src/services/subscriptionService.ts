import { query } from '../config/database';
import {
  SUBSCRIPTION_MODULE_KEYS,
  modulesFromJson,
} from '../constants/subscriptionModules';

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
      currentPeriodEnd: null,
      paypalSubscriptionId: null,
    };
  }

  const r = await query(
    `SELECT us.status, us.current_period_end, us.paypal_subscription_id,
            sp.id as plan_id, sp.name as plan_name, sp.slug as plan_slug,
            sp.price_monthly, sp.price_yearly, sp.currency, sp.enabled_modules
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
      currentPeriodEnd: null,
      paypalSubscriptionId: null,
    };
  }

  const row = r.rows[0];
  const modules = modulesFromJson(row.enabled_modules);
  const active =
    (row.status === 'active' || row.status === 'trialing') &&
    (row.current_period_end == null || new Date(row.current_period_end) > new Date());

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
    currentPeriodEnd: row.current_period_end,
    paypalSubscriptionId: row.paypal_subscription_id,
  };
}

export async function assignPlanToUser(userId: number, planId: number): Promise<void> {
  await query(
    `INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
     VALUES ($1, $2, 'active', CURRENT_TIMESTAMP, NULL)
     ON CONFLICT (user_id) DO UPDATE SET
       plan_id = EXCLUDED.plan_id,
       status = 'active',
       updated_at = CURRENT_TIMESTAMP,
       current_period_start = CURRENT_TIMESTAMP,
       current_period_end = NULL`,
    [userId, planId]
  );
}
