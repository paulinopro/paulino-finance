"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendaItemToIcsString = agendaItemToIcsString;
exports.syncAgendaItemToICloudCalDav = syncAgendaItemToICloudCalDav;
exports.removeAgendaItemFromICloudCalDav = removeAgendaItemFromICloudCalDav;
exports.enqueueAgendaICloudCaldavSync = enqueueAgendaICloudCaldavSync;
const agendaService_1 = require("./agendaService");
const database_1 = require("../config/database");
const agendaICloudCaldavService_1 = require("./agendaICloudCaldavService");
const PROVIDER_ICLOUD = 'ICLOUD_CALDAV';
function asDate(d) {
    if (d instanceof Date && !Number.isNaN(d.getTime()))
        return d;
    return new Date(String(d));
}
function isoDateUtc(d) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const da = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${mo}${da}`;
}
function formatUtcDateTime(dt) {
    const y = dt.getUTCFullYear();
    const mo = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const da = String(dt.getUTCDate()).padStart(2, '0');
    const h = String(dt.getUTCHours()).padStart(2, '0');
    const mi = String(dt.getUTCMinutes()).padStart(2, '0');
    const s = String(dt.getUTCSeconds()).padStart(2, '0');
    return `${y}${mo}${da}T${h}${mi}${s}Z`;
}
function escapeIcsText(raw) {
    return raw
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,');
}
function foldIcs(contentLine) {
    if (contentLine.length <= 75)
        return `${contentLine}\r\n`;
    let out = '';
    let rest = contentLine;
    while (rest.length > 75) {
        out += `${rest.slice(0, 75)}\r\n `;
        rest = rest.slice(75);
    }
    return `${out}${rest}\r\n`;
}
function icsSequenceFromRow(row) {
    const t = row.updated_at instanceof Date ? row.updated_at : new Date(String(row.updated_at));
    const sec = Math.floor(t.getTime() / 1000);
    return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Number.isFinite(sec) ? sec : 0));
}
function stableUid(row, userId) {
    return `pf-ag-u${userId}-a${row.id}@paulino.invalid`;
}
function icsCalendarFilename(userId, agendaItemId) {
    return `pf-u${userId}-a${agendaItemId}.ics`;
}
function joinCollectionResourceUrl(collectionUrl, filename) {
    const base = collectionUrl.replace(/\/?$/, '');
    return `${base}/${filename}`;
}
/** Después de PUT/MKCOL resuelve la URL absoluta del .ics nuevo. */
function resolveNewResourceHref(collectionUrl, filename, resp) {
    const locRaw = resp.headers.get('Location') ?? resp.headers.get('Content-Location');
    if (locRaw) {
        const t = locRaw.trim();
        try {
            if (t.startsWith('http'))
                return new URL(t).href;
            /** path absoluto servidor */
            return new URL(t, collectionUrl).href;
        }
        catch {
            /* fallthrough */
        }
        if (t.startsWith('/')) {
            try {
                const u = new URL(collectionUrl);
                return `${u.origin}${t}`;
            }
            catch {
                /* fallthrough */
            }
        }
    }
    return joinCollectionResourceUrl(collectionUrl, filename);
}
async function respErrorHint(resp) {
    try {
        const t = await resp.text();
        return t.trim().slice(0, 500) || resp.statusText;
    }
    catch {
        return resp.statusText;
    }
}
/** VCALENDAR único para un evento Agenda (RFC 5545). */
function agendaItemToIcsString(row, userId) {
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
    const baseSummary = row.status === 'DONE' ? `[Hecho] ${row.title}` : row.status === 'CANCELLED' ? `[Cancelado] ${row.title}` : row.title;
    const summary = escapeIcsText(baseSummary.slice(0, 900));
    const description = escapeIcsText(descParts.join('\n').slice(0, 7500));
    const uid = escapeIcsText(stableUid(row, userId));
    const seq = String(icsSequenceFromRow(row));
    const stamp = formatUtcDateTime(new Date());
    let dtStartLine;
    let dtEndLine;
    if (row.all_day) {
        const endExclusive = new Date(startDt.getTime());
        endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
        dtStartLine = `DTSTART;VALUE=DATE:${isoDateUtc(startDt)}`;
        dtEndLine = `DTEND;VALUE=DATE:${isoDateUtc(endExclusive)}`;
    }
    else {
        dtStartLine = `DTSTART:${formatUtcDateTime(startDt)}`;
        dtEndLine = `DTEND:${formatUtcDateTime(endDt)}`;
    }
    let veventStatus;
    if (row.status === 'CANCELLED')
        veventStatus = 'STATUS:CANCELLED';
    else if (row.status === 'TENTATIVE')
        veventStatus = 'STATUS:TENTATIVE';
    else
        veventStatus = 'STATUS:CONFIRMED';
    const lines = [
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
async function selectICloudSyncMeta(connectionId, agendaItemId) {
    const res = await (0, database_1.query)(`
    SELECT external_uid, etag
    FROM agenda_item_sync_state
    WHERE connection_id = $1 AND agenda_item_id = $2
    LIMIT 1
    `, [connectionId, agendaItemId]);
    const r = res.rows[0];
    if (!r || typeof r.external_uid !== 'string')
        return undefined;
    return {
        externalUrl: r.external_uid,
        etag: typeof r.etag === 'string' && r.etag ? r.etag : null,
    };
}
async function upsertICloudSyncRow(connectionId, agendaItemId, externalUrl, etag) {
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
    `, [agendaItemId, connectionId, externalUrl, etag ?? null]);
}
async function flagICloudSyncSqlError(connectionId, agendaItemId, message) {
    await (0, database_1.query)(`
    UPDATE agenda_item_sync_state SET
      last_error = $3,
      updated_at = CURRENT_TIMESTAMP
    WHERE connection_id = $1 AND agenda_item_id = $2
    `, [connectionId, agendaItemId, message.slice(0, 750)]);
}
async function syncAgendaItemToICloudCalDav(userId, agendaItemId) {
    const row = await (0, agendaService_1.fetchAgendaItemRow)(userId, agendaItemId);
    if (!row || !row.sync_to_external)
        return;
    const loaded = await (0, agendaICloudCaldavService_1.loadICloudDavClientForPush)(userId);
    if (!loaded)
        return;
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
    }
    catch (e) {
        const msg = typeof e?.message === 'string'
            ? e.message
            : String(e ?? 'CalDAV');
        console.warn('iCloud CalDAV push failed', userId, agendaItemId, msg);
        await (0, agendaICloudCaldavService_1.recordICloudConnectionError)(userId, msg);
        await flagICloudSyncSqlError(connectionId, agendaItemId, msg).catch(() => undefined);
    }
}
async function removeAgendaItemFromICloudCalDav(userId, agendaItemId) {
    const loaded = await (0, agendaICloudCaldavService_1.loadICloudDavClientForMaintenance)(userId);
    const res = await (0, database_1.query)(`
    SELECT s.external_uid, s.etag
    FROM agenda_item_sync_state s
    INNER JOIN agenda_provider_connections c ON c.id = s.connection_id
    WHERE s.agenda_item_id = $1
      AND c.user_id = $2
      AND c.provider = $3
    `, [agendaItemId, userId, PROVIDER_ICLOUD]);
    if (res.rows.length === 0 || !loaded)
        return;
    for (const r of res.rows) {
        if (!r.external_uid)
            continue;
        try {
            const del = await loaded.client.deleteObject({
                url: r.external_uid,
                etag: r.etag ?? undefined,
            });
            if (!del.ok && del.status !== 404 && del.status !== 410) {
                console.warn('iCloud CalDAV delete non-404', del.status, await respErrorHint(del));
            }
        }
        catch (e) {
            const msg = typeof e?.message === 'string' ? e.message : '';
            console.warn('iCloud CalDAV delete failed', msg || e);
        }
    }
}
function enqueueAgendaICloudCaldavSync(userId, agendaItemId) {
    void syncAgendaItemToICloudCalDav(userId, agendaItemId).catch((err) => console.error('enqueue agenda icloud caldav sync', err));
}
//# sourceMappingURL=agendaICloudPushService.js.map