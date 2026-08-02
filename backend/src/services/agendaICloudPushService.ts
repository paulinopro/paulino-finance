import { fetchAgendaItemRow, type AgendaItemRow } from './agendaService';
import { query } from '../config/database';
import {
  loadICloudDavClientForMaintenance,
  loadICloudDavClientForPush,
  recordICloudConnectionError,
} from './agendaICloudCaldavService';

const PROVIDER_ICLOUD = 'ICLOUD_CALDAV';

function asDate(d: unknown): Date {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  return new Date(String(d));
}

function isoDateUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const da = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${da}`;
}

function formatUtcDateTime(dt: Date): string {
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const da = String(dt.getUTCDate()).padStart(2, '0');
  const h = String(dt.getUTCHours()).padStart(2, '0');
  const mi = String(dt.getUTCMinutes()).padStart(2, '0');
  const s = String(dt.getUTCSeconds()).padStart(2, '0');
  return `${y}${mo}${da}T${h}${mi}${s}Z`;
}

function escapeIcsText(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldIcs(contentLine: string): string {
  if (contentLine.length <= 75) return `${contentLine}\r\n`;
  let out = '';
  let rest = contentLine;
  while (rest.length > 75) {
    out += `${rest.slice(0, 75)}\r\n `;
    rest = rest.slice(75);
  }
  return `${out}${rest}\r\n`;
}

function icsSequenceFromRow(row: AgendaItemRow): number {
  const t = row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at));
  const sec = Math.floor(t.getTime() / 1000);
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Number.isFinite(sec) ? sec : 0));
}

function stableUid(row: AgendaItemRow, userId: number): string {
  return `pf-ag-u${userId}-a${row.id}@paulino.invalid`;
}

function icsCalendarFilename(userId: number, agendaItemId: number): string {
  return `pf-u${userId}-a${agendaItemId}.ics`;
}

function joinCollectionResourceUrl(collectionUrl: string, filename: string): string {
  const base = collectionUrl.replace(/\/?$/, '');
  return `${base}/${filename}`;
}

/** Después de PUT/MKCOL resuelve la URL absoluta del .ics nuevo. */
function resolveNewResourceHref(collectionUrl: string, filename: string, resp: Response): string {
  const locRaw = resp.headers.get('Location') ?? resp.headers.get('Content-Location');
  if (locRaw) {
    const t = locRaw.trim();
    try {
      if (t.startsWith('http')) return new URL(t).href;
      /** path absoluto servidor */
      return new URL(t, collectionUrl).href;
    } catch {
      /* fallthrough */
    }
    if (t.startsWith('/')) {
      try {
        const u = new URL(collectionUrl);
        return `${u.origin}${t}`;
      } catch {
        /* fallthrough */
      }
    }
  }
  return joinCollectionResourceUrl(collectionUrl, filename);
}

async function respErrorHint(resp: Response): Promise<string> {
  try {
    const t = await resp.text();
    return t.trim().slice(0, 500) || resp.statusText;
  } catch {
    return resp.statusText;
  }
}

/** VCALENDAR único para un evento Agenda (RFC 5545). */
export function agendaItemToIcsString(row: AgendaItemRow, userId: number): string {
  const startDt = asDate(row.starts_at);
  let endDt = row.ends_at != null ? asDate(row.ends_at) : new Date(startDt.getTime() + 60 * 60 * 1000);
  if (endDt.getTime() <= startDt.getTime()) {
    endDt = new Date(startDt.getTime() + 60 * 60 * 1000);
  }

  const descParts = [
    row.description?.trim(),
    row.location?.trim() ? `Ubicacion: ${row.location.trim()}` : undefined,
    typeof row.kind === 'string' ? `Tipo: ${row.kind}` : undefined,
    row.finance_link_type && row.finance_link_id != null
      ? `Enlace financiero: ${row.finance_link_type} #${row.finance_link_id}`
      : undefined,
    `Origen: Paulino Finance Agenda (id=${row.id})`,
  ].filter(Boolean);

  const baseSummary =
    row.status === 'DONE' ? `[Hecho] ${row.title}` : row.status === 'CANCELLED' ? `[Cancelado] ${row.title}` : row.title;

  const summary = escapeIcsText(baseSummary.slice(0, 900));
  const description = escapeIcsText(descParts.join('\n').slice(0, 7500));
  const uid = escapeIcsText(stableUid(row, userId));
  const seq = String(icsSequenceFromRow(row));
  const stamp = formatUtcDateTime(new Date());

  let dtStartLine: string;
  let dtEndLine: string;
  if (row.all_day) {
    const endExclusive = new Date(startDt.getTime());
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    dtStartLine = `DTSTART;VALUE=DATE:${isoDateUtc(startDt)}`;
    dtEndLine = `DTEND;VALUE=DATE:${isoDateUtc(endExclusive)}`;
  } else {
    dtStartLine = `DTSTART:${formatUtcDateTime(startDt)}`;
    dtEndLine = `DTEND:${formatUtcDateTime(endDt)}`;
  }

  let veventStatus: string;
  if (row.status === 'CANCELLED') veventStatus = 'STATUS:CANCELLED';
  else if (row.status === 'TENTATIVE') veventStatus = 'STATUS:TENTATIVE';
  else veventStatus = 'STATUS:CONFIRMED';

  const lines: string[] = [
    foldIcs('BEGIN:VCALENDAR'),
    foldIcs('VERSION:2.0'),
    foldIcs('PRODID:-//Paulino Finance//Agenda ICS//ES'),
    foldIcs('CALSCALE:GREGORIAN'),
    foldIcs('METHOD:PUBLISH'),
    foldIcs('BEGIN:VEVENT'),
    foldIcs(`UID:${uid}`),
    foldIcs(`SEQUENCE:${seq}`),
    foldIcs(`DTSTAMP:${stamp}`),
    foldIcs(dtStartLine),
    foldIcs(dtEndLine),
    foldIcs(`SUMMARY:${summary}`),
    ...(description.trim() ? [foldIcs(`DESCRIPTION:${description}`)] : []),
    ...(row.location?.trim() ? [foldIcs(`LOCATION:${escapeIcsText(row.location.trim().slice(0, 900))}`)] : []),
    ...(row.recurrence_rule?.trim()
      ? row.recurrence_rule
          .split(/\r?\n/)
          .map((x) => x.trim())
          .filter(Boolean)
          .map((x) => foldIcs(x.startsWith('RRULE:') ? x : `RRULE:${x}`))
      : []),
    foldIcs('TRANSP:OPAQUE'),
    foldIcs(veventStatus),
    foldIcs('END:VEVENT'),
    foldIcs('END:VCALENDAR'),
  ];
  return lines.join('');
}

async function selectICloudSyncMeta(
  connectionId: number,
  agendaItemId: number
): Promise<{ externalUrl: string; etag: string | null } | undefined> {
  const res = await query(
    `
    SELECT external_uid, etag
    FROM agenda_item_sync_state
    WHERE connection_id = $1 AND agenda_item_id = $2
    LIMIT 1
    `,
    [connectionId, agendaItemId]
  );
  const r = res.rows[0] as { external_uid?: unknown; etag?: unknown } | undefined;
  if (!r || typeof r.external_uid !== 'string') return undefined;
  return {
    externalUrl: r.external_uid,
    etag: typeof r.etag === 'string' && r.etag ? r.etag : null,
  };
}

async function upsertICloudSyncRow(
  connectionId: number,
  agendaItemId: number,
  externalUrl: string,
  etag: string | null | undefined
): Promise<void> {
  await query(
    `
    INSERT INTO agenda_item_sync_state (
      agenda_item_id, connection_id, external_uid, etag, external_updated_at, last_pushed_at
    )
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT (agenda_item_id, connection_id) DO UPDATE SET
      external_uid = EXCLUDED.external_uid,
      etag = EXCLUDED.etag,
      external_updated_at = EXCLUDED.external_updated_at,
      last_pushed_at = CURRENT_TIMESTAMP,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    `,
    [agendaItemId, connectionId, externalUrl, etag ?? null]
  );
}

async function flagICloudSyncSqlError(
  connectionId: number,
  agendaItemId: number,
  message: string
): Promise<void> {
  await query(
    `
    UPDATE agenda_item_sync_state SET
      last_error = $3,
      updated_at = CURRENT_TIMESTAMP
    WHERE connection_id = $1 AND agenda_item_id = $2
    `,
    [connectionId, agendaItemId, message.slice(0, 750)]
  );
}

async function configuredICloudConnection(userId: number): Promise<{
  id: number;
  status: string;
  lastError: string | null;
} | null> {
  const res = await query(
    `
    SELECT id, status, last_error
    FROM agenda_provider_connections
    WHERE user_id = $1 AND provider = $2 AND status IN ('CONNECTED','ERROR')
    LIMIT 1
    `,
    [userId, PROVIDER_ICLOUD]
  );
  const row = res.rows[0] as { id: number; status: string; last_error?: unknown } | undefined;
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    lastError: typeof row.last_error === 'string' && row.last_error.trim() ? row.last_error : null,
  };
}

export async function syncAgendaItemToICloudCalDav(userId: number, agendaItemId: number): Promise<void> {
  const row = await fetchAgendaItemRow(userId, agendaItemId);
  if (!row || !row.sync_to_external) return;

  const loaded = await loadICloudDavClientForPush(userId);
  if (!loaded) {
    const configured = await configuredICloudConnection(userId);
    if (!configured) return;
    const message =
      configured.lastError || 'La conexión de iCloud está configurada pero no está disponible';
    await recordICloudConnectionError(userId, message);
    await flagICloudSyncSqlError(configured.id, agendaItemId, message).catch(() => undefined);
    throw new Error(message);
  }

  const { client, connectionId, calendar } = loaded;
  const icsBody = agendaItemToIcsString(row, userId);
  const filename = icsCalendarFilename(userId, agendaItemId);

  try {
    const existing = await selectICloudSyncMeta(connectionId, agendaItemId);

    if (existing) {
      const up = await client.updateObject({
        url: existing.externalUrl,
        data: icsBody,
        etag: existing.etag ?? undefined,
      });

      if (!up.ok && up.status !== 412) {
        throw new Error(`CalDAV PUT ${up.status}: ${await respErrorHint(up)}`);
      }

      /** 412: reintentar sin If-Match; iCloud suele responder con nueva entidad */
      let finalResp = up;
      if (!up.ok && up.status === 412) {
        finalResp = await client.updateObject({
          url: existing.externalUrl,
          data: icsBody,
        });
        if (!finalResp.ok) {
          throw new Error(`CalDAV PUT (sin etag) ${finalResp.status}: ${await respErrorHint(finalResp)}`);
        }
      }

      const etagNew = finalResp.headers.get('etag');
      await upsertICloudSyncRow(connectionId, agendaItemId, existing.externalUrl, etagNew ?? existing.etag);
      return;
    }

    const cr = await client.createCalendarObject({
      calendar,
      filename,
      iCalString: icsBody,
    });

    if (!cr.ok) {
      throw new Error(`CalDAV crear objeto ${cr.status}: ${await respErrorHint(cr)}`);
    }

    const href = resolveNewResourceHref(calendar.url, filename, cr);
    const etagNew = cr.headers.get('etag');
    await upsertICloudSyncRow(connectionId, agendaItemId, href, etagNew);
  } catch (e: unknown) {
    const msg =
      typeof (e as { message?: unknown })?.message === 'string'
        ? (e as { message: string }).message
        : String(e ?? 'CalDAV');
    console.warn('iCloud CalDAV push failed', userId, agendaItemId, msg);
    await recordICloudConnectionError(userId, msg);
    await flagICloudSyncSqlError(connectionId, agendaItemId, msg).catch(() => undefined);
    throw e instanceof Error ? e : new Error(msg);
  }
}

export async function removeAgendaItemFromICloudCalDav(userId: number, agendaItemId: number): Promise<void> {
  const loaded = await loadICloudDavClientForMaintenance(userId);
  const res = await query(
    `
    SELECT s.connection_id, s.external_uid, s.etag, c.last_error
    FROM agenda_item_sync_state s
    INNER JOIN agenda_provider_connections c ON c.id = s.connection_id
    WHERE s.agenda_item_id = $1
      AND c.user_id = $2
      AND c.provider = $3
    `,
    [agendaItemId, userId, PROVIDER_ICLOUD]
  );

  if (res.rows.length === 0) return;
  if (!loaded) {
    const first = res.rows[0] as { connection_id: number; last_error?: unknown };
    const message =
      typeof first.last_error === 'string' && first.last_error.trim()
        ? first.last_error
        : 'La conexión de iCloud está configurada pero no está disponible';
    await recordICloudConnectionError(userId, message);
    await flagICloudSyncSqlError(first.connection_id, agendaItemId, message).catch(() => undefined);
    throw new Error(message);
  }

  const failures: string[] = [];
  for (const r of res.rows as { external_uid: string; etag: string | null }[]) {
    if (!r.external_uid) continue;
    try {
      const del = await loaded.client.deleteObject({
        url: r.external_uid,
        etag: r.etag ?? undefined,
      });
      if (!del.ok && del.status !== 404 && del.status !== 410) {
        throw new Error(`CalDAV DELETE ${del.status}: ${await respErrorHint(del)}`);
      }
    } catch (e: unknown) {
      const msg =
        typeof (e as { message?: unknown })?.message === 'string'
          ? (e as { message: string }).message
          : String(e);
      console.warn('iCloud CalDAV delete failed', msg || e);
      failures.push(msg);
      await recordICloudConnectionError(userId, msg);
      await flagICloudSyncSqlError(loaded.connectionId, agendaItemId, msg).catch(() => undefined);
    }
  }
  if (failures.length > 0) {
    throw new Error(failures.join('; '));
  }
}

export function enqueueAgendaICloudCaldavSync(userId: number, agendaItemId: number): void {
  void syncAgendaItemToICloudCalDav(userId, agendaItemId).catch((err) =>
    console.error('enqueue agenda icloud caldav sync', err)
  );
}
