import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { signAuthToken } from '../utils/jwt';
import { assignPlanToUser } from '../services/subscriptionService';

export const listUsers = async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const pattern = `%${search}%`;

    const searchWhereU =
      'WHERE u.email ILIKE $1 OR COALESCE(u.first_name,\'\') ILIKE $1 OR COALESCE(u.last_name,\'\') ILIKE $1';

    const countResult = search
      ? await query(`SELECT COUNT(*)::int AS c FROM users u ${searchWhereU}`, [pattern])
      : await query(`SELECT COUNT(*)::int AS c FROM users`);
    const total = countResult.rows[0]?.c ?? 0;

    const baseSelect = `SELECT u.id, u.email, u.first_name, u.last_name, u.created_at, u.is_super_admin, u.is_active,
                  us.plan_id AS plan_id,
                  sp.slug AS plan_slug, sp.name AS plan_name, us.status AS subscription_status`;

    const baseJoin = `FROM users u
           LEFT JOIN user_subscriptions us ON us.user_id = u.id
           LEFT JOIN subscription_plans sp ON sp.id = us.plan_id`;

    const result = search
      ? await query(
          `${baseSelect}
           ${baseJoin}
           ${searchWhereU}
           ORDER BY u.created_at DESC
           LIMIT $2 OFFSET $3`,
          [pattern, limit, offset]
        )
      : await query(
          `${baseSelect}
           ${baseJoin}
           ORDER BY u.created_at DESC
           LIMIT $1 OFFSET $2`,
          [limit, offset]
        );

    res.json({
      users: result.rows.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        createdAt: u.created_at,
        isSuperAdmin: u.is_super_admin === true,
        isActive: u.is_active !== false,
        planId: u.plan_id != null ? Number(u.plan_id) : null,
        subscriptionPlan: u.plan_slug || 'free',
        subscriptionPlanName: u.plan_name || null,
        subscriptionStatus: u.subscription_status || 'active',
      })),
      page,
      limit,
      total,
    });
  } catch (error: any) {
    console.error('listUsers error:', error);
    res.status(500).json({ message: 'Error al listar usuarios' });
  }
};

export const getSystemSettings = async (_req: AuthRequest, res: Response) => {
  try {
    const r = await query(`SELECT value FROM system_settings WHERE key = 'registration_enabled'`);
    const registrationEnabled = r.rows.length === 0 || r.rows[0].value === 'true';
    res.json({ registrationEnabled });
  } catch (error: any) {
    console.error('getSystemSettings error:', error);
    res.status(500).json({ message: 'Error' });
  }
};

export const updateSystemSettings = async (req: AuthRequest, res: Response) => {
  try {
    const { registrationEnabled } = req.body;
    if (typeof registrationEnabled !== 'boolean') {
      return res.status(400).json({ message: 'registrationEnabled boolean requerido' });
    }
    await query(
      `INSERT INTO system_settings (key, value, updated_at) VALUES ('registration_enabled', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [registrationEnabled ? 'true' : 'false']
    );
    res.json({ registrationEnabled });
  } catch (error: any) {
    console.error('updateSystemSettings error:', error);
    res.status(500).json({ message: 'Error al guardar configuración' });
  }
};

export const impersonateUser = async (req: AuthRequest, res: Response) => {
  try {
    const adminId = req.userId!;
    const targetId = parseInt(req.params.userId, 10);
    if (Number.isNaN(targetId)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    const target = await query(
      `SELECT id, email, first_name, last_name, telegram_chat_id, currency_preference,
              exchange_rate_dop_usd, timezone, is_super_admin, is_active
       FROM users WHERE id = $1`,
      [targetId]
    );
    if (target.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    const u = target.rows[0];
    if (u.is_super_admin === true) {
      return res.status(403).json({ message: 'No se puede suplantar a otro super administrador' });
    }
    if (u.is_active === false) {
      return res.status(403).json({ message: 'El usuario está deshabilitado' });
    }

    const token = signAuthToken({
      userId: u.id,
      impersonatedBy: adminId,
    });

    res.json({
      token,
      user: {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        telegramChatId: u.telegram_chat_id,
        currencyPreference: u.currency_preference || 'DOP',
        exchangeRateDopUsd: parseFloat(u.exchange_rate_dop_usd) || 55.0,
        timezone: u.timezone || 'America/Santo_Domingo',
        isSuperAdmin: false,
      },
      impersonatedBy: adminId,
    });
  } catch (error: any) {
    console.error('impersonateUser error:', error);
    res.status(500).json({ message: 'Error al suplantar usuario' });
  }
};

export const stopImpersonation = async (req: AuthRequest, res: Response) => {
  try {
    const impersonatedBy = req.impersonatedBy;
    if (impersonatedBy == null) {
      return res.status(400).json({ message: 'No estás en modo suplantación' });
    }

    const admin = await query(
      `SELECT id, email, first_name, last_name, telegram_chat_id, currency_preference,
              exchange_rate_dop_usd, timezone, is_super_admin
       FROM users WHERE id = $1 AND is_super_admin = true`,
      [impersonatedBy]
    );
    if (admin.rows.length === 0) {
      return res.status(403).json({ message: 'Sesión de administrador inválida' });
    }
    const u = admin.rows[0];

    const token = signAuthToken({
      userId: u.id,
      isSuperAdmin: true,
    });

    res.json({
      token,
      user: {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        telegramChatId: u.telegram_chat_id,
        currencyPreference: u.currency_preference || 'DOP',
        exchangeRateDopUsd: parseFloat(u.exchange_rate_dop_usd) || 55.0,
        timezone: u.timezone || 'America/Santo_Domingo',
        isSuperAdmin: true,
      },
    });
  } catch (error: any) {
    console.error('stopImpersonation error:', error);
    res.status(500).json({ message: 'Error al volver a la cuenta de administrador' });
  }
};

export const updateUserAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const targetId = parseInt(req.params.userId, 10);
    if (Number.isNaN(targetId)) {
      return res.status(400).json({ message: 'ID inválido' });
    }

    const { isActive, subscriptionPlan, subscriptionStatus, planId } = req.body;

    const existing = await query(
      `SELECT id, is_super_admin FROM users WHERE id = $1`,
      [targetId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    if (existing.rows[0].is_super_admin === true) {
      return res.status(403).json({ message: 'No se puede modificar un super administrador desde aquí' });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;

    if (typeof isActive === 'boolean') {
      updates.push(`is_active = $${i++}`);
      values.push(isActive);
    }
    if (subscriptionPlan !== undefined) {
      updates.push(`subscription_plan = $${i++}`);
      values.push(String(subscriptionPlan).slice(0, 50));
    }
    if (subscriptionStatus !== undefined) {
      updates.push(`subscription_status = $${i++}`);
      values.push(String(subscriptionStatus).slice(0, 50));
    }

    if (planId !== undefined && planId !== null) {
      const pid = parseInt(String(planId), 10);
      if (Number.isNaN(pid)) {
        return res.status(400).json({ message: 'planId inválido' });
      }
      await assignPlanToUser(targetId, pid);
    }

    if (updates.length === 0 && planId === undefined) {
      return res.status(400).json({ message: 'Nada que actualizar' });
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(targetId);

      await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`,
        values
      );
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('updateUserAdmin error:', error);
    res.status(500).json({ message: 'Error al actualizar usuario' });
  }
};
