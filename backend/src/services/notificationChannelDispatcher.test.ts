const mockTelegram = jest.fn();
const mockWhatsApp = jest.fn();
const mockPush = jest.fn();

jest.mock('./telegramService', () => ({
  sendTelegramMessage: mockTelegram,
}));

jest.mock('./openWaService', () => ({
  sendWhatsAppMessage: mockWhatsApp,
}));

jest.mock('./webPushService', () => ({
  sendPushForNotification: mockPush,
}));

import { dispatchNotificationChannels } from './notificationChannelDispatcher';

const inputWithAllChannels = {
  userId: 41,
  notificationId: 73,
  title: 'Pago pendiente',
  message: '<b>Recordatorio</b>',
  telegram: { enabled: true, chatId: 'telegram-secret-destination' },
  whatsapp: { enabled: true, phone: '18095551234' },
  pushEnabled: true,
};

describe('dispatchNotificationChannels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTelegram.mockResolvedValue(true);
    mockWhatsApp.mockResolvedValue({ ok: true, providerMessageId: 'provider-id' });
    mockPush.mockResolvedValue(undefined);
  });

  it('continues WhatsApp and Push when Telegram fails', async () => {
    mockTelegram.mockResolvedValue(false);
    mockPush.mockRejectedValue(new Error('push unavailable'));

    await expect(dispatchNotificationChannels(inputWithAllChannels)).resolves.toEqual(
      expect.arrayContaining([
        { channel: 'TELEGRAM', ok: false, errorCode: 'SEND_FAILED' },
        { channel: 'WHATSAPP', ok: true },
        { channel: 'PUSH', ok: false, errorCode: 'SEND_FAILED' },
      ])
    );

    expect(mockWhatsApp).toHaveBeenCalledWith('18095551234', '<b>Recordatorio</b>');
  });

  it('continues Telegram and Push when OpenWA fails without exposing destinations in logs', async () => {
    mockWhatsApp.mockResolvedValue({
      ok: false,
      code: 'SESSION_UNAVAILABLE',
      message: 'OpenWA session is unavailable',
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await dispatchNotificationChannels(inputWithAllChannels);

    expect(result).toEqual(expect.arrayContaining([
      { channel: 'TELEGRAM', ok: true },
      { channel: 'WHATSAPP', ok: false, errorCode: 'SESSION_UNAVAILABLE' },
      { channel: 'PUSH', ok: true },
    ]));
    const logText = errorSpy.mock.calls.map((args) => JSON.stringify(args)).join('\n');
    expect(logText).toContain('WHATSAPP');
    expect(logText).toContain('41');
    expect(logText).toContain('73');
    expect(logText).toContain('SESSION_UNAVAILABLE');
    expect(logText).not.toContain('18095551234');
    expect(logText).not.toContain('telegram-secret-destination');
    errorSpy.mockRestore();
  });

  it('does not call disabled channels', async () => {
    const result = await dispatchNotificationChannels({
      ...inputWithAllChannels,
      telegram: { enabled: false, chatId: 'telegram-secret-destination' },
      whatsapp: { enabled: false, phone: '18095551234' },
      pushEnabled: false,
    });

    expect(result).toEqual([]);
    expect(mockTelegram).not.toHaveBeenCalled();
    expect(mockWhatsApp).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('skips an enabled channel whose destination is absent', async () => {
    const result = await dispatchNotificationChannels({
      ...inputWithAllChannels,
      telegram: { enabled: true, chatId: null },
      whatsapp: { enabled: true, phone: null },
      pushEnabled: false,
    });

    expect(result).toEqual([]);
    expect(mockTelegram).not.toHaveBeenCalled();
    expect(mockWhatsApp).not.toHaveBeenCalled();
  });
});
