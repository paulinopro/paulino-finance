/**
 * Formato de notificaciones **en la app** (historial, campana, push local).
 * Las plantillas de Telegram usan HTML `<b>Etiqueta:</b> valor`; aquí derivamos
 * filas legibles sin repetir el título del encabezado.
 */

export function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function stripTelegramBannerLine(message: string): string {
  const lines = message.split('\n');
  if (lines.length === 0) return message;
  const first = lines[0].trim();
  if (/^🔔[\s\S]*🔔$/.test(first)) {
    return lines.slice(1).join('\n').replace(/^\n+/, '');
  }
  return message;
}

export function stripLeadingTitleDuplicate(title: string, message: string): string {
  const t = title.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!t) return message;
  const lines = message.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length) return message;
  const plain = lines[i]
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (plain !== t) return message;
  const rest = [...lines.slice(0, i), ...lines.slice(i + 1)].join('\n');
  return rest.replace(/^\n+/, '');
}

export function prepareSystemNotificationBody(title: string, message: string): string {
  let m = stripTelegramBannerLine(message);
  m = stripLeadingTitleDuplicate(title, m);
  return m;
}

export type StructuredNotificationRow = { label: string; value: string };

/**
 * Convierte líneas tipo `<b>Etiqueta:</b> valor` en filas; el resto va a líneas sueltas.
 */
export function parseStructuredNotificationRows(body: string): {
  rows: StructuredNotificationRow[];
  unparseableLines: string[];
} {
  const rows: StructuredNotificationRow[] = [];
  const unparseableLines: string[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^<(?:b|strong)>([^<]+)<\/(?:b|strong)>\s*(.*)$/i);
    if (m) {
      const rawLabel = m[1].trim();
      const label = rawLabel.replace(/:\s*$/, '').trim() || rawLabel;
      const valueRaw = m[2].trim();
      const value = stripHtmlTags(valueRaw) || '—';
      rows.push({ label, value });
      continue;
    }
    unparseableLines.push(t);
  }
  return { rows, unparseableLines };
}

const PUSH_BODY_MAX = 220;

/** Texto plano para Notification API / push (sin HTML, sin duplicar título). */
export function formatNotificationForPush(title: string, message: string): string {
  const body = prepareSystemNotificationBody(title, message);
  const { rows, unparseableLines } = parseStructuredNotificationRows(body);
  let out = '';
  if (rows.length > 0) {
    out = rows.map((r) => `${r.label}: ${r.value}`).join('\n');
  }
  if (unparseableLines.length > 0) {
    const extra = unparseableLines.map((l) => stripHtmlTags(l)).join('\n');
    out = out ? `${out}\n${extra}` : extra;
  }
  if (!out.trim()) {
    out = stripHtmlTags(body);
  }
  return out.replace(/\n{3,}/g, '\n\n').slice(0, PUSH_BODY_MAX);
}

function isBellTipOrNoteLine(line: string): boolean {
  const t = stripHtmlTags(line).replace(/\s+/g, ' ').trim();
  if (!t) return false;
  return /^💡/.test(t) || /\bAsegúrate\b/i.test(t);
}

function rowLabelKey(rawLabel: string): string {
  return rawLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/:\s*$/, '')
    .trim()
    .toLowerCase();
}

/** Fecha tipo "6 de este mes" usando mes/año de la fecha de creación del aviso */
function recurringPaymentDayPhraseToDdMmYyyy(dayPhrase: string, referenceIso: string): string | null {
  const p = stripHtmlTags(dayPhrase).trim();
  const direct = /^(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})$/.exec(p);
  if (direct) {
    const dd = direct[1].padStart(2, '0');
    const mm = direct[2].padStart(2, '0');
    return `${dd}/${mm}/${direct[3]}`;
  }
  const mEste = /^(\d{1,2})\s+de\s+este\s+mes$/i.exec(p);
  if (!mEste) return null;
  const dayNum = parseInt(mEste[1], 10);
  if (!Number.isFinite(dayNum)) return null;
  const ref = new Date(referenceIso);
  if (!Number.isFinite(ref.getTime())) return null;
  const y = ref.getFullYear();
  const mo = ref.getMonth();
  const dd = dayNum.toString().padStart(2, '0');
  const mm = (mo + 1).toString().padStart(2, '0');
  return `${dd}/${mm}/${y}`;
}

function parsePositiveIntFlexible(v: string): number | undefined {
  const digits = stripHtmlTags(v).match(/\d+/);
  if (!digits) return undefined;
  const n = parseInt(digits[0], 10);
  return Number.isFinite(n) ? n : undefined;
}

function extractRemainingDaysHint(lines: string[]): number | undefined {
  for (const line of lines) {
    const t = stripHtmlTags(line);
    const m = t.match(/Faltan\s+(\d+)/i);
    if (m) return parseInt(m[1], 10);
    const solo = stripHtmlTags(line).trim();
    if (/^\d+$/.test(solo)) {
      const n = parseInt(solo, 10);
      if (Number.isFinite(n) && n < 400) return n;
    }
  }
  return undefined;
}

export type BellRecurringExpensePreviewParts = {
  description: string;
  montoWithCurrency: string;
  paymentDateDdMmYyyy: string;
  daysRemaining: number;
};

/**
 * Preview de campana para gasto recurrente: 3 líneas (descripción · monto+fecha · días).
 * Omitimos tips/notas (p. ej. 💡 …).
 */
export function buildBellRecurringExpensePreview(
  title: string,
  message: string,
  createdAt: string
): BellRecurringExpensePreviewParts | null {
  const body = prepareSystemNotificationBody(title, message);
  const { rows, unparseableLines } = parseStructuredNotificationRows(body);
  const filteredUnparseable = unparseableLines.filter((l) => !isBellTipOrNoteLine(l));

  const map = new Map<string, string>();
  for (const r of rows) {
    map.set(rowLabelKey(r.label), (r.value || '').trim());
  }

  const description = stripHtmlTags(map.get('descripcion') || '').trim();
  const montoWithCurrency = stripHtmlTags(map.get('monto') || '')
    .replace(/\s+/g, ' ')
    .trim();

  const paymentRaw = map.get('fecha de pago') || '';
  const paymentDdMmYy = recurringPaymentDayPhraseToDdMmYyyy(paymentRaw, createdAt);
  const paymentFormatted = (paymentDdMmYy ?? stripHtmlTags(paymentRaw).trim()) || '';

  let daysRemaining =
    parsePositiveIntFlexible(map.get('dias restantes') || '') ??
    parsePositiveIntFlexible(map.get('días restantes') || '') ??
    extractRemainingDaysHint(filteredUnparseable);

  if (!description || !montoWithCurrency || !paymentFormatted || daysRemaining === undefined) return null;

  return {
    description,
    montoWithCurrency,
    paymentDateDdMmYyyy: paymentFormatted,
    daysRemaining,
  };
}

const BELL_PREVIEW_MAX = 520;

/** Texto corrido para el panel del campanario (no rejilla tipo plantilla; pensado para ~288px de ancho). */
export function notificationBellPreview(title: string, message: string): string {
  const body = prepareSystemNotificationBody(title, message);
  const { rows, unparseableLines } = parseStructuredNotificationRows(body);
  const segments: string[] = [];
  for (const r of rows) {
    const v = r.value.trim() || '—';
    segments.push(`${r.label.trim()}: ${v}`);
  }
  for (const line of unparseableLines) {
    if (isBellTipOrNoteLine(line)) continue;
    const plain = stripHtmlTags(line).replace(/\s+/g, ' ').trim();
    if (plain) segments.push(plain);
  }
  let out =
    segments.length > 0
      ? segments.join(' · ')
      : stripHtmlTags(body).replace(/\s+/g, ' ').trim();
  out = out.replace(/\s*[·.]+\s*$/g, '').trim();
  if (out.length > BELL_PREVIEW_MAX) {
    out = `${out.slice(0, BELL_PREVIEW_MAX - 1)}…`;
  }
  return out;
}
