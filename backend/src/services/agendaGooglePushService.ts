import { google } from 'googleapis';
import type { calendar_v3 } from 'googleapis';
import { query } from '../config/database';
import type { AgendaItemRow } from './agendaService';
import { fetchAgendaItemRow } from './agendaService';
import {
  loadGoogleOAuthForUser,
  recordGoogleConnectionError,
} from './agendaGoogleOAuthService';

const PROVIDER_GOOGLE = 'GOOGLE_CALENDAR';

function asDate(d: unknown): Date {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  return new Date(String(d));
}

function isoDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Construye cuerpo de evento Calendar API v3 a partir del ítem local. */
export function agendaItemToGoogleEvent(row: AgendaItemRow): calendar_v3.Schema$Event {
  const startDt = asDate(row.starts_at);
  let endDt = row.ends_at != null ? asDate(row.ends_at) : new Date(startDt.getTime() + 60 * 60 * 1000);
  if (endDt.getTime() <= startDt.getTime()) {
    endDt = new Date(startDt.getTime() + 60 * 60 * 1000);
  }

  const descParts = [
    row.description?.trim(),
    typeof row.kind === 'string' ? `Tipo: ${row.kind}` : undefined,
    row.finance_link_type && row.finance_link_id != null
      ? `Enlace financiero: ${row.finance_link_type} #${row.finance_link_id}`
      : undefined,
    `Origen: Paulino Finance Agenda (id=${row.id})`,
  ].filter(Boolean);

  const baseSummary =
    row.status === 'DONE' ? `[Hecho] ${row.title}` : row.status === 'CANCELLED' ? `[Cancelado] ${row.title}` : row.title;

  const evt: calendar_v3.Schema$Event = {
    summary: baseSummary.slice(0, 900),
    description: descParts.join('\n').slice(0, 7500),
    extendedProperties: {
      private: {
        paulinoAgendaItemId: String(row.id),
        paulinoAgendaKind: row.kind,
      },
    },
  };

  if (row.all_day) {
    const endExclusive = new Date(startDt.getTime());
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    evt.start = { date: isoDateUtc(startDt) };
    evt.end = { date: isoDateUtc(endExclusive) };
  } else {
    evt.start = { dateTime: startDt.toISOString() };
    evt.end = { dateTime: endDt.toISOString() };
  }

  if (row.status === 'CANCELLED') {
    evt.status = 'cancelled';
  } else if (row.status === 'TENTATIVE') {
    evt.status = 'tentative';
  } else {
    evt.status = 'confirmed';
  }

  return evt;
}

async function selectGoogleSyncUid(connectionId: number, agendaItemId: number): Promise<string | undefined> {
  const res = await query(
    `
    SELECT external_uid FROM agenda_item_sync_state
    WHERE connection_id = $1 AND agenda_item_id = $2
    LIMIT 1
    `,
    [connectionId, agendaItemId]
  );
  const v = res.rows[0]?.external_uid;
  return typeof v === 'string' ? v : undefined;
}

async function upsertGoogleSyncUid(
  connectionId: number,
  agendaItemId: number,
  externalUid: string,
  etag: string | null | undefined
): Promise<void> {
  await query(
    `
    INSERT INTO agenda_item_sync_state (
      agenda_item_id, connection_id, external_uid, etag, last_pushed_at
    )
    VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
    ON CONFLICT (agenda_item_id, connection_id) DO UPDATE SET
      external_uid = EXCLUDED.external_uid,
      etag = EXCLUDED.etag,
      last_pushed_at = CURRENT_TIMESTAMP,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    `,
    [agendaItemId, connectionId, externalUid, etag ?? null]
  );
}

async function flagSyncSqlError(connectionId: number, agendaItemId: number | null, message: string): Promise<void> {
  if (agendaItemId != null) {
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
}

export async function syncAgendaItemToGoogleCalendar(userId: number, agendaItemId: number): Promise<void> {
  const row = await fetchAgendaItemRow(userId, agendaItemId);
  if (!row || !row.sync_to_external) return;

  const oauth = await loadGoogleOAuthForUser(userId);
  if (!oauth) return;

  const calendar = google.calendar({ version: 'v3', auth: oauth.client });
  const calendarId = oauth.calendarId;
  const requestBody = agendaItemToGoogleEvent(row);

  try {
    const externalUid = await selectGoogleSyncUid(oauth.connectionId, agendaItemId);

    let res;
    if (externalUid) {
      res = await calendar.events.patch({
        calendarId,
        eventId: externalUid,
        requestBody,
      });
    } else {
      res = await calendar.events.insert({
        calendarId,
        requestBody,
      });
    }

    const idNew = res.data.id;
    const etagNew = res.data.etag ?? null;
    if (!idNew) throw new Error('Google Calendar sin id de evento en respuesta');
    await upsertGoogleSyncUid(oauth.connectionId, agendaItemId, idNew, etagNew ?? undefined);
  } catch (e: unknown) {
    let msg = '';
    const err = e as Record<string, unknown>;
    msg = typeof err.message === 'string' ? err.message : String(err.message ?? '');
    const errorsArr = Array.isArray(err.errors) ? err.errors : [];
    const firstErr = errorsArr[0];
    const firstMsg =
      firstErr &&
      typeof firstErr === 'object' &&
      firstErr !== null &&
      typeof (firstErr as Record<string, unknown>).message === 'string'
        ? String((firstErr as Record<string, unknown>).message)
        : '';
    if (!msg && firstMsg) msg = firstMsg;

    await recordGoogleConnectionError(userId, msg || String(e));
    await flagSyncSqlError(oauth.connectionId, agendaItemId, msg || String(e)).catch(() => undefined);
    console.warn('Google Calendar push failed', userId, agendaItemId, msg || e);
  }
}

export async function removeAgendaItemFromGoogleCalendar(userId: number, agendaItemId: number): Promise<void> {
  const oauth = await loadGoogleOAuthForUser(userId);
  if (!oauth) return;

  const res = await query(
    `
    SELECT s.external_uid,
           COALESCE(NULLIF(trim(COALESCE(c.external_default_calendar_id, '')), ''), 'primary') AS calendar_id
    FROM agenda_item_sync_state s
    INNER JOIN agenda_provider_connections c ON c.id = s.connection_id
    WHERE s.agenda_item_id = $1
      AND c.user_id = $2
      AND c.provider = $3
      AND c.status IN ('CONNECTED', 'ERROR')
    `,
    [agendaItemId, userId, PROVIDER_GOOGLE]
  );

  if (res.rows.length === 0) return;

  const calendar = google.calendar({ version: 'v3', auth: oauth.client });

  for (const r of res.rows as { external_uid: string; calendar_id: string }[]) {
    if (!r.external_uid) continue;
    const calId = r.calendar_id || oauth.calendarId;
    try {
      await calendar.events.delete({ calendarId: calId, eventId: r.external_uid });
    } catch (e: unknown) {
      const err = e as { message?: unknown; code?: unknown };
      const msg = typeof err.message === 'string' ? err.message : String(err.message ?? e);
      const notFound = err.code === 404 || /\b404\b/.test(msg) || /NOT_FOUND/i.test(msg);
      if (!notFound) {
        console.warn('Google Calendar delete failed', msg);
      }
    }
  }
}

export function enqueueAgendaGoogleCalendarSync(userId: number, agendaItemId: number): void {
  void syncAgendaItemToGoogleCalendar(userId, agendaItemId).catch((err) =>
    console.error('enqueue agenda google sync', err)
  );
}
