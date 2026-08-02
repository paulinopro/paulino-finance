"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pullICloudAgendaEvents = pullICloudAgendaEvents;
const database_1 = require("../config/database");
const agendaICloudCaldavService_1 = require("./agendaICloudCaldavService");
const agendaIcsParser_1 = require("./agendaIcsParser");
function externalKey(raw) {
    if (typeof raw !== 'string')
        return '';
    const value = raw.trim();
    if (!value)
        return '';
    try {
        const url = new URL(value);
        return `${url.origin.toLowerCase()}${url.pathname}${url.search}`.replace(/\/$/, '');
    }
    catch {
        return value;
    }
}
function isoString(value) {
    return (value instanceof Date ? value : new Date(value)).toISOString();
}
async function pullICloudAgendaEvents(userId, range) {
    const loaded = await (0, agendaICloudCaldavService_1.loadICloudDavClientForMaintenance)(userId);
    if (!loaded)
        return { events: [], errors: [] };
    const events = [];
    const errors = [];
    try {
        const mappedResult = await (0, database_1.query)(`
      SELECT
        s.external_uid, a.title, a.description, a.location, a.starts_at, a.ends_at,
        a.all_day, a.recurrence_rule
      FROM agenda_item_sync_state s
      INNER JOIN agenda_items a ON a.id = s.agenda_item_id
      WHERE s.connection_id = $1
        AND a.deleted_at IS NULL
        AND a.starts_at < $3
        AND COALESCE(a.ends_at, a.starts_at) >= $2
      `, [loaded.connectionId, range.fromIso, range.toIso]);
        const mappedItems = mappedResult.rows;
        const mappedByExternalKey = new Map();
        for (const mapped of mappedItems) {
            const key = externalKey(mapped.external_uid);
            if (key)
                mappedByExternalKey.set(key, mapped);
        }
        const seenMappedKeys = new Set();
        const objects = await loaded.client.fetchCalendarObjects({
            calendar: loaded.calendar,
            timeRange: { start: range.fromIso, end: range.toIso },
            useMultiGet: false,
            urlFilter: () => true,
        });
        for (const obj of objects) {
            const urlKey = externalKey(obj.url);
            const mappedByUrl = mappedByExternalKey.get(urlKey);
            if (mappedByUrl)
                seenMappedKeys.add(externalKey(mappedByUrl.external_uid));
            const data = typeof obj.data === 'string' ? obj.data : '';
            const parsed = data ? (0, agendaIcsParser_1.parseFirstVEvent)(data) : null;
            if (!parsed)
                continue;
            const uidKey = externalKey(parsed.externalUid);
            const mapped = mappedByUrl ?? mappedByExternalKey.get(uidKey);
            if (mapped)
                seenMappedKeys.add(externalKey(mapped.external_uid));
            events.push({
                provider: 'ICLOUD_CALDAV',
                connectionId: loaded.connectionId,
                externalUid: mapped?.external_uid ?? parsed.externalUid,
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
            if (seenMappedKeys.has(externalKey(mapped.external_uid)))
                continue;
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
        await (0, database_1.query)(`
      UPDATE agenda_provider_connections SET
        last_synced_at = CURRENT_TIMESTAMP,
        last_error = NULL,
        status = 'CONNECTED',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `, [loaded.connectionId]);
    }
    catch (e) {
        const msg = typeof e.message === 'string' ? e.message : String(e);
        errors.push(msg);
        await (0, agendaICloudCaldavService_1.recordICloudConnectionError)(userId, msg);
    }
    return { events, errors };
}
//# sourceMappingURL=agendaICloudPullService.js.map