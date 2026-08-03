export interface NotificationTypeSettings {
  enabled: boolean;
  telegramEnabled: boolean;
  whatsappEnabled: boolean;
  emailEnabled?: boolean;
  daysBefore: number[];
}

export type NotificationSettingsByType = Record<string, NotificationTypeSettings>;

export function reconcileWhatsAppVerification(
  settings: NotificationSettingsByType,
  verified: boolean
): NotificationSettingsByType {
  if (verified) return settings;

  return Object.fromEntries(
    Object.entries(settings).map(([type, value]) => [
      type,
      value.whatsappEnabled ? { ...value, whatsappEnabled: false } : value,
    ])
  );
}
