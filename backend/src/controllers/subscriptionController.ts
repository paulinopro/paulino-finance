import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getSubscriptionDetailsForUser, getSubscriptionPaymentHistoryForUser } from '../services/subscriptionService';
import { query } from '../config/database';
import { createPaypalSubscriptionApproval } from '../services/paypalService';

export const getMySubscription = async (req: AuthRequest, res: Response) => {
  try {
    const details = await getSubscriptionDetailsForUser(req.userId!);
    res.json(details);
  } catch (e: any) {
    console.error('getMySubscription', e);
    res.status(500).json({ message: 'Error' });
  }
};

export const getMyPaymentHistory = async (req: AuthRequest, res: Response) => {
  try {
    const payments = await getSubscriptionPaymentHistoryForUser(req.userId!);
    res.json({ payments });
  } catch (e: any) {
    console.error('getMyPaymentHistory', e);
    res.status(500).json({ message: 'Error' });
  }
};

export const listPublicPlans = async (_req: Request, res: Response) => {
  try {
    const r = await query(
      `SELECT id, name, slug, description, price_monthly, price_yearly, currency,
              enabled_modules, sort_order
       FROM subscription_plans
       WHERE is_active = true
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({
      plans: r.rows.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        priceMonthly: parseFloat(p.price_monthly),
        priceYearly: parseFloat(p.price_yearly),
        currency: p.currency,
        enabledModules: p.enabled_modules,
        sortOrder: p.sort_order,
      })),
    });
  } catch (e: any) {
    console.error('listPublicPlans', e);
    res.status(500).json({ message: 'Error' });
  }
};

export const startPaypalSubscription = async (req: AuthRequest, res: Response) => {
  try {
    const { planId, billingCycle } = req.body as { planId?: number; billingCycle?: 'monthly' | 'yearly' };
    if (!planId || !billingCycle) {
      return res.status(400).json({ message: 'planId y billingCycle (monthly|yearly) son requeridos' });
    }

    const plan = await query(
      `SELECT id, slug, paypal_plan_id_monthly, paypal_plan_id_yearly, is_active
       FROM subscription_plans WHERE id = $1`,
      [planId]
    );
    if (plan.rows.length === 0 || !plan.rows[0].is_active) {
      return res.status(404).json({ message: 'Plan no disponible' });
    }

    const row = plan.rows[0];
    const paypalPlanId =
      billingCycle === 'yearly' ? row.paypal_plan_id_yearly : row.paypal_plan_id_monthly;

    const result = await createPaypalSubscriptionApproval({
      userId: req.userId!,
      paypalPlanId,
      billingCycle,
      returnUrl: String(req.body.returnUrl || process.env.PAYPAL_RETURN_URL || ''),
      cancelUrl: String(req.body.cancelUrl || process.env.PAYPAL_CANCEL_URL || ''),
    });

    if (!result.ok) {
      return res.status(503).json({
        message: result.message || 'PayPal no está configurado o el plan no tiene ID de PayPal',
      });
    }

    res.json({
      approvalUrl: result.approvalUrl,
      subscriptionId: result.paypalSubscriptionId,
    });
  } catch (e: any) {
    console.error('startPaypalSubscription', e);
    res.status(500).json({ message: e.message || 'Error al iniciar PayPal' });
  }
};
