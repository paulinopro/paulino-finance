import type { AgendaExternalEventDraft } from './agendaSyncTypes';
export declare function pullICloudAgendaEvents(userId: number, range: {
    fromIso: string;
    toIso: string;
}): Promise<{
    events: AgendaExternalEventDraft[];
    errors: string[];
}>;
//# sourceMappingURL=agendaICloudPullService.d.ts.map