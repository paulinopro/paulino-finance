"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initWebPush = initWebPush;
exports.isWebPushConfigured = isWebPushConfigured;
exports.getVapidPublicKey = getVapidPublicKey;
exports.sendPushForNotification = sendPushForNotification;
const web_push_1 = __importDefault(require("web-push"));
const database_1 = require("../config/database");
const pushPlainText_1 = require("../utils/pushPlainText");
let vapidConfigured = false;
function initWebPush() {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@localhost';
    if (!publicKey || !privateKey) {
        console.warn('[Web Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configurados; el envío push está desactivado.');
        return;
    }
    web_push_1.default.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    console.log('[Web Push] VAPID configurado.');
}
function isWebPushConfigured() {
    return vapidConfigured;
}
function getVapidPublicKey() {
    const k = process.env.VAPID_PUBLIC_KEY?.trim();
    return k || null;
}
async function sendPushForNotification(userId, params) {
    if (!vapidConfigured)
        return;
    const plainTitle = params.title.replace(/<[^>]*>/g, '').trim() || 'Paulino Finance';
    const body = (0, pushPlainText_1.formatNotificationForPush)(plainTitle, params.message);
    const payload = JSON.stringify({
        title: plainTitle,
        body,
        url: '/notifications/history',
        tag: `pf-${params.notificationId}`,
    });
    const subs = await (0, database_1.query)(`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`, [userId]);
    for (const row of subs.rows) {
        const subscription = {
            endpoint: row.endpoint,
            keys: {
                p256dh: row.p256dh,
                auth: row.auth,
            },
        };
        try {
            await web_push_1.default.sendNotification(subscription, payload, { TTL: 86400 });
        }
        catch (e) {
            const status = e.statusCode;
            if (status === 404 || status === 410) {
                await (0, database_1.query)(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id]);
            }
            else {
                console.error('[Web Push] Error al enviar:', e.message);
            }
        }
    }
}
//# sourceMappingURL=webPushService.js.map