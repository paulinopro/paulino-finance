import { useEffect, useRef } from 'react';
import type { AppNotification } from '../types';
import { formatNotificationForPush } from '../utils/systemNotificationFormat';

function pwaIconUrl(): string {
  const pub = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  return `${pub}/pwa-icons/icon-192x192.png`.replace(/\/{2,}/g, '/');
}

/**
 * Muestra notificaciones del navegador cuando hay avisos nuevos no leídos y la pestaña está en segundo plano.
 * Complementa el SW `pwa-push-handler.js` (Web Push con payload del servidor).
 */
export function useForegroundPushNotifications(
  notifications: AppNotification[],
  userId: number | undefined
): void {
  const seenIds = useRef<Set<number>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (userId == null) {
      seenIds.current = new Set();
      initialized.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (userId == null || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    if (notifications.length === 0) {
      if (!initialized.current) initialized.current = true;
      return;
    }

    if (!initialized.current) {
      notifications.forEach((n) => seenIds.current.add(n.id));
      initialized.current = true;
      return;
    }

    if (document.visibilityState !== 'hidden') return;

    const icon = pwaIconUrl();
    for (const n of notifications) {
      if (seenIds.current.has(n.id)) continue;
      seenIds.current.add(n.id);
      try {
        new Notification(n.title, {
          body: formatNotificationForPush(n.title, n.message),
          icon,
          badge: icon,
          tag: `pf-${n.id}`,
        });
      } catch {
        /* ignore */
      }
    }
  }, [notifications, userId]);
}
