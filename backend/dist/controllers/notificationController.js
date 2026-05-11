"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.testNotification = exports.testPushNotification = exports.unsubscribePush = exports.subscribePush = exports.getPushVapidPublicKey = exports.deleteNotification = exports.markAllAsRead = exports.updateNotificationSettings = exports.getNotificationSettings = exports.markAsRead = exports.getNotificationById = exports.getNotifications = void 0;
const database_1 = require("../config/database");
const webPushService_1 = require("../services/webPushService");
const getNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        const { unreadOnly, page = '1', limit = '20', type } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);
        const offset = (pageNum - 1) * limitNum;
        let whereClause = 'WHERE user_id = $1';
        const params = [userId];
        if (unreadOnly === 'true') {
            whereClause += ' AND is_read = false';
        }
        const readOnly = req.query.readOnly;
        if (readOnly === 'true' && unreadOnly !== 'true') {
            whereClause += ' AND is_read = true';
        }
        if (type && type !== 'all') {
            whereClause += ' AND type = $' + (params.length + 1);
            params.push(type);
        }
        // Get total count
        let countQuery = `SELECT COUNT(*) as total FROM notifications ${whereClause}`;
        const countResult = await (0, database_1.query)(countQuery, params);
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
        const result = await (0, database_1.query)(queryText, params);
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
    }
    catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ message: 'Error fetching notifications', error: error.message });
    }
};
exports.getNotifications = getNotifications;
const getNotificationById = async (req, res) => {
    try {
        const userId = req.userId;
        const notificationId = parseInt(req.params.id, 10);
        if (!Number.isFinite(notificationId)) {
            return res.status(400).json({ message: 'Invalid notification id' });
        }
        const result = await (0, database_1.query)(`SELECT id, type, title, message, related_id, related_type, is_read, created_at
       FROM notifications
       WHERE id = $1 AND user_id = $2`, [notificationId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        const row = result.rows[0];
        res.json({
            success: true,
            notification: {
                id: row.id,
                type: row.type,
                title: row.title,
                message: row.message,
                relatedId: row.related_id,
                relatedType: row.related_type,
                isRead: row.is_read,
                createdAt: row.created_at,
            },
        });
    }
    catch (error) {
        console.error('Get notification by id error:', error);
        res.status(500).json({ message: 'Error fetching notification', error: error.message });
    }
};
exports.getNotificationById = getNotificationById;
const markAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        const notificationId = parseInt(req.params.id);
        const result = await (0, database_1.query)(`UPDATE notifications
       SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, is_read`, [notificationId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json({
            success: true,
            message: 'Notification marked as read',
        });
    }
    catch (error) {
        console.error('Mark as read error:', error);
        res.status(500).json({ message: 'Error updating notification', error: error.message });
    }
};
exports.markAsRead = markAsRead;
const getNotificationSettings = async (req, res) => {
    try {
        const userId = req.userId;
        const result = await (0, database_1.query)(`SELECT notification_type, enabled, days_before, telegram_enabled, email_enabled
       FROM notification_settings
       WHERE user_id = $1`, [userId]);
        const settings = {};
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
    }
    catch (error) {
        console.error('Get notification settings error:', error);
        res.status(500).json({ message: 'Error fetching settings', error: error.message });
    }
};
exports.getNotificationSettings = getNotificationSettings;
const updateNotificationSettings = async (req, res) => {
    try {
        const userId = req.userId;
        const { notificationType, enabled, daysBefore, telegramEnabled, emailEnabled } = req.body;
        if (!notificationType) {
            return res.status(400).json({ message: 'Notification type is required' });
        }
        await (0, database_1.query)(`INSERT INTO notification_settings 
       (user_id, notification_type, enabled, days_before, telegram_enabled, email_enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, notification_type)
       DO UPDATE SET
         enabled = EXCLUDED.enabled,
         days_before = EXCLUDED.days_before,
         telegram_enabled = EXCLUDED.telegram_enabled,
         email_enabled = EXCLUDED.email_enabled,
         updated_at = CURRENT_TIMESTAMP`, [
            userId,
            notificationType,
            enabled !== undefined ? enabled : true,
            daysBefore || [3, 7],
            telegramEnabled !== undefined ? telegramEnabled : false,
            emailEnabled !== undefined ? emailEnabled : false,
        ]);
        res.json({
            success: true,
            message: 'Notification settings updated successfully',
        });
    }
    catch (error) {
        console.error('Update notification settings error:', error);
        res.status(500).json({ message: 'Error updating settings', error: error.message });
    }
};
exports.updateNotificationSettings = updateNotificationSettings;
const markAllAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        await (0, database_1.query)(`UPDATE notifications
       SET is_read = true
       WHERE user_id = $1 AND is_read = false`, [userId]);
        res.json({
            success: true,
            message: 'All notifications marked as read',
        });
    }
    catch (error) {
        console.error('Mark all as read error:', error);
        res.status(500).json({ message: 'Error updating notifications', error: error.message });
    }
};
exports.markAllAsRead = markAllAsRead;
const deleteNotification = async (req, res) => {
    try {
        const userId = req.userId;
        const notificationId = parseInt(req.params.id);
        const result = await (0, database_1.query)('DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id', [notificationId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json({
            success: true,
            message: 'Notification deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ message: 'Error deleting notification', error: error.message });
    }
};
exports.deleteNotification = deleteNotification;
const getPushVapidPublicKey = async (_req, res) => {
    try {
        const publicKey = (0, webPushService_1.getVapidPublicKey)();
        res.json({
            success: true,
            publicKey,
            configured: !!publicKey,
        });
    }
    catch (error) {
        console.error('VAPID public key error:', error);
        res.status(500).json({ message: 'Error', error: error.message });
    }
};
exports.getPushVapidPublicKey = getPushVapidPublicKey;
const subscribePush = async (req, res) => {
    try {
        const userId = req.userId;
        const subscription = req.body?.subscription;
        if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
            return res.status(400).json({ message: 'Suscripción push inválida' });
        }
        await (0, database_1.query)(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         p256dh = EXCLUDED.p256dh,
         auth = EXCLUDED.auth,
         user_agent = EXCLUDED.user_agent,
         updated_at = CURRENT_TIMESTAMP`, [
            userId,
            subscription.endpoint,
            subscription.keys.p256dh,
            subscription.keys.auth,
            req.headers['user-agent'] || null,
        ]);
        res.json({ success: true, message: 'Suscripción guardada' });
    }
    catch (error) {
        console.error('subscribePush error:', error);
        res.status(500).json({ message: 'Error al guardar suscripción', error: error.message });
    }
};
exports.subscribePush = subscribePush;
const unsubscribePush = async (req, res) => {
    try {
        const userId = req.userId;
        const { endpoint } = req.body;
        if (!endpoint || typeof endpoint !== 'string') {
            return res.status(400).json({ message: 'endpoint requerido' });
        }
        await (0, database_1.query)(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [
            userId,
            endpoint,
        ]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('unsubscribePush error:', error);
        res.status(500).json({ message: 'Error al eliminar suscripción', error: error.message });
    }
};
exports.unsubscribePush = unsubscribePush;
/** Prueba Web Push sin Telegram: requiere VAPID y al menos una fila en push_subscriptions. */
const testPushNotification = async (req, res) => {
    try {
        const userId = req.userId;
        if (!(0, webPushService_1.isWebPushConfigured)()) {
            return res.status(503).json({
                success: false,
                message: 'Web Push no está activo en el servidor. Configura VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY en el entorno del backend.',
            });
        }
        const subsResult = await (0, database_1.query)(`SELECT COUNT(*)::int AS c FROM push_subscriptions WHERE user_id = $1`, [userId]);
        const subCount = Number(subsResult.rows[0]?.c ?? 0);
        if (!Number.isFinite(subCount) || subCount < 1) {
            return res.status(400).json({
                success: false,
                message: 'No hay suscripción push para tu cuenta. En Configuración → Notificaciones, con permiso ya concedido, pulsa «Registrar o actualizar push en este dispositivo» y luego vuelve a probar.',
            });
        }
        const title = 'Prueba push — Paulino Finance';
        const message = '<p>Si ves esta notificación en el sistema, Web Push y VAPID están bien configurados.</p>';
        const ins = await (0, database_1.query)(`INSERT INTO notifications (user_id, type, title, message, related_id, related_type)
       VALUES ($1, 'SYSTEM', $2, $3, NULL, NULL)
       RETURNING id`, [userId, title, message]);
        const nid = ins.rows[0]?.id;
        if (nid == null) {
            return res.status(500).json({
                success: false,
                message: 'No se pudo registrar el aviso de prueba',
            });
        }
        await (0, webPushService_1.sendPushForNotification)(userId, {
            title,
            message,
            notificationId: nid,
        });
        res.json({
            success: true,
            message: 'Push de prueba enviado. Revisa el dispositivo; también verás una entrada «Sistema» en el historial de notificaciones.',
        });
    }
    catch (error) {
        console.error('testPushNotification error:', error);
        res.status(500).json({
            success: false,
            message: 'Error al enviar push de prueba',
            error: error.message,
        });
    }
};
exports.testPushNotification = testPushNotification;
const testNotification = async (req, res) => {
    try {
        const userId = req.userId;
        const { sendTelegramMessage } = await Promise.resolve().then(() => __importStar(require('../services/telegramService')));
        // Check if Telegram Bot Token is configured
        const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
        if (!telegramToken || telegramToken === 'your-telegram-bot-token' || telegramToken.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Telegram Bot Token no está configurado. Por favor, configura TELEGRAM_BOT_TOKEN en las variables de entorno.',
            });
        }
        // Get user's telegram chat ID
        const userResult = await (0, database_1.query)('SELECT telegram_chat_id FROM users WHERE id = $1', [userId]);
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
        }
        else {
            res.status(500).json({
                success: false,
                message: 'Error al enviar notificación de prueba. Verifica que:\n1. El Telegram Bot Token esté configurado correctamente\n2. Tu Chat ID sea correcto\n3. Hayas iniciado una conversación con el bot primero',
            });
        }
    }
    catch (error) {
        console.error('Test notification error:', error);
        res.status(500).json({
            success: false,
            message: 'Error al enviar notificación de prueba',
            error: error.message,
        });
    }
};
exports.testNotification = testNotification;
//# sourceMappingURL=notificationController.js.map