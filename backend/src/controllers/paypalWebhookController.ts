import { Request, Response } from 'express';
import { query } from '../config/database';
import { verifyPaypalWebhookSignature } from '../services/paypalService';

type PaypalWebhookEvent = {
  event_type?: string;
  resource?: {
    id?: string;
    status?: string;
    custom_id?: string;
    plan_id?: string;
  };
};

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
  if (!type || !resource?.id) return;

  const custom = resource.custom_id || '';
  const userMatch = custom.match(/^user:(\d+)$/);
  if (!userMatch) return;

  const userId = parseInt(userMatch[1], 10);
  const paypalSubId = resource.id;

  if (type === 'BILLING.SUBSCRIPTION.ACTIVATED' || type === 'BILLING.SUBSCRIPTION.UPDATED') {
    const planRow = await query(
      `SELECT id FROM subscription_plans
       WHERE paypal_plan_id_monthly = $1 OR paypal_plan_id_yearly = $1
       LIMIT 1`,
      [resource.plan_id || '']
    );
    const planId = planRow.rows[0]?.id;
    if (!planId) return;

    await query(
      `INSERT INTO user_subscriptions (user_id, plan_id, status, paypal_subscription_id, paypal_plan_id, current_period_start, current_period_end)
       VALUES ($1, $2, 'active', $3, $4, CURRENT_TIMESTAMP, NULL)
       ON CONFLICT (user_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         status = 'active',
         paypal_subscription_id = EXCLUDED.paypal_subscription_id,
         paypal_plan_id = EXCLUDED.paypal_plan_id,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, planId, paypalSubId, resource.plan_id || null]
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
 * Webhook de PayPal (BILLING.SUBSCRIPTION.*).
 * En producción: PAYPAL_WEBHOOK_ID + verificación de firma (o PAYPAL_SKIP_WEBHOOK_VERIFY solo en dev).
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
