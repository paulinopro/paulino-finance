export function normalizeWhatsAppPhone(value: unknown): string | null {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) throw new Error('Invalid WhatsApp phone number');
  if (!/^\+?[\d\s-]+$/.test(raw)) throw new Error('Invalid WhatsApp phone number');
  const normalized = raw.replace(/^\+/, '').replace(/[\s-]/g, '');
  if (!/^[1-9]\d{7,14}$/.test(normalized)) throw new Error('Invalid WhatsApp phone number');
  return normalized;
}

export function maskWhatsAppPhone(phone: string): string {
  return `${'*'.repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;
}

export function toOpenWaChatId(phone: string): string {
  return `${phone}@c.us`;
}
