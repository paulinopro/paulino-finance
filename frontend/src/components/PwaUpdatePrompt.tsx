import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Workbox } from 'workbox-window';
import { useMobileTabBarVisible } from '../hooks/useMobileTabBarVisible';

/**
 * Registra el service worker en producción y muestra CTA cuando hay una nueva versión en espera.
 */
const PwaUpdatePrompt: React.FC = () => {
  const [show, setShow] = useState(false);
  const [wb, setWb] = useState<Workbox | null>(null);
  const mobileTabBar = useMobileTabBarVisible();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (process.env.REACT_APP_ENABLE_PWA === 'false') return;

    const w = new Workbox(`${process.env.PUBLIC_URL || ''}/service-worker.js`);

    const onWaiting = () => setShow(true);
    const onControlling = () => {
      window.location.reload();
    };

    w.addEventListener('waiting', onWaiting);
    w.addEventListener('controlling', onControlling);

    void w.register().catch((err) => {
      console.warn('[PWA] Registro del service worker no disponible:', err);
    });

    setWb(w);

    return () => {
      w.removeEventListener('waiting', onWaiting);
      w.removeEventListener('controlling', onControlling);
    };
  }, []);

  const onUpdate = useCallback(() => {
    if (wb) wb.messageSkipWaiting();
  }, [wb]);

  if (!show) return null;

  return (
    <div
      className={`fixed left-0 right-0 z-[100] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 pointer-events-none ${
        mobileTabBar ? 'bottom-16 lg:bottom-0' : 'bottom-0'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto max-w-lg mx-auto flex flex-col xs:flex-row xs:items-center xs:justify-between gap-2 rounded-xl border border-dark-600 bg-dark-800/95 backdrop-blur-sm px-4 py-3 shadow-xl text-sm text-dark-100">
        <span>Hay una nueva versión de la aplicación.</span>
        <button
          type="button"
          onClick={onUpdate}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium shrink-0"
        >
          <RefreshCw size={18} aria-hidden />
          Actualizar
        </button>
      </div>
    </div>
  );
};

export default PwaUpdatePrompt;
