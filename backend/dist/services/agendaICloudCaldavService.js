"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordICloudConnectionError = recordICloudConnectionError;
exports.normalizeDavCollectionHref = normalizeDavCollectionHref;
exports.loadICloudDavClientForPush = loadICloudDavClientForPush;
exports.loadICloudDavClientForMaintenance = loadICloudDavClientForMaintenance;
exports.listICloudWritableCalendars = listICloudWritableCalendars;
exports.setICloudDefaultCalendar = setICloudDefaultCalendar;
exports.disconnectICloudCalendar = disconnectICloudCalendar;
exports.connectOrUpdateICloudCaldav = connectOrUpdateICloudCaldav;
const tsdav_1 = require("tsdav");
const database_1 = require("../config/database");
const agendaTokenVault_1 = require("./agendaTokenVault");
const PROVIDER_ICLOUD = 'ICLOUD_CALDAV';
/** Raíz conocida para CalDAV Apple; el cliente DAV resuelve el principal/usuario. */
const ICLOUD_CALDAV_ORIGIN = 'https://caldav.icloud.com/';
/** Tiempo máximo por petición a iCloud durante conexión o listados. */
const DAV_FETCH_TIMEOUT_MS = Number(process.env.AGENDA_ICLOUD_DAV_TIMEOUT_MS || 45000);
function davFetchDefaults() {
    const Ms = Math.max(5000, DAV_FETCH_TIMEOUT_MS);
    const AS = AbortSignal;
    if (typeof AS.timeout === 'function') {
        try {
            return { signal: AS.timeout(Ms) };
        }
        catch {
            /* fallthrough */
        }
    }
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(), Ms);
    const unref = tid.unref;
    if (typeof unref === 'function')
        unref.call(tid);
    return { signal: ac.signal };
}
function normalizedAppPassword(raw) {
    return raw.replace(/\s+/g, '').trim();
}
function calendarDisplayName(cal) {
    const d = cal.displayName;
    if (typeof d === 'string' && d.trim())
        return d.trim().slice(0, 500);
    if (d && typeof d === 'object' && '_' in d && typeof d._ === 'string') {
        return String(d._).trim().slice(0, 500);
    }
    try {
        const u = new URL(cal.url);
        const segments = u.pathname.split('/').filter(Boolean);
        return (segments.slice(-2).join('/') || u.pathname || cal.url).slice(0, 500);
    }
    catch {
        return cal.url.slice(0, 500);
    }
}
/** Calendarios de eventos: iCloud marca `components` cuando la colección puede albergar `VEVENT`. */
function filtersToWritableEventCalendars(cals) {
    return cals.filter((c) => {
        const comps = c.components;
        const okEvent = Array.isArray(comps) ? comps.some((x) => String(x).toUpperCase() === 'VEVENT') : false;
        if (!okEvent)
            return false;
        const u = String(c.url).toLowerCase();
        if (/inbox|notification|spam|recent|invitation/i.test(u))
            return false;
        return true;
    });
}
async function fetchConnectionRow(userId) {
    const res = await (0, database_1.query)(`
    SELECT id, oauth_refresh_token, account_label, external_default_calendar_id, status
    FROM agenda_provider_connections
    WHERE user_id = $1 AND provider = $2
    `, [userId, PROVIDER_ICLOUD]);
    return res.rows[0];
}
async function createClientForAppleId(username, passwordPlain) {
    return (0, tsdav_1.createDAVClient)({
        serverUrl: ICLOUD_CALDAV_ORIGIN,
        credentials: { username: username.trim(), password: passwordPlain },
        authMethod: 'Basic',
        defaultAccountType: 'caldav',
        fetchOptions: davFetchDefaults(),
    });
}
async function recordICloudConnectionError(userId, message) {
    await (0, database_1.query)(`
    UPDATE agenda_provider_connections SET
      status = CASE WHEN status = 'CONNECTED' THEN 'ERROR' ELSE status END,
      last_error = $3,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND provider = $2 AND status IN ('CONNECTED','ERROR')
    `, [userId, PROVIDER_ICLOUD, message.slice(0, 1000)]);
}
async function decryptStoredPassword(enc) {
    if (!enc)
        return null;
    return (0, agendaTokenVault_1.decryptAgendaSecret)(enc);
}
/** Normaliza href de colección CalDAV para comparar (origen + path sin barra final). */
function normalizeDavCollectionHref(href) {
    const t = href.trim();
    if (!t)
        return '';
    try {
        const u = new URL(t);
        const path = u.pathname.replace(/\/+$/, '');
        return `${u.origin}${path}`.toLowerCase();
    }
    catch {
        return t.replace(/\/+$/, '').toLowerCase();
    }
}
/**
 * Cliente + colección DAV destino cuando la conexión está lista para escritura ICS (`CONNECTED`).
 */
async function loadICloudDavClientForPush(userId) {
    return loadICloudDavShell(userId, { allowErroredAccount: false });
}
/**
 * Misma sesión DAV para mantenimiento (p. ej. borrar ICS) con cuenta en `CONNECTED` u `ERROR`.
 */
async function loadICloudDavClientForMaintenance(userId) {
    return loadICloudDavShell(userId, { allowErroredAccount: true });
}
async function loadICloudDavShell(userId, opts) {
    const row = await fetchConnectionRow(userId);
    if (!row)
        return null;
    if (row.status !== 'CONNECTED') {
        if (!opts.allowErroredAccount || row.status !== 'ERROR')
            return null;
    }
    const calHref = typeof row.external_default_calendar_id === 'string' ? row.external_default_calendar_id.trim() : '';
    if (!calHref)
        return null;
    const pwd = await decryptStoredPassword(row.oauth_refresh_token);
    const email = typeof row.account_label === 'string' ? row.account_label.trim() : '';
    if (!pwd || !email)
        return null;
    try {
        const client = await createClientForAppleId(email, pwd);
        const cals = await client.fetchCalendars();
        const want = normalizeDavCollectionHref(calHref);
        const calendar = cals.find((c) => normalizeDavCollectionHref(c.url) === want) ??
            cals.find((c) => want.startsWith(normalizeDavCollectionHref(c.url)));
        if (!calendar)
            return null;
        return { client, connectionId: row.id, calendar };
    }
    catch (e) {
        const msg = typeof e?.message === 'string'
            ? e.message
            : String(e ?? 'CalDAV push load');
        console.error('loadICloudDavShell', msg);
        await recordICloudConnectionError(userId, msg);
        return null;
    }
}
/**
 * Lista calendarios con soporte plausible de eventos escriturables.
 * Devuelve `null` si no hay cliente/clave válida o falló la comunicación DAV.
 */
async function listICloudWritableCalendars(userId) {
    const row = await fetchConnectionRow(userId);
    if (!row || !row.oauth_refresh_token)
        return null;
    if (row.status !== 'CONNECTED' && row.status !== 'ERROR')
        return null;
    const pwd = await decryptStoredPassword(row.oauth_refresh_token);
    const email = typeof row.account_label === 'string' ? row.account_label.trim() : '';
    if (!pwd || !email)
        return null;
    try {
        const client = await createClientForAppleId(email, pwd);
        const cals = await client.fetchCalendars();
        const filtered = filtersToWritableEventCalendars(cals);
        if (filtered.length === 0)
            return [];
        const sorted = [...filtered].sort((a, b) => calendarDisplayName(a).localeCompare(calendarDisplayName(b), undefined, { sensitivity: 'base' }));
        return sorted.map((c, idx) => ({
            id: c.url.slice(0, 512),
            summary: calendarDisplayName(c),
            primary: idx === 0,
        }));
    }
    catch (e) {
        const msg = typeof e?.message === 'string'
            ? e.message
            : String(e ?? 'CalDAV');
        console.error('listICloudWritableCalendars', msg);
        await recordICloudConnectionError(userId, msg);
        return null;
    }
}
async function setICloudDefaultCalendar(userId, calendarUrl) {
    const trimmed = calendarUrl.trim().slice(0, 512);
    if (!trimmed)
        return false;
    const res = await (0, database_1.query)(`
    UPDATE agenda_provider_connections SET
      external_default_calendar_id = $3,
      last_error = NULL,
      status = 'CONNECTED',
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND provider = $2 AND status IN ('CONNECTED','ERROR')
    RETURNING id
    `, [userId, PROVIDER_ICLOUD, trimmed]);
    return (res.rows?.length ?? 0) > 0;
}
async function disconnectICloudCalendar(userId) {
    await (0, database_1.query)(`DELETE FROM agenda_provider_connections WHERE user_id = $1 AND provider = $2`, [
        userId,
        PROVIDER_ICLOUD,
    ]);
}
/** Conecta o actualiza contraseña; valida contra iCloud y fija destino si hace falta. */
async function connectOrUpdateICloudCaldav(userId, appleId, appPassword) {
    const emailRaw = appleId.trim();
    const pwdNorm = normalizedAppPassword(appPassword);
    if (!emailRaw.includes('@') || emailRaw.length < 6) {
        return { ok: false, message: 'Indica un Apple ID con formato de correo.', code: 'AGENDA_ICLOUD_BAD_APPLE_ID' };
    }
    if (pwdNorm.length < 16) {
        return {
            ok: false,
            message: 'La contraseña de app de Apple debe tener al menos 16 caracteres.',
            code: 'AGENDA_ICLOUD_BAD_APP_PASSWORD',
        };
    }
    const prevRow = await fetchConnectionRow(userId);
    const previousDefault = typeof prevRow?.external_default_calendar_id === 'string' ? prevRow.external_default_calendar_id.trim() : '';
    try {
        const client = await createClientForAppleId(emailRaw, pwdNorm);
        const cals = await client.fetchCalendars();
        const filtered = filtersToWritableEventCalendars(cals);
        if (filtered.length === 0) {
            return {
                ok: false,
                message: 'La cuenta respondió pero no se encontraron calendarios de eventos.',
                code: 'AGENDA_ICLOUD_NO_CALENDARS',
            };
        }
        const sorted = [...filtered].sort((a, b) => calendarDisplayName(a).localeCompare(calendarDisplayName(b), undefined, { sensitivity: 'base' }));
        const urlSet = new Set(sorted.map((c) => c.url.slice(0, 512)));
        const fallback = sorted[0].url.slice(0, 512);
        const keep = previousDefault && urlSet.has(previousDefault.slice(0, 512)) ? previousDefault.slice(0, 512) : fallback;
        const enc = (0, agendaTokenVault_1.encryptAgendaSecret)(pwdNorm);
        await (0, database_1.query)(`
      INSERT INTO agenda_provider_connections (
        user_id, provider, account_label,
        oauth_access_token, oauth_refresh_token, token_expires_at,
        external_default_calendar_id, sync_direction, status,
        last_error, meta, updated_at
      )
      VALUES (
        $1, $2, $3,
        NULL, $4, NULL,
        $5, 'OUTBOUND_ONLY', 'CONNECTED',
        NULL, '{"icloud":{"caldav":true}}'::jsonb,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (user_id, provider) DO UPDATE SET
        account_label = EXCLUDED.account_label,
        oauth_refresh_token = EXCLUDED.oauth_refresh_token,
        oauth_access_token = NULL,
        token_expires_at = NULL,
        external_default_calendar_id = EXCLUDED.external_default_calendar_id,
        status = 'CONNECTED',
        last_error = NULL,
        meta = COALESCE(agenda_provider_connections.meta, '{}'::jsonb) || COALESCE(EXCLUDED.meta, '{}'::jsonb),
        updated_at = CURRENT_TIMESTAMP
      `, [userId, PROVIDER_ICLOUD, emailRaw.slice(0, 255), enc, keep]);
        return { ok: true };
    }
    catch (e) {
        const msg = typeof e?.message === 'string'
            ? e.message
            : String(e ?? '');
        console.error('connectOrUpdateICloudCaldav', msg || e);
        /** Si ya había una fila, marcar ERROR en lugar de dejar fantasmas */
        if (prevRow) {
            await recordICloudConnectionError(userId, msg || 'Credenciales iCloud no válidas o error de red');
        }
        return {
            ok: false,
            message: msg || 'No se pudo validar contra iCloud CalDAV (comprueba Apple ID y contraseña de aplicación).',
            code: 'AGENDA_ICLOUD_CONNECT_FAILED',
        };
    }
}
//# sourceMappingURL=agendaICloudCaldavService.js.map