"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agendaGoogleOAuthEnvConfigured = agendaGoogleOAuthEnvConfigured;
exports.agendaFrontendBaseUrl = agendaFrontendBaseUrl;
exports.buildOAuth2Client = buildOAuth2Client;
exports.buildGoogleAuthorizeUrl = buildGoogleAuthorizeUrl;
exports.persistGoogleOAuthTokens = persistGoogleOAuthTokens;
exports.disconnectGoogleCalendar = disconnectGoogleCalendar;
exports.loadGoogleOAuthForUser = loadGoogleOAuthForUser;
exports.recordGoogleConnectionError = recordGoogleConnectionError;
exports.listGoogleWritableCalendars = listGoogleWritableCalendars;
exports.setGoogleDefaultCalendar = setGoogleDefaultCalendar;
const googleapis_1 = require("googleapis");
const database_1 = require("../config/database");
const agendaTokenVault_1 = require("./agendaTokenVault");
const jwt_1 = require("../utils/jwt");
const PROVIDER_GOOGLE = 'GOOGLE_CALENDAR';
function agendaGoogleOAuthEnvConfigured() {
    return !!(process.env.AGENDA_GOOGLE_CLIENT_ID &&
        process.env.AGENDA_GOOGLE_CLIENT_SECRET &&
        process.env.AGENDA_GOOGLE_REDIRECT_URI);
}
/** Origen público donde el usuario navega después del OAuth (SPA). */
function agendaFrontendBaseUrl() {
    const raw = process.env.AGENDA_FRONTEND_ORIGIN || process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
    return raw.replace(/\/+$/, '');
}
function buildOAuth2Client() {
    const clientId = process.env.AGENDA_GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.AGENDA_GOOGLE_CLIENT_SECRET || '';
    const redirectUri = process.env.AGENDA_GOOGLE_REDIRECT_URI || '';
    return new googleapis_1.google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
/**
 * Paso 1 OAuth: usuario autenticado pide esta URL con Bearer y navega ahí manualmente,
 * y Google devuelve a `AGENDA_GOOGLE_REDIRECT_URI`.
 */
function buildGoogleAuthorizeUrl(userId) {
    const client = buildOAuth2Client();
    const state = (0, jwt_1.signGoogleAgendaOAuthState)(userId);
    const authorizationUrl = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        state,
        scope: ['https://www.googleapis.com/auth/calendar'].join(' '),
    });
    return { authorizationUrl, state };
}
async function fetchGooglePrimaryEmail(accessToken) {
    try {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!r.ok)
            return undefined;
        const j = (await r.json());
        return typeof j.email === 'string' ? j.email : undefined;
    }
    catch {
        return undefined;
    }
}
async function selectExistingEncryptedRefresh(userId) {
    const res = await (0, database_1.query)(`
    SELECT oauth_refresh_token FROM agenda_provider_connections
    WHERE user_id = $1 AND provider = $2
    `, [userId, PROVIDER_GOOGLE]);
    const enc = res.rows[0]?.oauth_refresh_token;
    return typeof enc === 'string' ? enc : undefined;
}
/**
 * Persiste tokens tras callback OAuth — conserva refresh cifrado si Google no envía uno nuevo.
 */
async function persistGoogleOAuthTokens(opts) {
    const { userId, tokens } = opts;
    let encRefresh = await selectExistingEncryptedRefresh(userId);
    if (tokens.refresh_token) {
        encRefresh = (0, agendaTokenVault_1.encryptAgendaSecret)(tokens.refresh_token);
    }
    else if (encRefresh != null && !encRefresh.startsWith('v1:')) {
        encRefresh = (0, agendaTokenVault_1.encryptAgendaSecret)(encRefresh);
    }
    let encAccess = null;
    if (tokens.access_token) {
        encAccess = (0, agendaTokenVault_1.encryptAgendaSecret)(tokens.access_token);
    }
    const expiry = tokens.expiry_date != null ? new Date(Number(tokens.expiry_date)).toISOString() : null;
    let accountLabel;
    if (tokens.access_token) {
        accountLabel = await fetchGooglePrimaryEmail(tokens.access_token);
    }
    await (0, database_1.query)(`
    INSERT INTO agenda_provider_connections (
      user_id, provider, account_label,
      oauth_access_token, oauth_refresh_token, token_expires_at,
      external_default_calendar_id, sync_direction, status,
      last_error, meta, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, COALESCE(NULLIF(trim($7::text), ''), 'primary'),
      'OUTBOUND_ONLY', 'CONNECTED', NULL,
      '{"google":true}'::jsonb,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (user_id, provider) DO UPDATE SET
      account_label = COALESCE(EXCLUDED.account_label, agenda_provider_connections.account_label),
      oauth_access_token = EXCLUDED.oauth_access_token,
      oauth_refresh_token = COALESCE(EXCLUDED.oauth_refresh_token, agenda_provider_connections.oauth_refresh_token),
      token_expires_at = EXCLUDED.token_expires_at,
      external_default_calendar_id = CASE
        WHEN agenda_provider_connections.external_default_calendar_id IS NULL
          OR agenda_provider_connections.external_default_calendar_id = ''
        THEN COALESCE(EXCLUDED.external_default_calendar_id, 'primary')
        ELSE agenda_provider_connections.external_default_calendar_id
      END,
      status = 'CONNECTED',
      last_error = NULL,
      meta = COALESCE(agenda_provider_connections.meta, '{}'::jsonb) || COALESCE(EXCLUDED.meta, '{}'::jsonb),
      updated_at = CURRENT_TIMESTAMP
    `, [
        userId,
        PROVIDER_GOOGLE,
        accountLabel ?? null,
        encAccess,
        encRefresh ?? null,
        expiry,
        'primary',
    ]);
    /** Si no hay refresh cifrado, la conexión no sirve offline */
    if (!encRefresh) {
        await (0, database_1.query)(`
      UPDATE agenda_provider_connections SET
        status = 'ERROR',
        last_error = $3,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND provider = $2
      `, [userId, PROVIDER_GOOGLE, 'Sin refresh_token OAuth; vuelva a conceder consentimiento offline.']);
    }
}
async function disconnectGoogleCalendar(userId) {
    await (0, database_1.query)(`DELETE FROM agenda_provider_connections WHERE user_id = $1 AND provider = $2`, [
        userId,
        PROVIDER_GOOGLE,
    ]);
}
async function loadGoogleOAuthForUser(userId) {
    const res = await (0, database_1.query)(`
    SELECT id, oauth_refresh_token, external_default_calendar_id, status
    FROM agenda_provider_connections
    WHERE user_id = $1 AND provider = $2 AND status IN ('CONNECTED', 'ERROR')
    LIMIT 1
    `, [userId, PROVIDER_GOOGLE]);
    const row = res.rows[0];
    if (!row)
        return null;
    if (!row.oauth_refresh_token) {
        throw new Error('Google Calendar connection has no refresh token');
    }
    const decryptedRefresh = (0, agendaTokenVault_1.decryptAgendaSecret)(row.oauth_refresh_token);
    if (!decryptedRefresh) {
        throw new Error('Google Calendar refresh token could not be decrypted');
    }
    const client = buildOAuth2Client();
    client.setCredentials({ refresh_token: decryptedRefresh });
    const calendarId = row.external_default_calendar_id && row.external_default_calendar_id.trim()
        ? row.external_default_calendar_id.trim()
        : 'primary';
    return { client, connectionId: row.id, calendarId };
}
/** Marca error en conexión para que el usuario lo vea en UI (sin crashear la petición HTTP). */
async function recordGoogleConnectionError(userId, message) {
    await (0, database_1.query)(`
    UPDATE agenda_provider_connections SET
      last_error = $3,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND provider = $2
    `, [userId, PROVIDER_GOOGLE, message.slice(0, 1000)]);
}
/** Calendarios donde el usuario puede crear/editar eventos (`writer`/`owner`). */
async function listGoogleWritableCalendars(userId) {
    const loaded = await loadGoogleOAuthForUser(userId);
    if (!loaded)
        return null;
    try {
        const cal = googleapis_1.google.calendar({ version: 'v3', auth: loaded.client });
        const resp = await cal.calendarList.list({
            minAccessRole: 'writer',
            maxResults: 250,
            showDeleted: false,
        });
        const items = resp.data.items || [];
        const out = [];
        for (const x of items) {
            const id = typeof x.id === 'string' ? x.id : '';
            if (!id || !['owner', 'writer'].includes(String(x.accessRole || '')))
                continue;
            const summary = (x.summaryOverride ||
                x.summary ||
                (x.primary ? 'Primary' : id)).slice(0, 500);
            out.push({ id, summary, primary: Boolean(x.primary) });
        }
        out.sort((a, b) => Number(b.primary) - Number(a.primary) || a.summary.localeCompare(b.summary, undefined, { sensitivity: 'base' }));
        return out;
    }
    catch (e) {
        console.error('listGoogleWritableCalendars', e);
        return null;
    }
}
/** Establece el calendario en el que Agenda inserta sincronización saliente. */
async function setGoogleDefaultCalendar(userId, calendarId) {
    const trimmed = calendarId.trim().slice(0, 512);
    if (!trimmed)
        return false;
    const res = await (0, database_1.query)(`
    UPDATE agenda_provider_connections SET
      external_default_calendar_id = $3,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND provider = $2 AND status IN ('CONNECTED','ERROR')
    RETURNING id
    `, [userId, PROVIDER_GOOGLE, trimmed]);
    return (res.rows?.length ?? 0) > 0;
}
//# sourceMappingURL=agendaGoogleOAuthService.js.map