"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pullICloudAgendaEvents = pullICloudAgendaEvents;
const database_1 = require("../config/database");
const agendaICloudCaldavService_1 = require("./agendaICloudCaldavService");
const agendaIcsParser_1 = require("./agendaIcsParser");
async function pullICloudAgendaEvents(userId, range) {
    const loaded = await (0, agendaICloudCaldavService_1.loadICloudDavClientForMaintenance)(userId);
    if (!loaded)
        return { events: [], errors: [] };
    const events = [];
    const errors = [];
    try {
        const objects = await loaded.client.fetchCalendarObjects({
            calendar: loaded.calendar,
            timeRange: { start: range.fromIso, end: range.toIso },
            useMultiGet: false,
            urlFilter: () => true,
        });
        for (const obj of objects) {
            const data = typeof obj.data === 'string' ? obj.data : '';
            const parsed = data ? (0, agendaIcsParser_1.parseFirstVEvent)(data) : null;
            if (!parsed)
                continue;
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