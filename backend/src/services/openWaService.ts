import { maskWhatsAppPhone, toOpenWaChatId } from './whatsappPhone';

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const MIN_REQUEST_TIMEOUT_MS = 1_000;
const MAX_REQUEST_TIMEOUT_MS = 60_000;
const OPENWA_SESSION_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getRequestTimeoutMs(): number {
  const configured = Number(process.env.OPENWA_REQUEST_TIMEOUT_MS);
  return Number.isInteger(configured) && configured >= MIN_REQUEST_TIMEOUT_MS && configured <= MAX_REQUEST_TIMEOUT_MS
    ? configured
    : DEFAULT_REQUEST_TIMEOUT_MS;
}

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

  if (process.env.OPENWA_ENABLED !== 'true' || !baseUrl || !apiKey || !sessionId || !OPENWA_SESSION_UUID_PATTERN.test(sessionId)) return null;

  return { baseUrl, apiKey, sessionId };
}

export function isOpenWaConfigured(): boolean {
  return getOpenWaConfig() !== null;
}

export function formatMessageForWhatsApp(html: string): string {
  return html
    .replace(/<\s*br\s*(?:\/\s*)?>/gi, '\n')
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

function extractOpenWaMessageId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const extractFromCandidate = (value: unknown): string | undefined => {
    if (Array.isArray(value)) {
      for (const element of value) {
        const nestedId = extractFromCandidate(element);
        if (nestedId) return nestedId;
      }
      return undefined;
    }

    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value === 'number') return String(value);
    if (!value || typeof value !== 'object') return undefined;

    const nested = value as Record<string, unknown>;
    const directId = nested.id ?? nested.messageId ?? nested.message_id;
    if (typeof directId === 'string' || typeof directId === 'number') return String(directId);

    if (directId && typeof directId === 'object' && '_serialized' in directId) {
      const serialized = directId._serialized;
      if (typeof serialized === 'string' || typeof serialized === 'number') return String(serialized);
    }

    if (typeof nested._serialized === 'string' || typeof nested._serialized === 'number') {
      return String(nested._serialized);
    }

    if (typeof nested.id === 'object' && nested.id !== null) {
      const nestedId = nested.id as Record<string, unknown>;
      if (typeof nestedId.id === 'string' || typeof nestedId.id === 'number') return String(nestedId.id);
      if (typeof nestedId._serialized === 'string' || typeof nestedId._serialized === 'number') return String(nestedId._serialized);
    }

    return undefined;
  };

  const record = payload as Record<string, unknown>;

  return (
    extractFromCandidate(record.data) ||
    extractFromCandidate(record.result) ||
    extractFromCandidate(record.message) ||
    extractFromCandidate(record.id) ||
    extractFromCandidate(record.response) ||
    extractFromCandidate(record.payload)
  );
}

function hasExplicitOpenWaError(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  if (Array.isArray(payload)) {
    return payload.some((item) => hasExplicitOpenWaError(item));
  }

  const record = payload as Record<string, unknown>;
  const statusValue = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
  const codeValue = typeof record.code === 'string' ? Number(record.code.trim()) : record.code;

  if (record.success === false || record.ok === false) return true;
  if (record.error || statusValue === 'error' || statusValue === 'failed' || statusValue === 'fail') return true;
  if (typeof record.errors === 'string') return Boolean(record.errors.trim());
  if (Array.isArray(record.errors)) return record.errors.length > 0;
  if (typeof codeValue === 'number' && !Number.isNaN(codeValue) && codeValue >= 400) return true;
  if (typeof record.message === 'string' && record.message.toLowerCase().includes('error')) return true;

  return false;
}

function isOpenWaResponseSuccessful(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;

  if (Array.isArray(payload)) {
    return payload.some((candidate) => isOpenWaResponseSuccessful(candidate));
  }

  const record = payload as Record<string, unknown>;
  const statusValue = typeof record.status === 'string' ? record.status.trim().toLowerCase() : '';
  const codeValue = typeof record.code === 'string' ? Number(record.code.trim()) : record.code;
  const statusCodeValue = typeof record.statusCode === 'string' ? Number(record.statusCode.trim()) : record.statusCode;

  if (record.success === true) return true;
  if (record.ok === true) return true;
  if (typeof statusValue === 'string' && ['success', 'queued', 'sent', 'ok', 'received', 'delivered', 'read'].includes(statusValue)) return true;
  if (typeof codeValue === 'number' && codeValue >= 200 && codeValue < 300) return true;
  if (typeof statusCodeValue === 'number' && statusCodeValue >= 200 && statusCodeValue < 300) return true;

  if (
    isOpenWaResponseSuccessful(record.data) ||
    isOpenWaResponseSuccessful(record.result) ||
    isOpenWaResponseSuccessful(record.message) ||
    isOpenWaResponseSuccessful(record.response) ||
    isOpenWaResponseSuccessful(record.payload)
  ) {
    return true;
  }

  const providerMessageId =
    extractOpenWaMessageId(record.data) ||
    extractOpenWaMessageId(record.result) ||
    extractOpenWaMessageId(record.message) ||
    extractOpenWaMessageId(record.response) ||
    extractOpenWaMessageId(record.payload);
  if (providerMessageId) return true;

  if (hasExplicitOpenWaError(payload)) return false;

  return true;
}

export async function sendWhatsAppMessage(phone: string, message: string): Promise<OpenWaResult> {
  const config = getOpenWaConfig();
  if (!config) {
    return { ok: false, code: 'NOT_CONFIGURED', message: 'OpenWA is not configured' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getRequestTimeoutMs());
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
    const providerMessageId = extractOpenWaMessageId(payload);
    const isSuccessPayload = isOpenWaResponseSuccessful(payload);

    if (!providerMessageId && !isSuccessPayload) {
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
