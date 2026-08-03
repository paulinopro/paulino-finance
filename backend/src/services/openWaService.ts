import { maskWhatsAppPhone, toOpenWaChatId } from './whatsappPhone';

const REQUEST_TIMEOUT_MS = 10_000;

type OpenWaResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; code: 'NOT_CONFIGURED' | 'TIMEOUT' | 'SESSION_UNAVAILABLE' | 'PROVIDER_ERROR'; message: string };

interface OpenWaConfig {
  baseUrl: string;
  apiKey: string;
  sessionId: string;
}

function getOpenWaConfig(): OpenWaConfig | null {
  const baseUrl = process.env.OPENWA_BASE_URL?.replace(/\/+$/, '');
  const apiKey = process.env.OPENWA_API_KEY;
  const sessionId = process.env.OPENWA_SESSION_ID;

  if (process.env.OPENWA_ENABLED !== 'true' || !baseUrl || !apiKey || !sessionId) return null;

  return { baseUrl, apiKey, sessionId };
}

export function isOpenWaConfigured(): boolean {
  return getOpenWaConfig() !== null;
}

export function formatMessageForWhatsApp(html: string): string {
  return html
    .replace(/<\s*(?:br)\s*\/?>/gi, '\n')
    .replace(/<\/?\s*p\b[^>]*>/gi, '\n')
    .replace(/<\s*(?:b|strong)\b[^>]*>/gi, '*')
    .replace(/<\s*\/\s*(?:b|strong)\s*>/gi, '*')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\r/g, '')
    .replace(/\n[ \t]*/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<OpenWaResult> {
  const config = getOpenWaConfig();
  if (!config) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'OpenWA is not configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const maskedPhone = maskWhatsAppPhone(phone);

  try {
    const response = await fetch(
      `${config.baseUrl}/sessions/${encodeURIComponent(config.sessionId)}/messages/send-text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey,
        },
        body: JSON.stringify({
          chatId: toOpenWaChatId(phone),
          text: formatMessageForWhatsApp(message),
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const code = response.status === 404 ? 'SESSION_UNAVAILABLE' : 'PROVIDER_ERROR';
      console.error(`OpenWA request failed for ${maskedPhone}: HTTP ${response.status}`);
      return {
        ok: false,
        code,
        message: code === 'SESSION_UNAVAILABLE' ? 'OpenWA session is unavailable' : 'OpenWA provider request failed',
      };
    }

    const payload: unknown = await response.json();
    const providerMessageId = (
      payload &&
      typeof payload === 'object' &&
      'data' in payload &&
      payload.data &&
      typeof payload.data === 'object' &&
      'id' in payload.data &&
      typeof payload.data.id === 'string'
    )
      ? payload.data.id
      : undefined;

    if (!providerMessageId) {
      console.error(`OpenWA returned an invalid response for ${maskedPhone}`);
      return { ok: false, code: 'PROVIDER_ERROR', message: 'OpenWA returned an invalid response' };
    }

    return { ok: true, providerMessageId };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`OpenWA request timed out for ${maskedPhone}`);
      return { ok: false, code: 'TIMEOUT', message: 'OpenWA request timed out' };
    }

    console.error(`OpenWA request failed for ${maskedPhone}`);
    return { ok: false, code: 'PROVIDER_ERROR', message: 'OpenWA provider request failed' };
  } finally {
    clearTimeout(timeout);
  }
}
