import { query } from '../config/database';
import { loadICloudDavClientForMaintenance, recordICloudConnectionError } from './agendaICloudCaldavService';
import { parseFirstVEvent } from './agendaIcsParser';
import type { AgendaExternalEventDraft } from './agendaSyncTypes';

export async function pullICloudAgendaEvents(
  userId: number,
  range: { fromIso: string; toIso: string }
): Promise<{ events: AgendaExternalEventDraft[]; errors: string[] }> {
  const loaded = await loadICloudDavClientForMaintenance(userId);
  if (!loaded) return { events: [], errors: [] };

  const events: AgendaExternalEventDraft[] = [];
  const errors: string[] = [];

  try {
    const objects = await loaded.client.fetchCalendarObjects({
      calendar: loaded.calendar,
      timeRange: { start: range.fromIso, end: range.toIso },
      useMultiGet: false,
      urlFilter: () => true,
    });
    for (const obj of objects) {
      const data = typeof obj.data === 'string' ? obj.data : '';
      const parsed = data ? parseFirstVEvent(data) : null;
      if (!parsed) continue;
      events.push({
        provider: 'ICLOUD_CALDAV',
        connectionId: loaded.connectionId,
        externalUid: parsed.externalUid,
        etag: typeof obj.etag === 'string' ? obj.etag : null,
        title: parsed.title,
        description: parsed.description,
        location: parsed.location,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt,
        allDay: parsed.allDay,
        status: parsed.deleted ? 'CANCELLED' : 'OPEN',
        recurrenceRule: parsed.recurrenceRule,
        externalUpdatedAt: parsed.externalUpdatedAt,
        deleted: parsed.deleted,
      });
    }

    await query(
      `
      UPDATE agenda_provider_connections SET
        last_synced_at = CURRENT_TIMESTAMP,
        last_error = NULL,
        status = 'CONNECTED',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [loaded.connectionId]
    );
  } catch (e: unknown) {
    const msg = typeof (e as { message?: unknown }).message === 'string' ? (e as { message: string }).message : String(e);
    errors.push(msg);
    await recordICloudConnectionError(userId, msg);
  }

  return { events, errors };
}
