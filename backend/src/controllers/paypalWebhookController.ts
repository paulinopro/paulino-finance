import { Request, Response } from 'express';
import { query } from '../config/database';
import { verifyPaypalWebhookSignature } from '../services/paypalService';

function toValidDate(v: unknown): Date | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setMonth(x.getMonth() + n);
  return x;
}

function addYears(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setFullYear(x.getFullYear() + n);
  return x;
}

type PaypalWebhookEvent = {
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    plan_id?: string;
    billing_info?: {
      last_payment?: {
        time?: string;
        amount?: { currency_code?: string; value?: string; currency?: string };
      };
      next_billing_time?: string;
    };
    amount?: { total?: string; currency?: string; value?: string; currency_code?: string };
  };
};

/** Periodos de facturación (PayPal Subscriptions v2) para la suscripción activa. */
function parseSubscriptionBillingWindow(resource: Record<string, unknown> | undefined): {
  periodStart: Date | null;
  periodEnd: Date | null;
} {
  if (!resource) return { periodStart: null, periodEnd: null };
  const bi = resource.billing_info as
    | {
        last_payment?: { time?: string };
        next_billing_time?: string;
      }
    | undefined;
  if (!bi) return { periodStart: null, periodEnd: null };
  const end = bi.next_billing_time ? new Date(bi.next_billing_time) : null;
  const start = bi.last_payment?.time ? new Date(bi.last_payment.time) : null;
  if (start && Number.isNaN(start.getTime()) && !end) return { periodStart: null, periodEnd: null };
  if (end && Number.isNaN(end.getTime())) return { periodStart: start, periodEnd: null };
  if (start && Number.isNaN(start.getTime())) return { periodStart: null, periodEnd: end };
  return { periodStart: start, periodEnd: end };
}

/**
 * Registra un cobro desde PAYMENT.SALE.COMPLETED (billing_agreement_id = suscripción).
 * `period_start` / `period_end` se toman de `user_subscriptions` si existen; si faltan, se
 * imputan con heurística (intervalo `billing_interval` o mensual por defecto) para reducir nulos
 * en historial. Idempotente por `paypal_sale_id`.
 */
async function recordPaypalSalePayment(
  userId: number,
  planId: number,
  resource: Record<string, unknown>
): Promise<void> {
  const sale = resource;
  const subId = (sale.billing_agreement_id as string) || (sale as { billing_agreement_id?: string }).billing_agreement_id;
  if (!subId) return;
  const saleId = (sale.id as string) || '';
  if (!saleId) return;
  const amt = sale.amount as { total?: string; currency?: string; value?: string; currency_code?: string } | undefined;
  const amountStr = amt?.total ?? amt?.value;
  if (amountStr == null || String(amountStr).trim() === '') return;
  const amount = parseFloat(String(amountStr));
  if (Number.isNaN(amount)) return;
  const currency = (amt?.currency || amt?.currency_code || 'USD') as string;
  const timeStr = (sale.update_time as string) || (sale.create_time as string);
  const paidAt = timeStr ? new Date(timeStr) : new Date();
  if (Number.isNaN(paidAt.getTime())) {
    return;
  }

  const period = await query(
    `SELECT us.current_period_start, us.current_period_end, us.billing_interval, us.paypal_plan_id,
            sp.paypal_plan_id_monthly, sp.paypal_plan_id_yearly
     FROM user_subscriptions us
     JOIN subscription_plans sp ON sp.id = us.plan_id
     WHERE us.user_id = $1`,
    [userId]
  );
  const row = period.rows[0] as
    | {
        current_period_start: unknown;
        current_period_end: unknown;
        billing_interval: string | null;
        paypal_plan_id: string | null;
        paypal_plan_id_monthly: string | null;
        paypal_plan_id_yearly: string | null;
      }
    | undefined;
  const bi = row?.billing_interval;
  const pp = row?.paypal_plan_id?.trim();
  const m = row?.paypal_plan_id_monthly?.trim();
  const y = row?.paypal_plan_id_yearly?.trim();
  let intervalIsYear = bi === 'yearly';
  if (bi !== 'monthly' && bi !== 'yearly') {
    if (y && pp && pp === y) intervalIsYear = true;
    else if (m && pp && pp === m) intervalIsYear = false;
    else intervalIsYear = false;
  }

  let psD = toValidDate(row?.current_period_start);
  let peD = toValidDate(row?.current_period_end);

  if (!(psD && peD)) {
    if (psD && !peD) {
      peD = intervalIsYear ? addYears(psD, 1) : addMonths(psD, 1);
    } else if (!psD && peD) {
      psD = intervalIsYear ? addYears(peD, -1) : addMonths(peD, -1);
    } else {
      psD = paidAt;
      peD = intervalIsYear ? addYears(paidAt, 1) : addMonths(paidAt, 1);
    }
  }

  await query(
    `INSERT INTO subscription_payments
      (user_id, plan_id, amount, currency, status, period_start, period_end, paid_at, paypal_sale_id, paypal_subscription_id, source)
     VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, $9, 'paypal_sale')
     ON CONFLICT (paypal_sale_id) DO NOTHING`,
    [userId, planId, amount, currency, psD, peD, paidAt, saleId, subId]
  );
}


function shouldSkipWebhookVerification(): boolean {
  if (process.env.PAYPAL_SKIP_WEBHOOK_VERIFY === 'true') {
    return true;
  }
  if (process.env.NODE_ENV !== 'production' && !process.env.PAYPAL_WEBHOOK_ID?.trim()) {
    return true;
  }
  return false;
}

async function processPaypalWebhookEvent(event: PaypalWebhookEvent): Promise<void> {
  const type = event.event_type;
  const resource = event.resource;
  if (!type || !resource) return;

  if (type === 'PAYMENT.SALE.COMPLETED') {
    const res = resource as Record<string, unknown>;
    if (!res.id) return;
    const subId = String(
      (res as { billing_agreement_id?: string }).billing_agreement_id || (res as { subscription_id?: string }).subscription_id || ''
    );
    if (!subId) return;
    const sub = await query(
      `SELECT us.user_id, us.plan_id
       FROM user_subscriptions us
       WHERE us.paypal_subscription_id = $1
       LIMIT 1`,
      [subId]
    );
    if (sub.rows.length === 0) return;
    await recordPaypalSalePayment(
      sub.rows[0].user_id as number,
      sub.rows[0].plan_id as number,
      res
    );
    return;
  }

  if (!resource.id) return;

  const custom = (resource as { custom_id?: string }).custom_id || '';
  const userMatch = custom.match(/^user:(\d+)$/);
  if (!userMatch) return;

  const userId = parseInt(userMatch[1], 10);
  const paypalSubId = String(resource.id);
  const resObj = resource as Record<string, unknown>;
  const { periodStart, periodEnd } = parseSubscriptionBillingWindow(resObj);

  if (type === 'BILLING.SUBSCRIPTION.ACTIVATED' || type === 'BILLING.SUBSCRIPTION.UPDATED') {
    const planRow = await query(
      `SELECT id, paypal_plan_id_monthly, paypal_plan_id_yearly FROM subscription_plans
       WHERE paypal_plan_id_monthly = $1 OR paypal_plan_id_yearly = $1
       LIMIT 1`,
      [resource.plan_id || '']
    );
    const pr = planRow.rows[0] as
      | { id: number; paypal_plan_id_monthly: string | null; paypal_plan_id_yearly: string | null }
      | undefined;
    const planId = pr?.id;
    if (!planId) return;

    const pp = String(resource.plan_id || '').trim();
    let billingInterval: 'monthly' | 'yearly' | null = null;
    if (pp && pr) {
      const m = pr.paypal_plan_id_monthly?.trim();
      const y = pr.paypal_plan_id_yearly?.trim();
      if (m && pp === m) billingInterval = 'monthly';
      else if (y && pp === y) billingInterval = 'yearly';
    }

    const pStart = periodStart && !Number.isNaN(periodStart.getTime()) ? periodStart : new Date();
    const pEnd = periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd : null;

    await query(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, paypal_subscription_id, paypal_plan_id, current_period_start, current_period_end, billing_interval)
       VALUES ($1, $2, 'active', $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         status = 'active',
         paypal_subscription_id = EXCLUDED.paypal_subscription_id,
         paypal_plan_id = EXCLUDED.paypal_plan_id,
         current_period_start = COALESCE(EXCLUDED.current_period_start, user_subscriptions.current_period_start),
         current_period_end = COALESCE(EXCLUDED.current_period_end, user_subscriptions.current_period_end),
         billing_interval = COALESCE(EXCLUDED.billing_interval, user_subscriptions.billing_interval),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, planId, paypalSubId, resource.plan_id || null, pStart, pEnd, billingInterval]
    );

  }

  if (type === 'BILLING.SUBSCRIPTION.CANCELLED' || type === 'BILLING.SUBSCRIPTION.EXPIRED') {
    await query(
      `UPDATE user_subscriptions SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND paypal_subscription_id = $2`,
      [userId, paypalSubId]
    );
  }
}

/**
 * Webhook de PayPal: BILLING.SUBSCRIPTION.*, PAYMENT.SALE.COMPLETED.
 * - Activar en el panel de PayPal el evento PAYMENT.SALE.COMPLETED para el historial de cobros.
 * - En producción: PAYPAL_WEBHOOK_ID + verificación de firma (o PAYPAL_SKIP_WEBHOOK_VERIFY solo en dev).
 */
export const paypalWebhook = async (req: Request, res: Response) => {
  let event: PaypalWebhookEvent;
  try {
    const raw = req.body;
    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(JSON.stringify(raw));
    event = JSON.parse(buf.toString('utf8')) as PaypalWebhookEvent;
  } catch {
    return res.status(400).json({ message: 'Invalid JSON body' });
  }

  const skipVerify = shouldSkipWebhookVerification();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();

  if (!skipVerify) {
    if (!webhookId) {
      console.error('PAYPAL_WEBHOOK_ID es obligatorio para verificar webhooks en este entorno');
      return res.status(503).json({ message: 'Webhook not configured' });
    }

    const verified = await verifyPaypalWebhookSignature({
      webhookId,
      webhookEvent: event as Record<string, unknown>,
      transmissionId: req.headers['paypal-transmission-id'] as string | undefined,
      transmissionTime: req.headers['paypal-transmission-time'] as string | undefined,
      certUrl: req.headers['paypal-cert-url'] as string | undefined,
      authAlgo: req.headers['paypal-auth-algo'] as string | undefined,
      transmissionSig: req.headers['paypal-transmission-sig'] as string | undefined,
    });

    if (!verified) {
      return res.status(403).json({ message: 'Invalid webhook signature' });
    }
  }

  res.status(200).json({ received: true });

  try {
    await processPaypalWebhookEvent(event);
  } catch (e) {
    console.error('paypalWebhook processPaypalWebhookEvent', e);
  }
};
