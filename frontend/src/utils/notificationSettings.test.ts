import { describe, expect, it } from '@jest/globals';
import { reconcileWhatsAppVerification, type NotificationSettingsByType } from './notificationSettings';

describe('WhatsApp notification settings reconciliation', () => {
  it('does not reactivate stored preferences after verification is lost and later restored', () => {
    const initiallyEnabled: NotificationSettingsByType = {
      CARD_PAYMENT: {
        enabled: true,
        telegramEnabled: true,
        whatsappEnabled: true,
        daysBefore: [3, 7],
      },
    };

    const afterPhoneChange = reconcileWhatsAppVerification(initiallyEnabled, false);
    expect(afterPhoneChange.CARD_PAYMENT.whatsappEnabled).toBe(false);
    expect(initiallyEnabled.CARD_PAYMENT.whatsappEnabled).toBe(true);

    const afterReverification = reconcileWhatsAppVerification(afterPhoneChange, true);
    expect(afterReverification.CARD_PAYMENT.whatsappEnabled).toBe(false);
    expect(afterReverification.CARD_PAYMENT.telegramEnabled).toBe(true);
  });

  it('clears every reminder type when consent is withdrawn', () => {
    const settings: NotificationSettingsByType = Object.fromEntries(
      ['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'].map((type) => [
        type,
        { enabled: true, telegramEnabled: false, whatsappEnabled: true, daysBefore: [3] },
      ])
    );

    const reconciled = reconcileWhatsAppVerification(settings, false);

    expect(Object.values(reconciled).every((value) => value.whatsappEnabled === false)).toBe(true);
  });
});
