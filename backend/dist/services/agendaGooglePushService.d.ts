import type { calendar_v3 } from 'googleapis';
import type { AgendaItemRow } from './agendaService';
/** Construye cuerpo de evento Calendar API v3 a partir del ítem local. */
export declare function agendaItemToGoogleEvent(row: AgendaItemRow): calendar_v3.Schema$Event;
export declare function syncAgendaItemToGoogleCalendar(userId: number, agendaItemId: number): Promise<void>;
export declare function removeAgendaItemFromGoogleCalendar(userId: number, agendaItemId: number): Promise<void>;
export declare function enqueueAgendaGoogleCalendarSync(userId: number, agendaItemId: number): void;
//# sourceMappingURL=agendaGooglePushService.d.ts.map