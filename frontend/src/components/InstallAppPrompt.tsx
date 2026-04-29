import React, { useCallback, useEffect, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { useMobileTabBarVisible } from '../hooks/useMobileTabBarVisible';

const DISMISS_KEY = 'paulino-install-prompt-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function allowInstallContext(): boolean {
  if (typeof window === 'undefined') return false;
  const { protocol, hostname } = window.location;
  return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * CTA para instalar la PWA: Chromium (beforeinstallprompt) o instrucciones para Safari iOS.
 */
const InstallAppPrompt: React.FC = () => {
  const mobileTabBar = useMobileTabBarVisible();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [iosHint, setIosHint] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (localStorage.getItem(DISMISS_KEY) === '1') return false;
    } catch {
      /* ignore */
    }
    return isIos() && !isStandalone();
  });

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (process.env.REACT_APP_ENABLE_PWA === 'false') return;
    if (isStandalone()) return;
    if (dismissed) return;
    if (!allowInstallContext()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setIosHint(false);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, [dismissed]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
    setDeferred(null);
    setIosHint(false);
  }, []);

  const onInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }, [deferred]);

  if (process.env.NODE_ENV !== 'production') return null;
  if (process.env.REACT_APP_ENABLE_PWA === 'false') return null;
  if (isStandalone() || dismissed) return null;
  if (!allowInstallContext()) return null;

  const showChromium = deferred != null;
  const showIos = iosHint && !showChromium;

  if (!showChromium && !showIos) return null;

  return (
    <div
      className={`fixed left-0 right-0 z-[95] px-3 pointer-events-none ${
        mobileTabBar
          ? 'max-md:bottom-[9.5rem] md:bottom-[5.5rem]'
          : 'bottom-[5.25rem] sm:bottom-[5.5rem]'
      }`}
      role="region"
      aria-label="Instalar aplicación"
    >
      <div className="pointer-events-auto max-w-lg mx-auto rounded-xl border border-dark-600 bg-dark-800/95 backdrop-blur-sm shadow-xl text-sm text-dark-100">
        <div className="flex items-start gap-3 p-3 sm:p-4">
          {showChromium ? (
            <Download className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" aria-hidden />
          ) : (
            <Share2 className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" aria-hidden />
          )}
          <div className="flex-1 min-w-0 space-y-2">
            {showChromium ? (
              <>
                <p className="text-white font-medium">Instalar Paulino Finance</p>
                <p className="text-dark-400 text-xs sm:text-sm">
                  Accede más rápido desde tu pantalla de inicio, como una app.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onInstall}
                    className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium text-sm"
                  >
                    Instalar
                  </button>
                  <button
                    type="button"
                    onClick={dismiss}
                    className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 text-sm"
                  >
                    Ahora no
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-white font-medium">Añadir a pantalla de inicio</p>
                <p className="text-dark-400 text-xs sm:text-sm">
                  En Safari: pulsa el botón <strong className="text-dark-300">Compartir</strong> y elige{' '}
                  <strong className="text-dark-300">Añadir a pantalla de inicio</strong>.
                </p>
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700 text-sm mt-1"
                >
                  Entendido
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-dark-400 hover:text-white hover:bg-dark-700"
            aria-label="Cerrar aviso de instalación"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallAppPrompt;
