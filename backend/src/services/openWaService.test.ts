import {
  formatMessageForWhatsApp,
  isOpenWaConfigured,
  sendWhatsAppMessage,
} from './openWaService';

const originalEnv = { ...process.env };

function configureOpenWa(): void {
  process.env.OPENWA_ENABLED = 'true';
  process.env.OPENWA_BASE_URL = 'http://openwa:2785/api';
  process.env.OPENWA_API_KEY = 'secret';
  process.env.OPENWA_SESSION_ID = '123e4567-e89b-12d3-a456-426614174000';
}

describe('OpenWA HTTP adapter', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENWA_ENABLED;
    delete process.env.OPENWA_BASE_URL;
    delete process.env.OPENWA_API_KEY;
    delete process.env.OPENWA_SESSION_ID;
    delete process.env.OPENWA_REQUEST_TIMEOUT_MS;
    jest.restoreAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('recognizes a complete enabled configuration', () => {
    expect(isOpenWaConfigured()).toBe(false);
    configureOpenWa();
    expect(isOpenWaConfigured()).toBe(true);
  });

  it.each(['paulino-finance-central', 'replace-with-generated-session-uuid'])('rejects non-UUID session identifier %s', (sessionId) => {
    configureOpenWa();
    process.env.OPENWA_SESSION_ID = sessionId;

    expect(isOpenWaConfigured()).toBe(false);
  });
  it('formats supported HTML for WhatsApp', () => {
    expect(formatMessageForWhatsApp('<p><strong>Pago &amp; saldo</strong></p><p>Hoy<br>Listo &nbsp; &#39;ok&#39;</p><em>extra</em>')).toBe('*Pago & saldo*\nHoy\nListo \'ok\'\nextra');
  });

  it('converts supported HTML before sending', async () => {
    configureOpenWa();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'wamid-1' } }),
    }) as jest.Mock;

    await expect(sendWhatsAppMessage('18095551234', '<b>Pago</b><br>Hoy')).resolves.toEqual({
      ok: true,
      providerMessageId: 'wamid-1',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://openwa:2785/api/sessions/123e4567-e89b-12d3-a456-426614174000/messages/send-text',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-API-Key': 'secret' }),
        body: JSON.stringify({ chatId: '18095551234@c.us', text: '*Pago*\nHoy' }),
      })
    );
  });

  it.each([401, 404, 503])('returns an explicit provider error for HTTP %s', async (status) => {
    configureOpenWa();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status, text: async () => 'provider error' }) as jest.Mock;

    await expect(sendWhatsAppMessage('18095551234', 'test')).resolves.toMatchObject({ ok: false });
  });

  it('does not send when configuration is missing', async () => {
    global.fetch = jest.fn() as jest.Mock;

    await expect(sendWhatsAppMessage('18095551234', 'test')).resolves.toEqual({
      ok: false,
      code: 'NOT_CONFIGURED',
      message: 'OpenWA is not configured',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns a provider error when a successful response has no message id', async () => {
    configureOpenWa();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data: {} }) }) as jest.Mock;

    await expect(sendWhatsAppMessage('18095551234', 'test')).resolves.toEqual({
      ok: false,
      code: 'PROVIDER_ERROR',
      message: 'OpenWA returned an invalid response',
    });
  });

  it('returns a timeout error when fetch is aborted', async () => {
    configureOpenWa();
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValue(abortError) as jest.Mock;

    await expect(sendWhatsAppMessage('18095551234', 'test')).resolves.toEqual({
      ok: false,
      code: 'TIMEOUT',
      message: 'OpenWA request timed out',
    });
  });

  it('uses OPENWA_REQUEST_TIMEOUT_MS to abort a slow provider request', async () => {
    jest.useFakeTimers();
    configureOpenWa();
    process.env.OPENWA_REQUEST_TIMEOUT_MS = '1500';
    let capturedSignal: AbortSignal | undefined;
    global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
      capturedSignal = (options as RequestInit).signal as AbortSignal;
      capturedSignal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })) as jest.Mock;

    const resultPromise = sendWhatsAppMessage('18095551234', 'test');
    jest.advanceTimersByTime(1499);
    expect(capturedSignal?.aborted).toBe(false);
    jest.advanceTimersByTime(1);

    await expect(resultPromise).resolves.toEqual({
      ok: false,
      code: 'TIMEOUT',
      message: 'OpenWA request timed out',
    });
  });

  it.each(['invalid', '999', '60001'])('falls back to 10000 ms for out-of-range timeout %s', async (configuredTimeout) => {
    jest.useFakeTimers();
    configureOpenWa();
    process.env.OPENWA_REQUEST_TIMEOUT_MS = configuredTimeout;
    let capturedSignal: AbortSignal | undefined;
    global.fetch = jest.fn((_url, options) => new Promise((_resolve, reject) => {
      capturedSignal = (options as RequestInit).signal as AbortSignal;
      capturedSignal.addEventListener('abort', () => {
        const error = new Error('The operation was aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })) as jest.Mock;

    const resultPromise = sendWhatsAppMessage('18095551234', 'test');
    jest.advanceTimersByTime(9999);
    expect(capturedSignal?.aborted).toBe(false);
    jest.advanceTimersByTime(1);

    await expect(resultPromise).resolves.toMatchObject({ ok: false, code: 'TIMEOUT' });
  });
  it('masks the recipient phone in logged provider errors', async () => {
    configureOpenWa();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'provider error' }) as jest.Mock;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await sendWhatsAppMessage('18095551234', 'test');

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('*******1234'));
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('18095551234'));
  });
});
