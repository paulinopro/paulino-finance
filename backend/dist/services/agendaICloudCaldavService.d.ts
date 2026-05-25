import type { DAVCalendar } from 'tsdav';
import { createDAVClient } from 'tsdav';
export interface ICloudWritableCalRow {
    id: string;
    summary: string;
    primary: boolean;
}
export declare function recordICloudConnectionError(userId: number, message: string): Promise<void>;
/** Normaliza href de colección CalDAV para comparar (origen + path sin barra final). */
export declare function normalizeDavCollectionHref(href: string): string;
/**
 * Cliente + colección DAV destino cuando la conexión está lista para escritura ICS (`CONNECTED`).
 */
export declare function loadICloudDavClientForPush(userId: number): Promise<{
    client: Awaited<ReturnType<typeof createDAVClient>>;
    connectionId: number;
    calendar: DAVCalendar;
} | null>;
/**
 * Misma sesión DAV para mantenimiento (p. ej. borrar ICS) con cuenta en `CONNECTED` u `ERROR`.
 */
export declare function loadICloudDavClientForMaintenance(userId: number): Promise<{
    client: Awaited<ReturnType<typeof createDAVClient>>;
    connectionId: number;
    calendar: DAVCalendar;
} | null>;
/**
 * Lista calendarios con soporte plausible de eventos escriturables.
 * Devuelve `null` si no hay cliente/clave válida o falló la comunicación DAV.
 */
export declare function listICloudWritableCalendars(userId: number): Promise<ICloudWritableCalRow[] | null>;
export declare function setICloudDefaultCalendar(userId: number, calendarUrl: string): Promise<boolean>;
export declare function disconnectICloudCalendar(userId: number): Promise<void>;
/** Conecta o actualiza contraseña; valida contra iCloud y fija destino si hace falta. */
export declare function connectOrUpdateICloudCaldav(userId: number, appleId: string, appPassword: string): Promise<{
    ok: true;
} | {
    ok: false;
    message: string;
    code?: string;
}>;
//# sourceMappingURL=agendaICloudCaldavService.d.ts.map