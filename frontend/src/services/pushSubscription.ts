import api from './api';

const SW_READY_MS = 25_000;

/** Mensajes en español para depuración en UI cuando falla syncPushSubscriptionWithServer. */
export function getPushSyncFailureMessage(reason?: string): string {
  switch (reason) {
    case 'dev':
      return 'El push solo se registra en la build de producción. En local añade REACT_APP_ENABLE_PUSH_SYNC=true.';
    case 'pwa-disabled':
      return 'PWA desactivada (REACT_APP_ENABLE_PWA=false en el build del frontend).';
    case 'unsupported':
      return 'Este navegador no soporta notificaciones push (falta service worker o PushManager).';
    case 'no-permission':
      return 'Hay que conceder permiso de notificaciones primero.';
    case 'no-vapid':
      return 'El backend no tiene VAPID activo (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el servidor).';
    case 'no-sw-timeout':
      return (
        'No hay service worker activo a tiempo (¿HTTPS, PWA en la build?). Recarga la página o instala/abre como PWA y vuelve a intentar.'
      );
    case 'error':
      return 'Error al suscribirse (red o servidor). Open consola para detalles.';
    default:
      return 'No se pudo registrar el push.';
  }
}

function waitServiceWorkerReadyMs(ms: number): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, reject) =>
      setTimeout(() => reject(new Error('sw-timeout')), ms)
    ),
  ]);
}

/** Convierte la clave pública VAPID (base64 URL) a Uint8Array para PushManager. */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Registra la suscripción Web Push en el backend (requiere PWA/SW en producción y permiso concedido).
 */
export async function syncPushSubscriptionWithServer(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === 'undefined') {
    return { ok: false, reason: 'no-window' };
  }
  const allowInDev = process.env.REACT_APP_ENABLE_PUSH_SYNC === 'true';
  if (process.env.NODE_ENV !== 'production' && !allowInDev) {
    return { ok: false, reason: 'dev' };
  }
  if (process.env.REACT_APP_ENABLE_PWA === 'false') {
    return { ok: false, reason: 'pwa-disabled' };
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }
  if (Notification.permission !== 'granted') {
    return { ok: false, reason: 'no-permission' };
  }

  try {
    let reg: ServiceWorkerRegistration;
    try {
      reg = await waitServiceWorkerReadyMs(SW_READY_MS);
    } catch {
      return { ok: false, reason: 'no-sw-timeout' };
    }
    const { data } = await api.get<{ success?: boolean; publicKey?: string | null; configured?: boolean }>(
      '/notifications/push/vapid-public-key'
    );
    if (!data.configured || !data.publicKey) {
      return { ok: false, reason: 'no-vapid' };
    }

    const applicationServerKey = urlBase64ToUint8Array(data.publicKey);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    await api.post('/notifications/push/subscribe', { subscription: sub.toJSON() });
    return { ok: true };
  } catch (e) {
    console.warn('[Push] syncPushSubscriptionWithServer:', e);
    return { ok: false, reason: 'error' };
  }
}
