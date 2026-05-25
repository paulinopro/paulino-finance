import type { DAVCalendar } from 'tsdav';
import { createDAVClient } from 'tsdav';
import { query } from '../config/database';
import { decryptAgendaSecret, encryptAgendaSecret } from './agendaTokenVault';

const PROVIDER_ICLOUD = 'ICLOUD_CALDAV';
/** Raíz conocida para CalDAV Apple; el cliente DAV resuelve el principal/usuario. */
const ICLOUD_CALDAV_ORIGIN = 'https://caldav.icloud.com/';

/** Tiempo máximo por petición a iCloud durante conexión o listados. */
const DAV_FETCH_TIMEOUT_MS = Number(process.env.AGENDA_ICLOUD_DAV_TIMEOUT_MS || 45000);

function davFetchDefaults(): RequestInit {
  const Ms = Math.max(5000, DAV_FETCH_TIMEOUT_MS);
  const AS = AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal;
  };
  if (typeof AS.timeout === 'function') {
    try {
      return { signal: AS.timeout(Ms) };
    } catch {
      /* fallthrough */
    }
  }
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(), Ms);
  const unref = (tid as { unref?: () => void }).unref;
  if (typeof unref === 'function') unref.call(tid);
  return { signal: ac.signal };
}

export interface ICloudWritableCalRow {
  id: string;
  summary: string;
  primary: boolean;
}

function normalizedAppPassword(raw: string): string {
  return raw.replace(/\s+/g, '').trim();
}

function calendarDisplayName(cal: DAVCalendar): string {
  const d = cal.displayName;
  if (typeof d === 'string' && d.trim()) return d.trim().slice(0, 500);
  if (d && typeof d === 'object' && '_' in d && typeof (d as { _?: unknown })._ === 'string') {
    return String((d as { _?: string })._).trim().slice(0, 500);
  }
  try {
    const u = new URL(cal.url);
    const segments = u.pathname.split('/').filter(Boolean);
    return (segments.slice(-2).join('/') || u.pathname || cal.url).slice(0, 500);
  } catch {
    return cal.url.slice(0, 500);
  }
}

/** Calendarios de eventos: iCloud marca `components` cuando la colección puede albergar `VEVENT`. */
function filtersToWritableEventCalendars(cals: DAVCalendar[]): DAVCalendar[] {
  return cals.filter((c) => {
    const comps = c.components;
    const okEvent = Array.isArray(comps) ? comps.some((x) => String(x).toUpperCase() === 'VEVENT') : false;
    if (!okEvent) return false;
    const u = String(c.url).toLowerCase();
    if (/inbox|notification|spam|recent|invitation/i.test(u)) return false;
    return true;
  });
}

async function fetchConnectionRow(userId: number): Promise<
  | {
      id: number;
      oauth_refresh_token: string | null;
      account_label: string | null;
      external_default_calendar_id: string | null;
      status: string;
    }
  | undefined
> {
  const res = await query(
    `
    SELECT id, oauth_refresh_token, account_label, external_default_calendar_id, status
    FROM agenda_provider_connections
    WHERE user_id = $1 AND provider = $2
    `,
    [userId, PROVIDER_ICLOUD]
  );
  return res.rows[0] as typeof res.rows[0] | undefined;
}

async function createClientForAppleId(username: string, passwordPlain: string) {
  return createDAVClient({
    serverUrl: ICLOUD_CALDAV_ORIGIN,
    credentials: { username: username.trim(), password: passwordPlain },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
    fetchOptions: davFetchDefaults(),
  });
}

export async function recordICloudConnectionError(userId: number, message: string): Promise<void> {
  await query(
    `
    UPDATE agenda_provider_connections SET
      status = CASE WHEN status = 'CONNECTED' THEN 'ERROR' ELSE status END,
      last_error = $3,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND provider = $2 AND status IN ('CONNECTED','ERROR')
    `,
    [userId, PROVIDER_ICLOUD, message.slice(0, 1000)]
  );
}

async function decryptStoredPassword(enc: string | null): Promise<string | null> {
  if (!enc) return null;
  return decryptAgendaSecret(enc);
}

/** Normaliza href de colección CalDAV para comparar (origen + path sin barra final). */
export function normalizeDavCollectionHref(href: string): string {
  const t = href.trim();
  if (!t) return '';
  try {
    const u = new URL(t);
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.origin}${path}`.toLowerCase();
  } catch {
    return t.replace(/\/+$/, '').toLowerCase();
  }
}

/**
 * Cliente + colección DAV destino cuando la conexión está lista para escritura ICS (`CONNECTED`).
 */
export async function loadICloudDavClientForPush(userId: number): Promise<{
  client: Awaited<ReturnType<typeof createDAVClient>>;
  connectionId: number;
  calendar: DAVCalendar;
} | null> {
  return loadICloudDavShell(userId, { allowErroredAccount: false });
}

/**
 * Misma sesión DAV para mantenimiento (p. ej. borrar ICS) con cuenta en `CONNECTED` u `ERROR`.
 */
export async function loadICloudDavClientForMaintenance(userId: number): Promise<{
  client: Awaited<ReturnType<typeof createDAVClient>>;
  connectionId: number;
  calendar: DAVCalendar;
} | null> {
  return loadICloudDavShell(userId, { allowErroredAccount: true });
}

async function loadICloudDavShell(
  userId: number,
  opts: { allowErroredAccount: boolean }
): Promise<{
  client: Awaited<ReturnType<typeof createDAVClient>>;
  connectionId: number;
  calendar: DAVCalendar;
} | null> {
  const row = await fetchConnectionRow(userId);
  if (!row) return null;
  if (row.status !== 'CONNECTED') {
    if (!opts.allowErroredAccount || row.status !== 'ERROR') return null;
  }
  const calHref =
    typeof row.external_default_calendar_id === 'string' ? row.external_default_calendar_id.trim() : '';
  if (!calHref) return null;

  const pwd = await decryptStoredPassword(row.oauth_refresh_token);
  const email = typeof row.account_label === 'string' ? row.account_label.trim() : '';
  if (!pwd || !email) return null;

  try {
    const client = await createClientForAppleId(email, pwd);
    const cals = await client.fetchCalendars();
    const want = normalizeDavCollectionHref(calHref);
    const calendar =
      cals.find((c) => normalizeDavCollectionHref(c.url) === want) ??
      cals.find((c) => want.startsWith(normalizeDavCollectionHref(c.url)));
    if (!calendar) return null;
    return { client, connectionId: row.id, calendar };
  } catch (e) {
    const msg =
      typeof (e as { message?: unknown })?.message === 'string'
        ? (e as { message: string }).message
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
export async function listICloudWritableCalendars(userId: number): Promise<ICloudWritableCalRow[] | null> {
  const row = await fetchConnectionRow(userId);
  if (!row || !row.oauth_refresh_token) return null;
  if (row.status !== 'CONNECTED' && row.status !== 'ERROR') return null;
  const pwd = await decryptStoredPassword(row.oauth_refresh_token);
  const email = typeof row.account_label === 'string' ? row.account_label.trim() : '';
  if (!pwd || !email) return null;

  try {
    const client = await createClientForAppleId(email, pwd);
    const cals = await client.fetchCalendars();
    const filtered = filtersToWritableEventCalendars(cals);
    if (filtered.length === 0) return [];
    const sorted = [...filtered].sort((a, b) =>
      calendarDisplayName(a).localeCompare(calendarDisplayName(b), undefined, { sensitivity: 'base' })
    );
    return sorted.map((c, idx) => ({
      id: c.url.slice(0, 512),
      summary: calendarDisplayName(c),
      primary: idx === 0,
    }));
  } catch (e) {
    const msg =
      typeof (e as { message?: unknown })?.message === 'string'
        ? (e as { message: string }).message
        : String(e ?? 'CalDAV');
    console.error('listICloudWritableCalendars', msg);
    await recordICloudConnectionError(userId, msg);
    return null;
  }
}

export async function setICloudDefaultCalendar(userId: number, calendarUrl: string): Promise<boolean> {
  const trimmed = calendarUrl.trim().slice(0, 512);
  if (!trimmed) return false;

  const res = await query(
    `
    UPDATE agenda_provider_connections SET
      external_default_calendar_id = $3,
      last_error = NULL,
      status = 'CONNECTED',
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND provider = $2 AND status IN ('CONNECTED','ERROR')
    RETURNING id
    `,
    [userId, PROVIDER_ICLOUD, trimmed]
  );
  return (res.rows?.length ?? 0) > 0;
}

export async function disconnectICloudCalendar(userId: number): Promise<void> {
  await query(`DELETE FROM agenda_provider_connections WHERE user_id = $1 AND provider = $2`, [
    userId,
    PROVIDER_ICLOUD,
  ]);
}

/** Conecta o actualiza contraseña; valida contra iCloud y fija destino si hace falta. */
export async function connectOrUpdateICloudCaldav(
  userId: number,
  appleId: string,
  appPassword: string
): Promise<{ ok: true } | { ok: false; message: string; code?: string }> {
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
    const sorted = [...filtered].sort((a, b) =>
      calendarDisplayName(a).localeCompare(calendarDisplayName(b), undefined, { sensitivity: 'base' })
    );
    const urlSet = new Set(sorted.map((c) => c.url.slice(0, 512)));
    const fallback = sorted[0]!.url.slice(0, 512);
    const keep =
      previousDefault && urlSet.has(previousDefault.slice(0, 512)) ? previousDefault.slice(0, 512) : fallback;

    const enc = encryptAgendaSecret(pwdNorm);

    await query(
      `
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
      `,
      [userId, PROVIDER_ICLOUD, emailRaw.slice(0, 255), enc, keep]
    );

    return { ok: true };
  } catch (e: unknown) {
    const msg =
      typeof (e as { message?: unknown })?.message === 'string'
        ? (e as { message: string }).message
        : String(e ?? '');
    console.error('connectOrUpdateICloudCaldav', msg || e);

    /** Si ya había una fila, marcar ERROR en lugar de dejar fantasmas */
    if (prevRow) {
      await recordICloudConnectionError(userId, msg || 'Credenciales iCloud no válidas o error de red');
    }

    return {
      ok: false,
      message:
        msg || 'No se pudo validar contra iCloud CalDAV (comprueba Apple ID y contraseña de aplicación).',
      code: 'AGENDA_ICLOUD_CONNECT_FAILED',
    };
  }
}
