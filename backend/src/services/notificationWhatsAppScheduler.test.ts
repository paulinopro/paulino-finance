const mockQuery = jest.fn();
const mockTelegram = jest.fn();
const mockWhatsApp = jest.fn();
const mockPush = jest.fn();
const mockGetTemplate = jest.fn();
const mockGetUserCurrencyPair = jest.fn();

jest.mock('../config/database', () => ({ query: mockQuery }));
jest.mock('./telegramService', () => ({
  initializeTelegramBot: jest.fn(),
  sendTelegramMessage: mockTelegram,
}));
jest.mock('./openWaService', () => ({ sendWhatsAppMessage: mockWhatsApp }));
jest.mock('./webPushService', () => ({ sendPushForNotification: mockPush }));
jest.mock('./templateService', () => ({
  getTemplate: mockGetTemplate,
  renderTemplate: (template: string, variables: Record<string, unknown>) =>
    template.replace(/\{([^{}]+)\}/g, (_match, key: string) => String(variables[key] ?? '')),
}));
jest.mock('../utils/userCurrencyPair', () => ({ getUserCurrencyPair: mockGetUserCurrencyPair }));

const notificationService = require('./notificationService') as {
  checkAndSendNotifications?: () => Promise<void>;
  getNotificationSchedulerStatus: () => { lastSweep: { ok: boolean } | null };
};

type ReminderType = 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE';

function arrangeSweep(options: {
  type?: ReminderType;
  whatsappEnabled?: boolean;
  verified?: boolean;
  consent?: boolean;
  phone?: boolean;
  telegramEnabled?: boolean;
  notificationId?: number | null;
} = {}) {
  const type = options.type ?? 'CARD_PAYMENT';
  const fakeNow = type === 'LOAN_PAYMENT'
    ? new Date('2026-08-29T12:00:00.000Z')
    : new Date('2026-08-09T12:00:00.000Z');
  jest.useFakeTimers().setSystemTime(fakeNow);

  const user = {
    id: 41,
    telegram_chat_id: 'tg-41',
    locale_preference: 'es',
    whatsapp_phone: options.phone === false ? null : '18095551234',
    whatsapp_consent_at: options.consent === false ? null : new Date('2026-08-01T10:00:00.000Z'),
    whatsapp_verified_at: options.verified === false ? null : new Date('2026-08-01T10:05:00.000Z'),
  };
  const setting = {
    notification_type: type,
    days_before: type === 'LOAN_PAYMENT' ? [3] : [0],
    telegram_enabled: options.telegramEnabled ?? true,
    whatsapp_enabled: options.whatsappEnabled ?? true,
  };

  mockQuery.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql.includes('SELECT DISTINCT u.id')) return { rows: [user] };
    if (sql.includes('FROM notification_settings')) return { rows: [setting] };
    if (sql.includes('FROM credit_cards')) {
      return { rows: [{
        id: 11,
        bank_name: 'Banco Uno',
        card_name: 'Principal',
        currency_type: 'DOP',
        current_debt_dop: 1250,
        current_debt_usd: 0,
        credit_limit_dop: 5000,
        minimum_payment_dop: 250,
        cut_off_day: 1,
        payment_due_day: 9,
      }] };
    }
    if (sql.includes('FROM loans')) {
      return { rows: [{
        id: 12,
        loan_name: 'Vehículo',
        installment_amount: 3000,
        paid_installments: 2,
        total_installments: 24,
        currency: 'DOP',
      }] };
    }
    if (sql.includes('FROM expenses')) {
      return { rows: [{
        id: 13,
        description: 'Internet',
        amount: '2200',
        currency: 'DOP',
        payment_day: 9,
        last_paid_month: null,
        last_paid_year: null,
        nature: 'fixed',
        category: 'Servicios',
        frequency: 'monthly',
        recurrence_type: 'recurrent',
      }] };
    }
    if (sql.includes('INSERT INTO notifications')) {
      const id = options.notificationId === undefined ? 73 : options.notificationId;
      return { rows: [{ id }] };
    }
    throw new Error(`Unexpected scheduler query: ${sql}`);
  });
}

async function runSweep(): Promise<void> {
  if (!notificationService.checkAndSendNotifications) {
    throw new Error('checkAndSendNotifications is not exported');
  }
  await notificationService.checkAndSendNotifications();
}

describe('WhatsApp notification scheduler integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    mockTelegram.mockResolvedValue(true);
    mockWhatsApp.mockResolvedValue({ ok: true, providerMessageId: 'wa-73' });
    mockPush.mockResolvedValue(undefined);
    mockGetTemplate.mockResolvedValue(null);
    mockGetUserCurrencyPair.mockResolvedValue({ primary: 'DOP', secondary: 'USD' });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('selects all WhatsApp eligibility and per-type setting fields', async () => {
    arrangeSweep();

    await runSweep();

    const emittedSql = mockQuery.mock.calls.map(([sql]) => String(sql)).join('\n');
    expect(emittedSql).toContain('u.whatsapp_phone');
    expect(emittedSql).toContain('u.whatsapp_consent_at');
    expect(emittedSql).toContain('u.whatsapp_verified_at');
    expect(emittedSql).toContain('ns.whatsapp_enabled');
  });

  it.each([
    ['disabled in the notification setting', { whatsappEnabled: false, verified: true }],
    ['not verified by a successful test', { whatsappEnabled: true, verified: false }],
    ['missing explicit consent', { whatsappEnabled: true, verified: true, consent: false }],
    ['missing a destination phone', { whatsappEnabled: true, verified: true, phone: false }],
  ])('does not deliver WhatsApp when it is %s', async (_label, eligibility) => {
    arrangeSweep({ ...eligibility, telegramEnabled: false });

    await runSweep();

    expect(mockWhatsApp).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('delivers verified WhatsApp and Telegram together', async () => {
    arrangeSweep();

    await runSweep();

    expect(mockTelegram).toHaveBeenCalledTimes(1);
    expect(mockWhatsApp).toHaveBeenCalledWith('18095551234', expect.any(String));
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it('keeps the scheduler sweep successful when OpenWA returns a failure', async () => {
    arrangeSweep();
    mockWhatsApp.mockResolvedValue({
      ok: false,
      code: 'SESSION_UNAVAILABLE',
      message: 'OpenWA session is unavailable',
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await runSweep();

    expect(notificationService.getNotificationSchedulerStatus().lastSweep?.ok).toBe(true);
    expect(mockTelegram).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it.each<ReminderType>(['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'])(
    'dispatches all enabled channels for the %s branch after creating the in-app notification',
    async (type) => {
      arrangeSweep({ type });

      await runSweep();

      const insertOrder = mockQuery.mock.invocationCallOrder.find((_order, index) =>
        String(mockQuery.mock.calls[index][0]).includes('INSERT INTO notifications')
      );
      expect(insertOrder).toBeDefined();
      expect(mockTelegram.mock.invocationCallOrder[0]).toBeGreaterThan(insertOrder!);
      expect(mockWhatsApp.mock.invocationCallOrder[0]).toBeGreaterThan(insertOrder!);
      expect(mockPush.mock.invocationCallOrder[0]).toBeGreaterThan(insertOrder!);
    }
  );
  it.each<ReminderType>(['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'])(
    'marks the sweep failed instead of silently losing %s channels when INSERT returns no id',
    async (type) => {
      arrangeSweep({ type, notificationId: null });
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

      await runSweep();

      expect(notificationService.getNotificationSchedulerStatus().lastSweep?.ok).toBe(false);
      expect(mockTelegram).not.toHaveBeenCalled();
      expect(mockWhatsApp).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      const logText = errorSpy.mock.calls.map((args) => JSON.stringify(args)).join('\n');
      expect(logText).toContain('NOTIFICATION_ID_MISSING');
      expect(logText).toContain(type);
    }
  );
});
