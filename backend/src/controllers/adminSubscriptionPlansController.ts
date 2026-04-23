import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { query } from '../config/database';
import { logAdminAction } from '../services/adminAuditService';
import { syncPaypalSubscriptionPlanById } from '../services/paypalPlanProvisioningService';

export const listSubscriptionPlans = async (_req: AuthRequest, res: Response) => {
  try {
    const r = await query(
      `SELECT id, name, slug, description, price_monthly, price_yearly, currency,
              paypal_product_id, paypal_plan_id_monthly, paypal_plan_id_yearly, enabled_modules,
              is_active, sort_order, created_at, updated_at
       FROM subscription_plans
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
        paypalProductId: p.paypal_product_id ?? null,
        paypalPlanIdMonthly: p.paypal_plan_id_monthly,
        paypalPlanIdYearly: p.paypal_plan_id_yearly,
        enabledModules: p.enabled_modules,
        isActive: p.is_active,
        sortOrder: p.sort_order,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    });
  } catch (e: any) {
    console.error('listSubscriptionPlans', e);
    res.status(500).json({ message: 'Error' });
  }
};

export const createSubscriptionPlan = async (req: AuthRequest, res: Response) => {
  try {
    const {
      name,
      slug,
      description,
      priceMonthly,
      priceYearly,
      currency,
      paypalProductId,
      paypalPlanIdMonthly,
      paypalPlanIdYearly,
      enabledModules,
      isActive,
      sortOrder,
    } = req.body;

    if (!name || !slug || !enabledModules || typeof enabledModules !== 'object') {
      return res.status(400).json({ message: 'name, slug y enabledModules son requeridos' });
    }

    const result = await query(
      `INSERT INTO subscription_plans (
         name, slug, description, price_monthly, price_yearly, currency,
         paypal_product_id, paypal_plan_id_monthly, paypal_plan_id_yearly, enabled_modules, is_active, sort_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12)
       RETURNING id`,
      [
        String(name).slice(0, 255),
        String(slug).toLowerCase().replace(/\s+/g, '-').slice(0, 80),
        description ?? null,
        priceMonthly ?? 0,
        priceYearly ?? 0,
        currency || 'USD',
        paypalProductId || null,
        paypalPlanIdMonthly || null,
        paypalPlanIdYearly || null,
        JSON.stringify(enabledModules),
        isActive !== false,
        sortOrder ?? 0,
      ]
    );

    const newId = result.rows[0].id as number;
    void logAdminAction(req.userId!, 'plan.create', 'subscription_plan', newId, { name, slug });
    res.status(201).json({ id: newId });
  } catch (e: any) {
    if (e.code === '23505') {
      return res.status(400).json({ message: 'Ya existe un plan con ese slug' });
    }
    console.error('createSubscriptionPlan', e);
    res.status(500).json({ message: 'Error al crear plan' });
  }
};

export const updateSubscriptionPlan = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    const {
      name,
      slug,
      description,
      priceMonthly,
      priceYearly,
      currency,
      paypalProductId,
      paypalPlanIdMonthly,
      paypalPlanIdYearly,
      enabledModules,
      isActive,
      sortOrder,
    } = req.body;

    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) {
      updates.push(`name = $${values.length + 1}`);
      values.push(String(name).slice(0, 255));
    }
    if (slug !== undefined) {
      updates.push(`slug = $${values.length + 1}`);
      values.push(String(slug).toLowerCase().replace(/\s+/g, '-').slice(0, 80));
    }
    if (description !== undefined) {
      updates.push(`description = $${values.length + 1}`);
      values.push(description);
    }
    if (priceMonthly !== undefined) {
      updates.push(`price_monthly = $${values.length + 1}`);
      values.push(priceMonthly);
    }
    if (priceYearly !== undefined) {
      updates.push(`price_yearly = $${values.length + 1}`);
      values.push(priceYearly);
    }
    if (currency !== undefined) {
      updates.push(`currency = $${values.length + 1}`);
      values.push(String(currency).slice(0, 3));
    }
    if (paypalPlanIdMonthly !== undefined) {
      updates.push(`paypal_plan_id_monthly = $${values.length + 1}`);
      values.push(paypalPlanIdMonthly || null);
    }
    if (paypalPlanIdYearly !== undefined) {
      updates.push(`paypal_plan_id_yearly = $${values.length + 1}`);
      values.push(paypalPlanIdYearly || null);
    }
    if (enabledModules !== undefined) {
      updates.push(`enabled_modules = $${values.length + 1}::jsonb`);
      values.push(JSON.stringify(enabledModules));
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${values.length + 1}`);
      values.push(!!isActive);
    }
    if (sortOrder !== undefined) {
      updates.push(`sort_order = $${values.length + 1}`);
      values.push(sortOrder);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'Nada que actualizar' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    await query(
      `UPDATE subscription_plans SET ${updates.join(', ')} WHERE id = $${values.length}`,
      values
    );

    void logAdminAction(req.userId!, 'plan.update', 'subscription_plan', id, { body: req.body });
    res.json({ success: true });
  } catch (e: any) {
    console.error('updateSubscriptionPlan', e);
    res.status(500).json({ message: 'Error al actualizar plan' });
  }
};

/** Crea en PayPal el producto (catálogo) y los planes de facturación mensual/anual; guarda PROD- y P- en BD. */
export const syncSubscriptionPlanPaypal = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    const result = await syncPaypalSubscriptionPlanById(id);
    if (!result.ok) {
      return res.status(400).json({ message: result.message });
    }

    void logAdminAction(req.userId!, 'plan.sync_paypal', 'subscription_plan', id, {
      created: result.created,
    });
    res.json({
      success: true,
      paypalProductId: result.paypalProductId,
      paypalPlanIdMonthly: result.paypalPlanIdMonthly,
      paypalPlanIdYearly: result.paypalPlanIdYearly,
      created: result.created,
    });
  } catch (e: any) {
    console.error('syncSubscriptionPlanPaypal', e);
    res.status(500).json({ message: e.message || 'Error al sincronizar con PayPal' });
  }
};

export const deleteSubscriptionPlan = async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    const inUse = await query(
      `SELECT COUNT(*)::int AS c FROM user_subscriptions WHERE plan_id = $1`,
      [id]
    );
    if ((inUse.rows[0]?.c ?? 0) > 0) {
      return res.status(400).json({
        message: 'No se puede eliminar: hay usuarios con este plan. Desactívalo en su lugar.',
      });
    }

    await query(`DELETE FROM subscription_plans WHERE id = $1`, [id]);
    void logAdminAction(req.userId!, 'plan.delete', 'subscription_plan', id, {});
    res.json({ success: true });
  } catch (e: any) {
    console.error('deleteSubscriptionPlan', e);
    res.status(500).json({ message: 'Error al eliminar' });
  }
};
