import { google, calendar_v3 } from 'googleapis';
import { query } from '../config/database';
import { loadGoogleOAuthForUser, recordGoogleConnectionError } from './agendaGoogleOAuthService';
import type { AgendaExternalEventDraft } from './agendaSyncTypes';

export function googleEventToAgendaDraft(
  event: calendar_v3.Schema$Event,
  connectionId: number
): AgendaExternalEventDraft | null {
  const externalUid = event.id || '';
  const startRaw = event.start?.dateTime || event.start?.date || '';
  if (!externalUid || !startRaw) return null;
  return {
    provider: 'GOOGLE_CALENDAR',
    connectionId,
    externalUid,
    etag: event.etag || null,
    title: event.summary || '(Sin titulo)',
    description: event.description || null,
    location: event.location || null,
    startsAt: startRaw,
    endsAt: event.end?.dateTime || event.end?.date || null,
    allDay: Boolean(event.start?.date),
    status:
      event.status === 'cancelled'
        ? 'CANCELLED'
        : event.status === 'tentative'
          ? 'TENTATIVE'
          : 'OPEN',
    recurrenceRule: Array.isArray(event.recurrence) ? event.recurrence.join('\n') : null,
    externalUpdatedAt: event.updated || null,
    deleted: event.status === 'cancelled',
  };
}

async function getConnectionSyncToken(connectionId: number): Promise<string | null> {
  const res = await query(
    `SELECT sync_token FROM agenda_provider_connections WHERE id = $1`,
    [connectionId]
  );
  const token = res.rows[0]?.sync_token;
  return typeof token === 'string' && token.trim() ? token : null;
}

async function storeConnectionSyncToken(connectionId: number, syncToken: string | null | undefined): Promise<void> {
  await query(
    `
    UPDATE agenda_provider_connections SET
      sync_token = COALESCE($2, sync_token),
      last_synced_at = CURRENT_TIMESTAMP,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `,
    [connectionId, syncToken ?? null]
  );
}

function isInvalidSyncToken(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown };
  const message = typeof err.message === 'string' ? err.message : String(error);
  return err.code === 410 || /\b410\b|syncToken/i.test(message);
}

async function listAllGoogleEventPages(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  range: { fromIso: string; toIso: string },
  syncToken: string | null
): Promise<{ events: calendar_v3.Schema$Event[]; nextSyncToken: string | null }> {
  const events: calendar_v3.Schema$Event[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | null = null;

  do {
    const res = await calendar.events.list({
      calendarId,
      maxResults: 2500,
      showDeleted: true,
      singleEvents: false,
      ...(syncToken ? { syncToken } : { timeMin: range.fromIso, timeMax: range.toIso }),
      ...(pageToken ? { pageToken } : {}),
    });
    events.push(...(res.data.items || []));
    pageToken = res.data.nextPageToken || undefined;
    if (!pageToken) nextSyncToken = res.data.nextSyncToken || null;
  } while (pageToken);

  return { events, nextSyncToken };
}

export async function pullGoogleAgendaEvents(
  userId: number,
  range: { fromIso: string; toIso: string }
): Promise<{ events: AgendaExternalEventDraft[]; errors: string[] }> {
  const loaded = await loadGoogleOAuthForUser(userId);
  if (!loaded) return { events: [], errors: [] };

  const calendar = google.calendar({ version: 'v3', auth: loaded.client });
  const events: AgendaExternalEventDraft[] = [];
  const errors: string[] = [];

  try {
    const syncToken = await getConnectionSyncToken(loaded.connectionId);
    let pulled;
    try {
      pulled = await listAllGoogleEventPages(calendar, loaded.calendarId, range, syncToken);
    } catch (error: unknown) {
      if (!syncToken || !isInvalidSyncToken(error)) throw error;
      await query(`UPDATE agenda_provider_connections SET sync_token = NULL WHERE id = $1`, [
        loaded.connectionId,
      ]);
      pulled = await listAllGoogleEventPages(calendar, loaded.calendarId, range, null);
    }

    for (const item of pulled.events) {
      const draft = googleEventToAgendaDraft(item, loaded.connectionId);
      if (draft) events.push(draft);
    }
    await storeConnectionSyncToken(loaded.connectionId, pulled.nextSyncToken);
  } catch (e: unknown) {
    const msg = typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
    errors.push(msg);
    await recordGoogleConnectionError(userId, msg);
  }

  return { events, errors };
}
