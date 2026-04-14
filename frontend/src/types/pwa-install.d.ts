/** Evento no estándar de Chromium para instalación de PWA */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
}
