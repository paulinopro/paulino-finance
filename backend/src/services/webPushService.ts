import webpush from 'web-push';
import { query } from '../config/database';
import { formatNotificationForPush } from '../utils/pushPlainText';

let vapidConfigured = false;

export function initWebPush(): void {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@localhost';
  if (!publicKey || !privateKey) {
    console.warn(
      '[Web Push] VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no configurados; el envío push está desactivado.'
    );
    return;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  console.log('[Web Push] VAPID configurado.');
}

export function isWebPushConfigured(): boolean {
  return vapidConfigured;
}

export function getVapidPublicKey(): string | null {
  const k = process.env.VAPID_PUBLIC_KEY?.trim();
  return k || null;
}

export async function sendPushForNotification(
  userId: number,
  params: { title: string; message: string; notificationId: number }
): Promise<void> {
  if (!vapidConfigured) return;

  const plainTitle = params.title.replace(/<[^>]*>/g, '').trim() || 'Paulino Finance';
  const body = formatNotificationForPush(plainTitle, params.message);
  const payload = JSON.stringify({
    title: plainTitle,
    body,
    url: '/notifications/history',
    tag: `pf-${params.notificationId}`,
  });

  const subs = await query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );

  for (const row of subs.rows) {
    const subscription = {
      endpoint: row.endpoint as string,
      keys: {
        p256dh: row.p256dh as string,
        auth: row.auth as string,
      },
    };
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 86400 });
    } catch (e: unknown) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await query(`DELETE FROM push_subscriptions WHERE id = $1`, [row.id]);
      } else {
        console.error('[Web Push] Error al enviar:', (e as Error).message);
      }
    }
  }
}
