import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { signAuthToken } from '../utils/jwt';
import { sendPasswordResetEmail } from '../services/emailService';
import { seedDefaultTemplatesForUser } from '../services/notificationTemplateSeed';
import { getDefaultExchangeRateDopUsd, resolveExchangeRateDopUsd } from '../utils/exchangeRate';

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

async function isRegistrationEnabled(): Promise<boolean> {
  const r = await query(`SELECT value FROM system_settings WHERE key = 'registration_enabled'`);
  if (r.rows.length === 0) return true;
  return r.rows[0].value === 'true';
}

export const getRegistrationStatus = async (_req: Request, res: Response) => {
  try {
    const enabled = await isRegistrationEnabled();
    res.json({ registrationEnabled: enabled });
  } catch (error: any) {
    console.error('getRegistrationStatus error:', error);
    res.status(500).json({ message: 'Error' });
  }
};

/** Sin autenticación: banderas para la app (registro, mantenimiento). */
export const getPublicConfig = async (_req: Request, res: Response) => {
  try {
    const r = await query(
      `SELECT key, value FROM system_settings WHERE key IN ('registration_enabled', 'maintenance_mode')`
    );
    const map = new Map<string, string>(r.rows.map((row: { key: string; value: string }) => [row.key, row.value]));
    const registrationEnabled = !map.has('registration_enabled') || map.get('registration_enabled') === 'true';
    const maintenanceMode = map.get('maintenance_mode') === 'true';
    res.json({ registrationEnabled, maintenanceMode });
  } catch (error: any) {
    console.error('getPublicConfig error:', error);
    res.status(500).json({ message: 'Error' });
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    if (!(await isRegistrationEnabled())) {
      return res.status(403).json({ message: 'El registro de nuevas cuentas está deshabilitado' });
    }

    // Check if user exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const superEmails =
      process.env.SUPER_ADMIN_EMAILS?.split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean) || [];
    const isSuper = superEmails.includes(String(email).trim().toLowerCase());

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const defaultRate = getDefaultExchangeRateDopUsd();
    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_super_admin, exchange_rate_dop_usd)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, cedula, telegram_chat_id, currency_preference, exchange_rate_dop_usd, timezone, created_at, is_super_admin`,
      [email, passwordHash, firstName || null, lastName || null, isSuper, defaultRate]
    );

    const user = result.rows[0];

    const freePlan = await query(`SELECT id FROM subscription_plans WHERE slug = 'free' LIMIT 1`);
    if (freePlan.rows[0]) {
      await query(
        `INSERT INTO user_subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
         VALUES ($1, $2, 'active', CURRENT_TIMESTAMP, NULL)
         ON CONFLICT (user_id) DO UPDATE SET plan_id = EXCLUDED.plan_id, status = 'active', updated_at = CURRENT_TIMESTAMP`,
        [user.id, freePlan.rows[0].id]
      );
    }

    try {
      await seedDefaultTemplatesForUser(user.id);
    } catch (e) {
      console.warn('seedDefaultTemplatesForUser:', e);
    }

    const token = signAuthToken({
      userId: user.id,
      isSuperAdmin: !!user.is_super_admin,
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        cedula: user.cedula != null ? String(user.cedula) : null,
        telegramChatId: user.telegram_chat_id,
        currencyPreference: user.currency_preference || 'DOP',
        exchangeRateDopUsd: resolveExchangeRateDopUsd(user.exchange_rate_dop_usd),
        timezone: user.timezone || 'America/Santo_Domingo',
        isSuperAdmin: !!user.is_super_admin,
        hasUserSubscriptionRecord: !!freePlan.rows[0],
        subscriptionPlan: 'free',
        subscriptionStatus: 'active',
      },
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Error registering user' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const result = await query(
      `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name, u.cedula, u.telegram_chat_id, u.currency_preference,
              u.exchange_rate_dop_usd, u.timezone, u.is_super_admin, u.is_active, u.subscription_plan, u.subscription_status,
              (SELECT EXISTS(SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id)) AS has_user_subscription_row
       FROM users u WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const canLogin = user.is_super_admin === true || user.is_active !== false;
    if (!canLogin) {
      return res.status(403).json({ message: 'Tu cuenta está deshabilitada. Contacta al soporte.' });
    }

    const token = signAuthToken({
      userId: user.id,
      isSuperAdmin: user.is_super_admin === true,
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        cedula: user.cedula != null ? String(user.cedula) : null,
        telegramChatId: user.telegram_chat_id,
        currencyPreference: user.currency_preference || 'DOP',
        exchangeRateDopUsd: resolveExchangeRateDopUsd(user.exchange_rate_dop_usd),
        timezone: user.timezone || 'America/Santo_Domingo',
        isSuperAdmin: user.is_super_admin === true,
        hasUserSubscriptionRecord: user.has_user_subscription_row === true,
        subscriptionPlan: user.subscription_plan || 'free',
        subscriptionStatus: user.subscription_status || 'active',
      },
    });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Error logging in' });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.cedula, u.telegram_chat_id,
              u.currency_preference, u.exchange_rate_dop_usd, u.timezone, u.created_at,
              u.is_super_admin, u.is_active, u.subscription_plan, u.subscription_status,
              (SELECT EXISTS(SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id)) AS has_user_subscription_row
       FROM users u WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        cedula: user.cedula != null ? String(user.cedula) : null,
        telegramChatId: user.telegram_chat_id,
        currencyPreference: user.currency_preference,
        exchangeRateDopUsd: resolveExchangeRateDopUsd(user.exchange_rate_dop_usd),
        timezone: user.timezone || 'America/Santo_Domingo',
        isSuperAdmin: user.is_super_admin === true,
        isActive: user.is_active !== false,
        subscriptionPlan: user.subscription_plan || 'free',
        subscriptionStatus: user.subscription_status || 'active',
        hasUserSubscriptionRecord: user.has_user_subscription_row === true,
      },
      impersonatedBy: req.impersonatedBy ?? null,
    });
  } catch (error: any) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Error fetching user' });
  }
};

export const updateMe = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { firstName, lastName, cedula, telegramChatId, exchangeRateDopUsd, timezone, email } = req.body;

    // Handle null/empty values explicitly
    // For telegramChatId: if provided (even if empty string), update it; if undefined, keep current value
    let telegramValue = null;
    if (telegramChatId !== undefined) {
      telegramValue = telegramChatId === '' || telegramChatId === null ? null : telegramChatId;
    }

    // For exchangeRateDopUsd: if provided, parse it; if undefined, keep current value
    // If empty string or null, set to null; if undefined, don't update
    let exchangeRateValue = null;
    let shouldUpdateExchangeRate = false;
    if (exchangeRateDopUsd !== undefined) {
      shouldUpdateExchangeRate = true;
      if (exchangeRateDopUsd === '' || exchangeRateDopUsd === null) {
        exchangeRateValue = null;
      } else {
        exchangeRateValue = parseFloat(exchangeRateDopUsd);
        if (isNaN(exchangeRateValue)) {
          exchangeRateValue = null;
        }
      }
    }

    // Build dynamic UPDATE query based on what's provided
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (firstName !== undefined) {
      updates.push(`first_name = $${paramIndex}`);
      values.push(firstName || null);
      paramIndex++;
    }

    if (lastName !== undefined) {
      updates.push(`last_name = $${paramIndex}`);
      values.push(lastName || null);
      paramIndex++;
    }

    if (cedula !== undefined) {
      const cedulaNorm =
        cedula === null || cedula === ''
          ? null
          : String(cedula).trim() || null;
      updates.push(`cedula = $${paramIndex}`);
      values.push(cedulaNorm);
      paramIndex++;
    }

    if (telegramChatId !== undefined) {
      updates.push(`telegram_chat_id = $${paramIndex}`);
      values.push(telegramValue);
      paramIndex++;
    }

    if (shouldUpdateExchangeRate) {
      updates.push(`exchange_rate_dop_usd = $${paramIndex}`);
      values.push(exchangeRateValue);
      paramIndex++;
    }

    if (timezone !== undefined) {
      updates.push(`timezone = $${paramIndex}`);
      values.push(timezone || 'America/Santo_Domingo');
      paramIndex++;
    }

    if (email !== undefined) {
      const emailNorm = String(email).trim().toLowerCase();
      if (!emailNorm || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
        return res.status(400).json({ message: 'Correo electrónico no válido' });
      }
      const clash = await query(
        `SELECT id FROM users WHERE LOWER(TRIM(email)) = $1 AND id <> $2`,
        [emailNorm, userId]
      );
      if (clash.rows.length > 0) {
        return res.status(400).json({ message: 'Ese correo ya está registrado' });
      }
      updates.push(`email = $${paramIndex}`);
      values.push(emailNorm);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const result = await query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, email, first_name, last_name, cedula, telegram_chat_id,
                 currency_preference, exchange_rate_dop_usd, timezone, created_at, is_super_admin`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        cedula: user.cedula != null ? String(user.cedula) : null,
        telegramChatId: user.telegram_chat_id,
        currencyPreference: user.currency_preference,
        exchangeRateDopUsd: resolveExchangeRateDopUsd(user.exchange_rate_dop_usd),
        timezone: user.timezone || 'America/Santo_Domingo',
        isSuperAdmin: user.is_super_admin === true,
      },
    });
  } catch (error: any) {
    console.error('Update me error:', error);
    res.status(500).json({ message: 'Error updating profile' });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Contraseña actual y nueva son requeridas' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    const result = await query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    const match = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!match) {
      return res.status(401).json({ message: 'La contraseña actual no es correcta' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query(
      `UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [passwordHash, userId]
    );

    res.json({ success: true, message: 'Contraseña actualizada correctamente' });
  } catch (error: any) {
    console.error('changePassword error:', error);
    res.status(500).json({ message: 'Error al cambiar la contraseña' });
  }
};

const forgotPasswordResponse = {
  message:
    'Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.',
};

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const normalized = String(email || '')
      .trim()
      .toLowerCase();
    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return res.status(400).json({ message: 'Correo electrónico no válido' });
    }

    const result = await query(`SELECT id, email FROM users WHERE LOWER(TRIM(email)) = $1`, [
      normalized,
    ]);

    if (result.rows.length === 0) {
      return res.json(forgotPasswordResponse);
    }

    const row = result.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await query(
      `UPDATE users SET password_reset_token_hash = $1, password_reset_expires_at = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`,
      [tokenHash, expiresAt, row.id]
    );

    const base =
      process.env.FRONTEND_URL ||
      process.env.APP_PUBLIC_URL ||
      'http://localhost:3000';
    const resetUrl = `${String(base).replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

    try {
      await sendPasswordResetEmail(row.email, resetUrl);
    } catch (e) {
      console.error('forgotPassword send email', e);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info('[dev] Recuperación de contraseña — enlace:', resetUrl);
    }

    return res.json(forgotPasswordResponse);
  } catch (error: any) {
    console.error('forgotPassword error:', error);
    res.status(500).json({ message: 'Error al procesar la solicitud' });
  }
};

export const resetPasswordWithToken = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: 'Token y nueva contraseña son requeridos' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const tokenHash = hashResetToken(String(token));
    const result = await query(
      `SELECT id FROM users
       WHERE password_reset_token_hash = $1
         AND password_reset_expires_at IS NOT NULL
         AND password_reset_expires_at > CURRENT_TIMESTAMP`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        message: 'El enlace no es válido o ha expirado. Solicita uno nuevo desde «Olvidé mi contraseña».',
      });
    }

    const userId = result.rows[0].id;
    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      `UPDATE users SET
         password_hash = $1,
         password_reset_token_hash = NULL,
         password_reset_expires_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [passwordHash, userId]
    );

    res.json({
      success: true,
      message: 'Contraseña actualizada. Ya puedes iniciar sesión.',
    });
  } catch (error: any) {
    console.error('resetPasswordWithToken error:', error);
    res.status(500).json({ message: 'Error al restablecer la contraseña' });
  }
};
