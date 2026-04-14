import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { unreadOnly, page = '1', limit = '20', type } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    let whereClause = 'WHERE user_id = $1';
    const params: any[] = [userId];

    if (unreadOnly === 'true') {
      whereClause += ' AND is_read = false';
    }

    if (type && type !== 'all') {
      whereClause += ' AND type = $' + (params.length + 1);
      params.push(type);
    }

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM notifications ${whereClause}`;
    const countResult = await query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get paginated results
    let queryText = `
      SELECT id, type, title, message, related_id, related_type, is_read, created_at
      FROM notifications
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limitNum, offset);

    const result = await query(queryText, params);

    const totalPages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      notifications: result.rows.map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        relatedId: row.related_id,
        relatedType: row.related_type,
        isRead: row.is_read,
        createdAt: row.created_at,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const notificationId = parseInt(req.params.id);

    const result = await query(
      `UPDATE notifications
       SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read`,
      [notificationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error: any) {
    console.error('Mark as read error:', error);
    res.status(500).json({ message: 'Error updating notification', error: error.message });
  }
};

export const getNotificationSettings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await query(
      `SELECT notification_type, enabled, days_before, telegram_enabled, email_enabled
       FROM notification_settings
       WHERE user_id = $1`,
      [userId]
    );

    const settings: { [key: string]: any } = {};
    result.rows.forEach((row) => {
      settings[row.notification_type] = {
        enabled: row.enabled,
        daysBefore: row.days_before,
        telegramEnabled: row.telegram_enabled,
        emailEnabled: row.email_enabled,
      };
    });

    res.json({
      success: true,
      settings,
    });
  } catch (error: any) {
    console.error('Get notification settings error:', error);
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
  }
};

export const updateNotificationSettings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { notificationType, enabled, daysBefore, telegramEnabled, emailEnabled } = req.body;

    if (!notificationType) {
      return res.status(400).json({ message: 'Notification type is required' });
    }

    await query(
      `INSERT INTO notification_settings 
       (user_id, notification_type, enabled, days_before, telegram_enabled, email_enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, notification_type)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         days_before = EXCLUDED.days_before,
         telegram_enabled = EXCLUDED.telegram_enabled,
         email_enabled = EXCLUDED.email_enabled,
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        notificationType,
        enabled !== undefined ? enabled : true,
        daysBefore || [3, 7],
        telegramEnabled !== undefined ? telegramEnabled : false,
        emailEnabled !== undefined ? emailEnabled : false,
      ]
    );

    res.json({
      success: true,
      message: 'Notification settings updated successfully',
    });
  } catch (error: any) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ message: 'Error updating settings', error: error.message });
  }
};

export const markAllAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    await query(
      `UPDATE notifications
       SET is_read = true
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );

    res.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error: any) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ message: 'Error updating notifications', error: error.message });
  }
};

export const deleteNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const notificationId = parseInt(req.params.id);

    const result = await query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [notificationId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Error deleting notification', error: error.message });
  }
};

export const testNotification = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { sendTelegramMessage } = await import('../services/telegramService');

    // Check if Telegram Bot Token is configured
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!telegramToken || telegramToken === 'your-telegram-bot-token' || telegramToken.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Telegram Bot Token no está configurado. Por favor, configura TELEGRAM_BOT_TOKEN en las variables de entorno.',
      });
    }

    // Get user's telegram chat ID
    const userResult = await query(
      'SELECT telegram_chat_id FROM users WHERE id = $1',
      [userId]
    );

    if (!userResult.rows[0]?.telegram_chat_id) {
      return res.status(400).json({
        success: false,
        message: 'Telegram Chat ID no está configurado. Por favor, configura tu Chat ID en Configuración.',
      });
    }

    const telegramChatId = userResult.rows[0].telegram_chat_id;
    const testMessage = `🔔 <b>Prueba de Notificación</b>\n\n` +
      `Este es un mensaje de prueba de Paulino Finance.\n` +
      `Si recibes este mensaje, las notificaciones están configuradas correctamente.`;

    const sent = await sendTelegramMessage(telegramChatId, testMessage);

    if (sent) {
      res.json({
        success: true,
        message: 'Notificación de prueba enviada exitosamente. Revisa tu Telegram.',
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Error al enviar notificación de prueba. Verifica que:\n1. El Telegram Bot Token esté configurado correctamente\n2. Tu Chat ID sea correcto\n3. Hayas iniciado una conversación con el bot primero',
      });
    }
  } catch (error: any) {
    console.error('Test notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error al enviar notificación de prueba',
      error: error.message,
    });
  }
};

