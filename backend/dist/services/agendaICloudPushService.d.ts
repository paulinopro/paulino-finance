import { type AgendaItemRow } from './agendaService';
/** VCALENDAR único para un evento Agenda (RFC 5545). */
export declare function agendaItemToIcsString(row: AgendaItemRow, userId: number): string;
export declare function syncAgendaItemToICloudCalDav(userId: number, agendaItemId: number): Promise<void>;
export declare function removeAgendaItemFromICloudCalDav(userId: number, agendaItemId: number): Promise<void>;
export declare function enqueueAgendaICloudCaldavSync(userId: number, agendaItemId: number): void;
//# sourceMappingURL=agendaICloudPushService.d.ts.map