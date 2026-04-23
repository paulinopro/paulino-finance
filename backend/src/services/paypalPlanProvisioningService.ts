/**
 * Aprovisiona producto del catálogo PayPal + planes de facturación (mensual/anual)
 * según la API documentada (Catalog Products + Billing Plans).
 * Reutiliza OAuth de paypalService (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE).
 */

import { getAccessToken } from './paypalService';
import { query } from '../config/database';

function apiBase(): string {
  return process.env.PAYPAL_API_BASE || 'https://api-m.sandbox.paypal.com';
}

function moneyStr(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0.00';
  return n.toFixed(2);
}

async function paypalJson<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ ok: true; data: T } | { ok: false; status: number; text: string }> {
  const token = await getAccessToken();
  if (!token) {
    return { ok: false, status: 500, text: 'No se pudo obtener token OAuth (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).' };
  }

  const url = `${apiBase()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, text: text.slice(0, 2000) };
  }

  if (!text || !text.trim()) {
    return { ok: true, data: {} as T };
  }

  try {
    const data = JSON.parse(text) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, status: res.status, text: 'Respuesta PayPal no es JSON' };
  }
}

async function createCatalogProduct(name: string, description: string): Promise<{ id: string } | { error: string }> {
  const body = {
    name: name.slice(0, 127),
    description: (description || name).slice(0, 256),
    type: 'SERVICE',
    category: 'SOFTWARE',
  };

  const r = await paypalJson<{ id: string }>('POST', '/v1/catalogs/products', body);
  if (!r.ok) return { error: `Producto PayPal: ${r.status} ${r.text}` };
  if (!r.data.id) return { error: 'PayPal no devolvió id de producto' };
  return { id: r.data.id };
}

async function createBillingPlan(params: {
  productId: string;
  name: string;
  intervalUnit: 'MONTH' | 'YEAR';
  value: string;
  currencyCode: string;
}): Promise<{ id: string; status?: string } | { error: string }> {
  const { productId, name, intervalUnit, value, currencyCode } = params;

  const body = {
    product_id: productId,
    name: name.slice(0, 127),
    billing_cycles: [
      {
        frequency: {
          interval_unit: intervalUnit,
          interval_count: 1,
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: {
            value,
            currency_code: currencyCode,
          },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: {
        value: '0',
        currency_code: currencyCode,
      },
      payment_failure_threshold: 3,
    },
  };

  const r = await paypalJson<{ id: string; status?: string }>('POST', '/v1/billing/plans', body);
  if (!r.ok) return { error: `Plan billing PayPal: ${r.status} ${r.text}` };
  if (!r.data.id) return { error: 'PayPal no devolvió id de plan' };
  return { id: r.data.id, status: r.data.status };
}

/**
 * Activa un plan solo si PayPal lo dejó en CREATED o INACTIVE.
 * Si ya viene ACTIVE (común en sandbox), no llama a activate.
 * Si activate devuelve 422 PLAN_STATUS_INVALID (ya activo), se ignora.
 */
async function activateBillingPlanIfNeeded(
  planId: string,
  statusAfterCreate?: string
): Promise<{ error?: string }> {
  const st = (statusAfterCreate || '').toUpperCase();
  if (st === 'ACTIVE') {
    return {};
  }

  const r = await paypalJson<Record<string, unknown>>(
    'POST',
    `/v1/billing/plans/${encodeURIComponent(planId)}/activate`
  );
  if (r.ok) return {};

  if (r.status === 422 && isPlanAlreadyActiveError(r.text)) {
    return {};
  }

  return { error: `Activar plan ${planId}: ${r.status} ${r.text}` };
}

function isPlanAlreadyActiveError(body: string): boolean {
  try {
    const j = JSON.parse(body) as { details?: Array<{ issue?: string }> };
    return j.details?.some((d) => d.issue === 'PLAN_STATUS_INVALID') ?? false;
  } catch {
    return body.includes('PLAN_STATUS_INVALID');
  }
}

export type SubscriptionPlanRow = {
  id: number;
  name: string;
  description: string | null;
  price_monthly: string | number;
  price_yearly: string | number;
  currency: string;
  paypal_product_id: string | null;
  paypal_plan_id_monthly: string | null;
  paypal_plan_id_yearly: string | null;
};

export type ProvisionResult =
  | {
      ok: true;
      paypalProductId: string;
      paypalPlanIdMonthly: string;
      paypalPlanIdYearly: string;
      created: { product: boolean; monthly: boolean; yearly: boolean };
    }
  | { ok: false; message: string };

/**
 * Crea en PayPal lo que falte (producto y/o planes) y devuelve los IDs finales.
 * No sobrescribe IDs existentes salvo que falte el recurso en PayPal (solo creación incremental).
 */
export async function provisionPaypalSubscriptionPlan(row: SubscriptionPlanRow): Promise<ProvisionResult> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id?.trim() || !secret?.trim()) {
    return { ok: false, message: 'Configura PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en el servidor.' };
  }

  const currency = String(row.currency || 'USD')
    .toUpperCase()
    .slice(0, 3);
  const pm = typeof row.price_monthly === 'string' ? parseFloat(row.price_monthly) : row.price_monthly;
  const py = typeof row.price_yearly === 'string' ? parseFloat(row.price_yearly) : row.price_yearly;

  if (!Number.isFinite(pm) || pm <= 0 || !Number.isFinite(py) || py <= 0) {
    return { ok: false, message: 'Define price_monthly y price_yearly mayores que 0 para generar los planes en PayPal.' };
  }

  let paypalProductId = row.paypal_product_id?.trim() || '';
  let paypalPlanIdMonthly = row.paypal_plan_id_monthly?.trim() || '';
  let paypalPlanIdYearly = row.paypal_plan_id_yearly?.trim() || '';

  const created = { product: false, monthly: false, yearly: false };

  if (!paypalProductId) {
    const p = await createCatalogProduct(row.name, row.description || '');
    if ('error' in p) return { ok: false, message: p.error };
    paypalProductId = p.id;
    created.product = true;
  }

  if (!paypalPlanIdMonthly) {
    const plan = await createBillingPlan({
      productId: paypalProductId,
      name: `${row.name} - Mensual`.slice(0, 127),
      intervalUnit: 'MONTH',
      value: moneyStr(pm),
      currencyCode: currency,
    });
    if ('error' in plan) return { ok: false, message: plan.error };
    const act = await activateBillingPlanIfNeeded(plan.id, plan.status);
    if (act.error) return { ok: false, message: act.error };
    paypalPlanIdMonthly = plan.id;
    created.monthly = true;
  }

  if (!paypalPlanIdYearly) {
    const plan = await createBillingPlan({
      productId: paypalProductId,
      name: `${row.name} - Anual`.slice(0, 127),
      intervalUnit: 'YEAR',
      value: moneyStr(py),
      currencyCode: currency,
    });
    if ('error' in plan) return { ok: false, message: plan.error };
    const act = await activateBillingPlanIfNeeded(plan.id, plan.status);
    if (act.error) return { ok: false, message: act.error };
    paypalPlanIdYearly = plan.id;
    created.yearly = true;
  }

  return {
    ok: true,
    paypalProductId,
    paypalPlanIdMonthly,
    paypalPlanIdYearly,
    created,
  };
}

/** Carga la fila por id y persiste los IDs tras aprovisionar. */
export async function syncPaypalSubscriptionPlanById(planId: number): Promise<ProvisionResult> {
  const r = await query(
    `SELECT id, name, description, price_monthly, price_yearly, currency,
            paypal_product_id, paypal_plan_id_monthly, paypal_plan_id_yearly
     FROM subscription_plans WHERE id = $1`,
    [planId]
  );
  if (r.rows.length === 0) return { ok: false, message: 'Plan no encontrado' };

  const row = r.rows[0] as SubscriptionPlanRow;
  const result = await provisionPaypalSubscriptionPlan(row);
  if (!result.ok) return result;

  await query(
    `UPDATE subscription_plans
     SET paypal_product_id = $1,
         paypal_plan_id_monthly = $2,
         paypal_plan_id_yearly = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4`,
    [result.paypalProductId, result.paypalPlanIdMonthly, result.paypalPlanIdYearly, planId]
  );

  return result;
}
