"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendaItemToGoogleEvent = agendaItemToGoogleEvent;
exports.syncAgendaItemToGoogleCalendar = syncAgendaItemToGoogleCalendar;
exports.removeAgendaItemFromGoogleCalendar = removeAgendaItemFromGoogleCalendar;
exports.enqueueAgendaGoogleCalendarSync = enqueueAgendaGoogleCalendarSync;
const googleapis_1 = require("googleapis");
const database_1 = require("../config/database");
const agendaService_1 = require("./agendaService");
const agendaGoogleOAuthService_1 = require("./agendaGoogleOAuthService");
const PROVIDER_GOOGLE = 'GOOGLE_CALENDAR';
function asDate(d) {
    if (d instanceof Date && !Number.isNaN(d.getTime()))
        return d;
    return new Date(String(d));
}
function isoDateUtc(d) {
    return d.toISOString().slice(0, 10);
}
/** Construye cuerpo de evento Calendar API v3 a partir del ítem local. */
function agendaItemToGoogleEvent(row) {
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
    const baseSummary = row.status === 'DONE' ? `[Hecho] ${row.title}` : row.status === 'CANCELLED' ? `[Cancelado] ${row.title}` : row.title;
    const evt = {
        summary: baseSummary.slice(0, 900),
        description: descParts.join('\n').slice(0, 7500),
        location: row.location?.trim() || undefined,
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
    }
    else {
        evt.start = { dateTime: startDt.toISOString() };
        evt.end = { dateTime: endDt.toISOString() };
    }
    if (row.status === 'CANCELLED') {
        evt.status = 'cancelled';
    }
    else if (row.status === 'TENTATIVE') {
        evt.status = 'tentative';
    }
    else {
        evt.status = 'confirmed';
    }
    if (row.recurrence_rule?.trim()) {
        evt.recurrence = row.recurrence_rule
            .split(/\r?\n/)
            .map((x) => x.trim())
            .filter(Boolean);
    }
    return evt;
}
async function selectGoogleSyncUid(connectionId, agendaItemId) {
    const res = await (0, database_1.query)(`
    SELECT external_uid FROM agenda_item_sync_state
    WHERE connection_id = $1 AND agenda_item_id = $2
    LIMIT 1
    `, [connectionId, agendaItemId]);
    const v = res.rows[0]?.external_uid;
    return typeof v === 'string' ? v : undefined;
}
async function upsertGoogleSyncUid(connectionId, agendaItemId, externalUid, etag) {
    await (0, database_1.query)(`
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
    `, [agendaItemId, connectionId, externalUid, etag ?? null]);
}
async function flagSyncSqlError(connectionId, agendaItemId, message) {
    if (agendaItemId != null) {
        await (0, database_1.query)(`
      UPDATE agenda_item_sync_state SET
        last_error = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE connection_id = $1 AND agenda_item_id = $2
      `, [connectionId, agendaItemId, message.slice(0, 750)]);
    }
}
async function syncAgendaItemToGoogleCalendar(userId, agendaItemId) {
    const row = await (0, agendaService_1.fetchAgendaItemRow)(userId, agendaItemId);
    if (!row || !row.sync_to_external)
        return;
    const oauth = await (0, agendaGoogleOAuthService_1.loadGoogleOAuthForUser)(userId);
    if (!oauth)
        return;
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauth.client });
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
        }
        else {
            res = await calendar.events.insert({
                calendarId,
                requestBody,
            });
        }
        const idNew = res.data.id;
        const etagNew = res.data.etag ?? null;
        if (!idNew)
            throw new Error('Google Calendar sin id de evento en respuesta');
        await upsertGoogleSyncUid(oauth.connectionId, agendaItemId, idNew, etagNew ?? undefined);
    }
    catch (e) {
        let msg = '';
        const err = e;
        msg = typeof err.message === 'string' ? err.message : String(err.message ?? '');
        const errorsArr = Array.isArray(err.errors) ? err.errors : [];
        const firstErr = errorsArr[0];
        const firstMsg = firstErr &&
            typeof firstErr === 'object' &&
            firstErr !== null &&
            typeof firstErr.message === 'string'
            ? String(firstErr.message)
            : '';
        if (!msg && firstMsg)
            msg = firstMsg;
        await (0, agendaGoogleOAuthService_1.recordGoogleConnectionError)(userId, msg || String(e));
        await flagSyncSqlError(oauth.connectionId, agendaItemId, msg || String(e)).catch(() => undefined);
        console.warn('Google Calendar push failed', userId, agendaItemId, msg || e);
        throw e instanceof Error ? e : new Error(msg || String(e));
    }
}
async function removeAgendaItemFromGoogleCalendar(userId, agendaItemId) {
    const oauth = await (0, agendaGoogleOAuthService_1.loadGoogleOAuthForUser)(userId);
    if (!oauth)
        return;
    const res = await (0, database_1.query)(`
    SELECT s.external_uid,
           COALESCE(NULLIF(trim(COALESCE(c.external_default_calendar_id, '')), ''), 'primary') AS calendar_id
    FROM agenda_item_sync_state s
    INNER JOIN agenda_provider_connections c ON c.id = s.connection_id
    WHERE s.agenda_item_id = $1
      AND c.user_id = $2
      AND c.provider = $3
      AND c.status IN ('CONNECTED', 'ERROR')
    `, [agendaItemId, userId, PROVIDER_GOOGLE]);
    if (res.rows.length === 0)
        return;
    const calendar = googleapis_1.google.calendar({ version: 'v3', auth: oauth.client });
    const failures = [];
    for (const r of res.rows) {
        if (!r.external_uid)
            continue;
        const calId = r.calendar_id || oauth.calendarId;
        try {
            await calendar.events.delete({ calendarId: calId, eventId: r.external_uid });
        }
        catch (e) {
            const err = e;
            const msg = typeof err.message === 'string' ? err.message : String(err.message ?? e);
            const notFound = err.code === 404 || /\b404\b/.test(msg) || /NOT_FOUND/i.test(msg);
            if (!notFound) {
                console.warn('Google Calendar delete failed', msg);
                failures.push(msg);
                await (0, agendaGoogleOAuthService_1.recordGoogleConnectionError)(userId, msg);
                await flagSyncSqlError(oauth.connectionId, agendaItemId, msg).catch(() => undefined);
            }
        }
    }
    if (failures.length > 0) {
        throw new Error(failures.join('; '));
    }
}
function enqueueAgendaGoogleCalendarSync(userId, agendaItemId) {
    void syncAgendaItemToGoogleCalendar(userId, agendaItemId).catch((err) => console.error('enqueue agenda google sync', err));
}
//# sourceMappingURL=agendaGooglePushService.js.map