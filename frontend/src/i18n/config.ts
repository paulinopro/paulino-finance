import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import navES from './locales/es/nav.json';
import navEN from './locales/en/nav.json';
import navDE from './locales/de/nav.json';
import layoutES from './locales/es/layout.json';
import layoutEN from './locales/en/layout.json';
import layoutDE from './locales/de/layout.json';
import authES from './locales/es/auth.json';
import authEN from './locales/en/auth.json';
import authDE from './locales/de/auth.json';
import settingsES from './locales/es/settings.json';
import settingsEN from './locales/en/settings.json';
import settingsDE from './locales/de/settings.json';
import pushES from './locales/es/push.json';
import pushEN from './locales/en/push.json';
import pushDE from './locales/de/push.json';
import commonES from './locales/es/common.json';
import commonEN from './locales/en/common.json';
import commonDE from './locales/de/common.json';
import notifTypesES from './locales/es/notifTypes.json';
import notifTypesEN from './locales/en/notifTypes.json';
import notifTypesDE from './locales/de/notifTypes.json';
import tzES from './locales/es/tz.json';
import tzEN from './locales/en/tz.json';
import tzDE from './locales/de/tz.json';
import notifBellES from './locales/es/notifBell.json';
import notifBellEN from './locales/en/notifBell.json';
import notifBellDE from './locales/de/notifBell.json';
import currencyES from './locales/es/currency.json';
import currencyEN from './locales/en/currency.json';
import currencyDE from './locales/de/currency.json';
import toastES from './locales/es/toast.json';
import toastEN from './locales/en/toast.json';
import toastDE from './locales/de/toast.json';
import confirmES from './locales/es/confirm.json';
import confirmEN from './locales/en/confirm.json';
import confirmDE from './locales/de/confirm.json';
import pagesES from './locales/es/pages.json';
import pagesEN from './locales/en/pages.json';
import pagesDE from './locales/de/pages.json';
import reportsES from './locales/es/reports.json';
import reportsEN from './locales/en/reports.json';
import reportsDE from './locales/de/reports.json';
import templatesES from './locales/es/templates.json';
import templatesEN from './locales/en/templates.json';
import templatesDE from './locales/de/templates.json';

function preferredLanguage(): string {
  if (typeof window === 'undefined') return 'es';
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return 'es';
    const u = JSON.parse(raw) as { localePreference?: string };
    const l = u.localePreference;
    return l === 'en' || l === 'de' ? l : 'es';
  } catch {
    return 'es';
  }
}

void i18next.use(initReactI18next).init({
  resources: {
    es: {
      translation: {
        nav: navES,
        layout: layoutES,
        auth: authES,
        settings: settingsES,
        push: pushES,
        common: commonES,
        notifTypes: notifTypesES,
        notifBell: notifBellES,
        tz: tzES,
        currency: currencyES,
        toast: toastES,
        confirm: confirmES,
        pages: pagesES,
        reports: reportsES,
        templates: templatesES,
      },
    },
    en: {
      translation: {
        nav: navEN,
        layout: layoutEN,
        auth: authEN,
        settings: settingsEN,
        push: pushEN,
        common: commonEN,
        notifTypes: notifTypesEN,
        notifBell: notifBellEN,
        tz: tzEN,
        currency: currencyEN,
        toast: toastEN,
        confirm: confirmEN,
        pages: pagesEN,
        reports: reportsEN,
        templates: templatesEN,
      },
    },
    de: {
      translation: {
        nav: navDE,
        layout: layoutDE,
        auth: authDE,
        settings: settingsDE,
        push: pushDE,
        common: commonDE,
        notifTypes: notifTypesDE,
        notifBell: notifBellDE,
        tz: tzDE,
        currency: currencyDE,
        toast: toastDE,
        confirm: confirmDE,
        pages: pagesDE,
        reports: reportsDE,
        templates: templatesDE,
      },
    },
  },
  lng: preferredLanguage(),
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
});

export default i18next;

export function tzI18nKey(zone: string): string {
  return `tz.${zone.replace(/\//g, '_')}`;
}

export function pushFailureI18nKey(reason?: string): string {
  type PushKey = keyof typeof pushES;
  const map: Record<string, PushKey> = {
    dev: 'dev',
    'pwa-disabled': 'pwaDisabled',
    unsupported: 'unsupported',
    'no-permission': 'noPermission',
    'no-vapid': 'noVapid',
    'no-sw-timeout': 'noSwTimeout',
    error: 'errorSubscribe',
    'no-window': 'fallback',
    'sw-timeout': 'noSwTimeout',
  };
  const k = map[reason ?? ''] ?? 'fallback';
  return `push.${k}`;
}
