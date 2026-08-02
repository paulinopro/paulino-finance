export interface ParsedAgendaVEvent {
  externalUid: string;
  title: string;
  description: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  recurrenceRule: string | null;
  externalUpdatedAt: string | null;
  deleted: boolean;
}

function unfoldIcs(raw: string): string[] {
  return raw
    .replace(/\r\n/g, '\n')
    .split('\n')
    .reduce<string[]>((acc, line) => {
      if (/^[ \t]/.test(line) && acc.length) {
        acc[acc.length - 1] += line.slice(1);
      } else {
        acc.push(line.trimEnd());
      }
      return acc;
    }, []);
}

function unescapeIcsText(raw: string): string {
  return raw
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function splitNameValue(line: string): { name: string; params: string; value: string } | null {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  const semi = left.indexOf(';');
  return {
    name: (semi >= 0 ? left.slice(0, semi) : left).toUpperCase(),
    params: semi >= 0 ? left.slice(semi + 1).toUpperCase() : '',
    value: line.slice(idx + 1),
  };
}

function parseIcsDate(value: string, allDay: boolean): string | null {
  const v = value.trim();
  if (allDay || /^\d{8}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6));
    const d = Number(v.slice(6, 8));
    const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }

  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) {
    const dt = new Date(v);
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

export function parseFirstVEvent(raw: string): ParsedAgendaVEvent | null {
  const lines = unfoldIcs(raw);
  const start = lines.findIndex((line) => line.toUpperCase() === 'BEGIN:VEVENT');
  const end = lines.findIndex((line, idx) => idx > start && line.toUpperCase() === 'END:VEVENT');
  if (start < 0 || end < 0) return null;

  const fields = new Map<string, { params: string; value: string }>();
  for (const line of lines.slice(start + 1, end)) {
    const parsed = splitNameValue(line);
    if (!parsed) continue;
    if (!fields.has(parsed.name)) fields.set(parsed.name, { params: parsed.params, value: parsed.value });
  }

  const uid = fields.get('UID')?.value.trim();
  const dtStart = fields.get('DTSTART');
  if (!uid || !dtStart) return null;

  const startAllDay = dtStart.params.includes('VALUE=DATE') || /^\d{8}$/.test(dtStart.value.trim());
  const startsAt = parseIcsDate(dtStart.value, startAllDay);
  const dtEnd = fields.get('DTEND');
  const endsAt = dtEnd ? parseIcsDate(dtEnd.value, dtEnd.params.includes('VALUE=DATE') || startAllDay) : null;
  if (!startsAt) return null;

  const lastModified = fields.get('LAST-MODIFIED')?.value || fields.get('DTSTAMP')?.value || null;
  const externalUpdatedAt = lastModified ? parseIcsDate(lastModified, false) : null;
  const status = fields.get('STATUS')?.value.toUpperCase() || '';

  return {
    externalUid: uid,
    title: unescapeIcsText(fields.get('SUMMARY')?.value || '(Sin titulo)'),
    description: fields.get('DESCRIPTION') ? unescapeIcsText(fields.get('DESCRIPTION')!.value) : null,
    location: fields.get('LOCATION') ? unescapeIcsText(fields.get('LOCATION')!.value) : null,
    startsAt,
    endsAt,
    allDay: startAllDay,
    recurrenceRule: fields.get('RRULE')?.value || null,
    externalUpdatedAt,
    deleted: status === 'CANCELLED',
  };
}
