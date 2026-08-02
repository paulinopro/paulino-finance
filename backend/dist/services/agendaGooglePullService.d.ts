import { calendar_v3 } from 'googleapis';
import type { AgendaExternalEventDraft } from './agendaSyncTypes';
export declare function googleEventToAgendaDraft(event: calendar_v3.Schema$Event, connectionId: number): AgendaExternalEventDraft | null;
export declare function pullGoogleAgendaEvents(userId: number, range: {
    fromIso: string;
    toIso: string;
}): Promise<{
    events: AgendaExternalEventDraft[];
    errors: string[];
}>;
//# sourceMappingURL=agendaGooglePullService.d.ts.map