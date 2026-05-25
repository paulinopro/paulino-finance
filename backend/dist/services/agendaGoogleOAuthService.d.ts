import type { OAuth2Client } from 'google-auth-library';
export declare function agendaGoogleOAuthEnvConfigured(): boolean;
/** Origen público donde el usuario navega después del OAuth (SPA). */
export declare function agendaFrontendBaseUrl(): string;
export declare function buildOAuth2Client(): OAuth2Client;
export interface GoogleAuthorizeStart {
    authorizationUrl: string;
    state: string;
}
/**
 * Paso 1 OAuth: usuario autenticado pide esta URL con Bearer y navega ahí manualmente,
 * y Google devuelve a `AGENDA_GOOGLE_REDIRECT_URI`.
 */
export declare function buildGoogleAuthorizeUrl(userId: number): GoogleAuthorizeStart;
/**
 * Persiste tokens tras callback OAuth — conserva refresh cifrado si Google no envía uno nuevo.
 */
export declare function persistGoogleOAuthTokens(opts: {
    userId: number;
    tokens: {
        access_token?: string | null;
        refresh_token?: string | null;
        expiry_date?: number | null;
    };
}): Promise<void>;
export declare function disconnectGoogleCalendar(userId: number): Promise<void>;
export interface LoadedGoogleOAuthClient {
    client: OAuth2Client;
    connectionId: number;
    calendarId: string;
}
export declare function loadGoogleOAuthForUser(userId: number): Promise<LoadedGoogleOAuthClient | null>;
/** Marca error en conexión para que el usuario lo vea en UI (sin crashear la petición HTTP). */
export declare function recordGoogleConnectionError(userId: number, message: string): Promise<void>;
export interface GoogleWritableCalendarRow {
    id: string;
    summary: string;
    primary: boolean;
}
/** Calendarios donde el usuario puede crear/editar eventos (`writer`/`owner`). */
export declare function listGoogleWritableCalendars(userId: number): Promise<GoogleWritableCalendarRow[] | null>;
/** Establece el calendario en el que Agenda inserta sincronización saliente. */
export declare function setGoogleDefaultCalendar(userId: number, calendarId: string): Promise<boolean>;
//# sourceMappingURL=agendaGoogleOAuthService.d.ts.map