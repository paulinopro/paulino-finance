import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.join(__dirname, 'Settings.tsx'), 'utf8');

describe('Settings notification channels integration', () => {
  it('uses the canonical channel test routes', () => {
    expect(source).toContain("api.post('/notifications/test/telegram')");
    expect(source).toContain("api.post<{ success?: boolean; message?: string }>('/notifications/test/push')");
    expect(source).not.toContain("api.post('/notifications/test')");
    expect(source).not.toContain("api.post<{ success?: boolean; message?: string }>('/notifications/push/test')");
  });

  it('embeds WhatsApp configuration and gates per-type toggles on verification', () => {
    expect(source).toContain('<WhatsAppNotificationSettings onConfigurationChange={handleWhatsAppConfigurationChange} />');
    expect(source).toContain('reconcileWhatsAppVerification(current, configuration.verified)');
    expect(source).toContain('void fetchNotificationSettings();');
    expect(source).toContain('whatsappEnabled: false');
    expect(source).toContain('checked={whatsappVerified ? settings.whatsappEnabled : false}');
    expect(source).toContain('disabled={!whatsappVerified}');
    expect(source).toContain("t('settings.whatsappTogglePrerequisite')");
    expect(source).toContain("aria-label={t('settings.whatsappToggleForType', { type: typeLabel })}");
  });

  it('keeps the complete WhatsApp copy equivalent across all supported locales', () => {
    const localeDirectory = path.join(__dirname, '..', 'i18n', 'locales');
    const localeKeys = ['es', 'en', 'de'].map((locale) => {
      const values = JSON.parse(fs.readFileSync(path.join(localeDirectory, locale, 'settings.json'), 'utf8'));
      return Object.keys(values).filter((key) => key.startsWith('whatsapp')).sort();
    });

    expect(localeKeys[0]).toEqual(localeKeys[1]);
    expect(localeKeys[1]).toEqual(localeKeys[2]);
    for (const locale of ['es', 'en', 'de']) {
      const values = JSON.parse(fs.readFileSync(path.join(localeDirectory, locale, 'settings.json'), 'utf8'));
      expect(values.whatsappToggleForType).toContain('{{type}}');
    }
    expect(localeKeys[0]).toEqual(expect.arrayContaining([
      'whatsappConsent',
      'whatsappLoadError',
      'whatsappPhoneHint',
      'whatsappRefreshError',
      'whatsappStatePending',
      'whatsappStateVerified',
      'whatsappTestError',
      'whatsappToggleForType',
      'whatsappToggleLabel',
      'whatsappTogglePrerequisite',
      'whatsappWithdrawConfirm',
    ]));
  });
});
