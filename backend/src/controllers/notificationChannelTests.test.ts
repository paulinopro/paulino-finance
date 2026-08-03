jest.mock('../config/database', () => ({
  query: jest.fn(),
}));

jest.mock('../services/webPushService', () => ({
  getVapidPublicKey: jest.fn(),
  sendPushForNotification: jest.fn(),
  isWebPushConfigured: jest.fn(),
}));

jest.mock('./whatsappNotificationController', () => ({
  getWhatsAppConfiguration: jest.fn(),
  testWhatsAppNotification: jest.fn(),
  updateWhatsAppConfiguration: jest.fn(),
}));

import { query } from '../config/database';
import {
  getNotificationSettings,
  testPushNotification,
  testTelegramNotification,
  updateNotificationSettings,
} from './notificationController';
import { testWhatsAppNotification } from './whatsappNotificationController';
import router from '../routes/notifications';

const mockQuery = query as jest.MockedFunction<typeof query>;

function req(body: Record<string, unknown> = {}) {
  return { userId: 9, body } as any;
}

function responseDouble() {
  const state = { status: 200, body: undefined as any };
  const res: any = {
    status: jest.fn((code: number) => {
      state.status = code;
      return res;
    }),
    json: jest.fn((body: any) => {
      state.body = body;
      return res;
    }),
  };
  return { res, state };
}

function routeHandler(path: string) {
  const layer = (router as any).stack.find((item: any) => item.route?.path === path);
  return layer?.route?.stack.find((item: any) => item.method === 'post')?.handle;
}

describe('notification channel settings and test routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps whatsapp_enabled in notification settings', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        notification_type: 'PAYMENT_DUE',
        enabled: true,
        days_before: [3, 7],
        telegram_enabled: false,
        email_enabled: true,
        whatsapp_enabled: true,
      }],
    } as any);
    const { res, state } = responseDouble();

    await getNotificationSettings(req(), res);

    expect(state.body.settings.PAYMENT_DUE).toEqual({
      enabled: true,
      daysBefore: [3, 7],
      telegramEnabled: false,
      emailEnabled: true,
      whatsappEnabled: true,
    });
    expect(mockQuery.mock.calls[0][0]).toContain('whatsapp_enabled');
  });

  it('rejects enabling WhatsApp without consent and verification', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ whatsapp_phone: '18095551234', whatsapp_consent_at: null, whatsapp_verified_at: null }],
    } as any);
    const { res } = responseDouble();

    await updateNotificationSettings(req({ notificationType: 'PAYMENT_DUE', whatsappEnabled: true }), res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('allows WhatsApp only after phone, consent, and verification are present', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          whatsapp_phone: '18095551234',
          whatsapp_consent_at: new Date('2026-08-02T18:00:00.000Z'),
          whatsapp_verified_at: new Date('2026-08-02T19:00:00.000Z'),
        }],
      } as any)
      .mockResolvedValueOnce({ rows: [] } as any);
    const { res } = responseDouble();

    await updateNotificationSettings(req({ notificationType: 'PAYMENT_DUE', whatsappEnabled: true }), res);

    expect(mockQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE id = $1'),
      [9]
    );
    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('whatsapp_enabled'),
      [9, 'PAYMENT_DUE', true, [3, 7], false, false, true]
    );
    expect(res.status).not.toHaveBeenCalled();
  });
  it('writes whatsapp_enabled while preserving the Telegram and email values supplied', async () => {
    mockQuery.mockResolvedValue({ rows: [] } as any);
    const { res } = responseDouble();

    await updateNotificationSettings(req({
      notificationType: 'PAYMENT_DUE',
      enabled: false,
      daysBefore: [1],
      telegramEnabled: true,
      emailEnabled: true,
      whatsappEnabled: false,
    }), res);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('whatsapp_enabled'),
      [9, 'PAYMENT_DUE', false, [1], true, true, false]
    );
  });

  it('registers distinct canonical test routes while retaining legacy aliases', () => {
    expect(routeHandler('/test/telegram')).toBe(testTelegramNotification);
    expect(routeHandler('/test')).toBe(testTelegramNotification);
    expect(routeHandler('/test/whatsapp')).toBe(testWhatsAppNotification);
    expect(routeHandler('/test/push')).toBe(testPushNotification);
    expect(routeHandler('/push/test')).toBe(testPushNotification);
    expect(testTelegramNotification).not.toBe(testWhatsAppNotification);
    expect(testTelegramNotification).not.toBe(testPushNotification);
    expect(testWhatsAppNotification).not.toBe(testPushNotification);
  });
});
