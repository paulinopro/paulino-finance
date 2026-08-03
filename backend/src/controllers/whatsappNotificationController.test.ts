jest.mock('../config/database', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../services/openWaService', () => ({
  sendWhatsAppMessage: jest.fn(),
}));

import { getClient, query } from '../config/database';
import { sendWhatsAppMessage } from '../services/openWaService';
import {
  getWhatsAppConfiguration,
  testWhatsAppNotification,
  updateWhatsAppConfiguration,
} from './whatsappNotificationController';

function responseDouble() {
  const state = { status: 200, body: undefined as any };
  const res: any = {
    status(code: number) {
      state.status = code;
      return res;
    },
    json(body: any) {
      state.body = body;
      return res;
    },
  };
  return { res, state };
}

const userRow = {
  whatsapp_phone: '18095551234',
  whatsapp_consent_at: new Date('2026-08-02T18:00:00.000Z'),
  whatsapp_verified_at: null,
};

describe('WhatsApp notification configuration', () => {
  const getClientMock = getClient as jest.MockedFunction<typeof getClient>;
  const queryMock = query as jest.MockedFunction<typeof query>;
  const sendWhatsAppMessageMock = sendWhatsAppMessage as jest.MockedFunction<typeof sendWhatsAppMessage>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the authenticated user WhatsApp configuration', async () => {
    queryMock.mockResolvedValue({ rows: [userRow] } as any);
    const { res, state } = responseDouble();

    await getWhatsAppConfiguration({ userId: 9 } as any, res);

    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [9]);
    expect(state.body).toEqual({
      success: true,
      whatsapp: {
        phone: '18095551234',
        consented: true,
        verified: false,
        consentedAt: expect.any(String),
        verifiedAt: null,
      },
    });
  });

  it('saves a new normalized phone with server-side consent and clears verification', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...userRow, whatsapp_phone: null, whatsapp_consent_at: null, whatsapp_verified_at: new Date() }] })
      .mockResolvedValueOnce({ rows: [{ ...userRow, whatsapp_verified_at: null }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query: clientQuery, release: jest.fn() } as any;
    getClientMock.mockResolvedValue(client);
    const { res, state } = responseDouble();

    await updateWhatsAppConfiguration(
      { userId: 9, body: { phone: '+1 809-555-1234', consent: true } } as any,
      res
    );

    expect(clientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(clientQuery.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.calls[2][0]).toContain('whatsapp_verified_at = CASE');
    expect(clientQuery.mock.calls[2][1]).toEqual(['18095551234', 9]);
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
    expect(state.body.whatsapp).toMatchObject({
      phone: '18095551234',
      consented: true,
      verified: false,
    });
  });

  it('preserves verification when re-saving the same consented phone', async () => {
    const verifiedAt = new Date('2026-08-02T19:00:00.000Z');
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...userRow, whatsapp_verified_at: verifiedAt }] })
      .mockResolvedValueOnce({ rows: [{ ...userRow, whatsapp_verified_at: verifiedAt }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query: clientQuery, release: jest.fn() } as any;
    getClientMock.mockResolvedValue(client);
    const { res, state } = responseDouble();

    await updateWhatsAppConfiguration(
      { userId: 9, body: { phone: '18095551234', consent: true } } as any,
      res
    );

    expect(clientQuery.mock.calls[2][0]).toContain('whatsapp_phone IS DISTINCT FROM $1');
    expect(state.body.whatsapp.verified).toBe(true);
    expect(state.body.whatsapp.verifiedAt).toBe(verifiedAt.toISOString());
  });

  it('withdraws consent atomically and disables every WhatsApp notification setting', async () => {
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [userRow] })
      .mockResolvedValueOnce({ rows: [{ ...userRow, whatsapp_consent_at: null, whatsapp_verified_at: null }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query: clientQuery, release: jest.fn() } as any;
    getClientMock.mockResolvedValue(client);
    const { res, state } = responseDouble();

    await updateWhatsAppConfiguration(
      { userId: 9, body: { phone: '18095551234', consent: false } } as any,
      res
    );

    expect(clientQuery.mock.calls[2][0]).toContain('whatsapp_consent_at = NULL');
    expect(clientQuery.mock.calls[2][0]).toContain('whatsapp_verified_at = NULL');
    expect(clientQuery.mock.calls[3][0]).toContain('UPDATE notification_settings');
    expect(clientQuery.mock.calls[3][0]).toContain('whatsapp_enabled = FALSE');
    expect(clientQuery.mock.calls[3][1]).toEqual([9]);
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(state.body.whatsapp).toMatchObject({ consented: false, verified: false, consentedAt: null, verifiedAt: null });
  });

  it('does not mark the phone verified when OpenWA rejects the test message', async () => {
    queryMock.mockResolvedValue({ rows: [userRow] } as any);
    sendWhatsAppMessageMock.mockResolvedValue({ ok: false, code: 'PROVIDER_ERROR', message: 'failed' });
    const { res, state } = responseDouble();

    await testWhatsAppNotification({ userId: 9 } as any, res);

    expect(state.status).toBe(502);
    expect(getClientMock).not.toHaveBeenCalled();
  });

  it('marks a successful OpenWA test verified only while the phone still matches', async () => {
    queryMock.mockResolvedValue({ rows: [userRow] } as any);
    sendWhatsAppMessageMock.mockResolvedValue({ ok: true, providerMessageId: 'provider-1' });
    const clientQuery = jest
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [userRow] })
      .mockResolvedValueOnce({ rows: [{ whatsapp_verified_at: new Date('2026-08-02T19:00:00.000Z') }] })
      .mockResolvedValueOnce({ rows: [] });
    const client = { query: clientQuery, release: jest.fn() } as any;
    getClientMock.mockResolvedValue(client);
    const { res, state } = responseDouble();

    await testWhatsAppNotification({ userId: 9 } as any, res);

    expect(clientQuery.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(clientQuery.mock.calls[2][0]).toContain('whatsapp_phone = $2');
    expect(clientQuery.mock.calls[2][1]).toEqual([9, '18095551234']);
    expect(state.status).toBe(200);
    expect(state.body).toEqual({ success: true, message: 'WhatsApp test message sent successfully' });
    expect(clientQuery.mock.calls.at(-1)?.[0]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
