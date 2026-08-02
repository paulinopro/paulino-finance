"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleEventToAgendaDraft = googleEventToAgendaDraft;
exports.pullGoogleAgendaEvents = pullGoogleAgendaEvents;
const googleapis_1 = require("googleapis");
const database_1 = require("../config/database");
const agendaGoogleOAuthService_1 = require("./agendaGoogleOAuthService");
function googleEventToAgendaDraft(event, connectionId) {
    const externalUid = event.id || '';
    const startRaw = event.start?.dateTime || event.start?.date || '';
    if (!externalUid || !startRaw)
        return null;
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
        status: event.status === 'cancelled'
            ? 'CANCELLED'
            : event.status === 'tentative'
                ? 'TENTATIVE'
                : 'OPEN',
        recurrenceRule: Array.isArray(event.recurrence) ? event.recurrence.join('\n') : null,
        externalUpdatedAt: event.updated || null,
        deleted: event.status === 'cancelled',
    };
}
async function getConnectionSyncToken(connectionId) {
    const res = await (0, database_1.query)(`SELECT sync_token FROM agenda_provider_connections WHERE id = $1`, [connectionId]);
    const token = res.rows[0]?.sync_token;
    return typeof token === 'string' && token.trim() ? token : null;
}
async function storeConnectionSyncToken(connectionId, syncToken) {
    await (0, database_1.query)(`
    UPDATE agenda_provider_connections SET
      sync_token = COALESCE($2, sync_token),
      last_synced_at = CURRENT_TIMESTAMP,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    `, [connectionId, syncToken ?? null]);
}
async function pullGoogleAgendaEvents(userId, range) {
    const loaded = await (0, agendaGoogleOAuthService_1.loadGoogleOAuthForUser)(userId);
    if (!loaded)
        return { events: [], errors: [] };
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth: loaded.client });
    const events = [];
    const errors = [];
    try {
        const syncToken = await getConnectionSyncToken(loaded.connectionId);
        const res = await calendar.events.list({
            calendarId: loaded.calendarId,
            maxResults: 2500,
            showDeleted: true,
            singleEvents: false,
            ...(syncToken
                ? { syncToken }
                : { timeMin: range.fromIso, timeMax: range.toIso }),
        });
        for (const item of res.data.items || []) {
            const draft = googleEventToAgendaDraft(item, loaded.connectionId);
            if (draft)
                events.push(draft);
        }
        await storeConnectionSyncToken(loaded.connectionId, res.data.nextSyncToken || null);
    }
    catch (e) {
        const msg = typeof e.message === 'string' ? e.message : String(e);
        errors.push(msg);
        await (0, agendaGoogleOAuthService_1.recordGoogleConnectionError)(userId, msg);
        if (/\b410\b|syncToken/i.test(msg)) {
            await (0, database_1.query)(`UPDATE agenda_provider_connections SET sync_token = NULL WHERE id = $1`, [
                loaded.connectionId,
            ]).catch(() => undefined);
        }
    }
    return { events, errors };
}
//# sourceMappingURL=agendaGooglePullService.js.map