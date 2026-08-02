import { query } from '../config/database';
import { loadICloudDavClientForMaintenance, recordICloudConnectionError } from './agendaICloudCaldavService';
import { parseFirstVEvent } from './agendaIcsParser';
import type { AgendaExternalEventDraft } from './agendaSyncTypes';

interface MappedICloudItem {
  agenda_item_id: number;
  external_uid: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: Date | string;
  ends_at: Date | string | null;
  all_day: boolean;
  recurrence_rule: string | null;
}

function externalKey(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    return `${url.origin.toLowerCase()}${url.pathname}${url.search}`.replace(/\/$/, '');
  } catch {
    return value;
  }
}

function isoString(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export async function pullICloudAgendaEvents(
  userId: number,
  range: { fromIso: string; toIso: string }
): Promise<{ events: AgendaExternalEventDraft[]; errors: string[] }> {
  const loaded = await loadICloudDavClientForMaintenance(userId);
  if (!loaded) return { events: [], errors: [] };

  const events: AgendaExternalEventDraft[] = [];
  const errors: string[] = [];

  try {
    const mappedResult = await query(
      `
      SELECT
        s.agenda_item_id, s.external_uid, a.title, a.description, a.location, a.starts_at, a.ends_at,
        a.all_day, a.recurrence_rule
      FROM agenda_item_sync_state s
      INNER JOIN agenda_items a ON a.id = s.agenda_item_id
      WHERE s.connection_id = $1
        AND a.deleted_at IS NULL
        AND a.starts_at < $3
        AND COALESCE(a.ends_at, a.starts_at) >= $2
      `,
      [loaded.connectionId, range.fromIso, range.toIso]
    );
    const mappedItems = mappedResult.rows as MappedICloudItem[];
    const mappedByExternalKey = new Map<string, MappedICloudItem>();
    for (const mapped of mappedItems) {
      const key = externalKey(mapped.external_uid);
      if (key) mappedByExternalKey.set(key, mapped);
    }
    const seenMappedKeys = new Set<string>();

    const objects = await loaded.client.fetchCalendarObjects({
      calendar: loaded.calendar,
      timeRange: { start: range.fromIso, end: range.toIso },
      useMultiGet: false,
      urlFilter: () => true,
    });
    for (const obj of objects) {
      const resourceUrl =
        typeof (obj as { url?: unknown }).url === 'string'
          ? String((obj as { url: string }).url).trim()
          : '';
      const urlKey = externalKey(resourceUrl);
      const mappedByUrl = mappedByExternalKey.get(urlKey);
      if (mappedByUrl) seenMappedKeys.add(externalKey(mappedByUrl.external_uid));

      const data = typeof obj.data === 'string' ? obj.data : '';
      const parsed = data ? parseFirstVEvent(data) : null;
      if (!parsed) continue;
      const uidKey = externalKey(parsed.externalUid);
      const mapped = mappedByUrl ?? mappedByExternalKey.get(uidKey);
      if (mapped) {
        seenMappedKeys.add(externalKey(mapped.external_uid));
        if (resourceUrl && externalKey(mapped.external_uid) !== urlKey) {
          await query(
            `
            UPDATE agenda_item_sync_state SET external_uid = $3, updated_at = CURRENT_TIMESTAMP
            WHERE agenda_item_id = $1 AND connection_id = $2
            `,
            [mapped.agenda_item_id, loaded.connectionId, resourceUrl]
          );
        }
      }
      const externalLocator = resourceUrl || mapped?.external_uid || parsed.externalUid;

      events.push({
        provider: 'ICLOUD_CALDAV',
        connectionId: loaded.connectionId,
        externalUid: externalLocator,
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

    const deletedAt = new Date().toISOString();
    for (const mapped of mappedItems) {
      if (seenMappedKeys.has(externalKey(mapped.external_uid))) continue;
      events.push({
        provider: 'ICLOUD_CALDAV',
        connectionId: loaded.connectionId,
        externalUid: mapped.external_uid,
        etag: null,
        title: mapped.title,
        description: mapped.description,
        location: mapped.location,
        startsAt: isoString(mapped.starts_at),
        endsAt: mapped.ends_at ? isoString(mapped.ends_at) : null,
        allDay: mapped.all_day,
        status: 'CANCELLED',
        recurrenceRule: mapped.recurrence_rule,
        externalUpdatedAt: deletedAt,
        deleted: true,
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
