/** Misma lógica que `frontend/src/utils/systemNotificationFormat.ts` (cuerpo plano para Web Push). */

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function stripTelegramBannerLine(message: string): string {
  const lines = message.split('\n');
  if (lines.length === 0) return message;
  const first = lines[0].trim();
  if (/^🔔[\s\S]*🔔$/.test(first)) {
    return lines.slice(1).join('\n').replace(/^\n+/, '');
  }
  return message;
}

function stripLeadingTitleDuplicate(title: string, message: string): string {
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

function prepareSystemNotificationBody(title: string, message: string): string {
  let m = stripTelegramBannerLine(message);
  m = stripLeadingTitleDuplicate(title, m);
  return m;
}

function parseStructuredNotificationRows(body: string): {
  rows: { label: string; value: string }[];
  unparseableLines: string[];
} {
  const rows: { label: string; value: string }[] = [];
  const unparseableLines: string[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^<b>([^<]+)<\/b>\s*(.*)$/i);
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
