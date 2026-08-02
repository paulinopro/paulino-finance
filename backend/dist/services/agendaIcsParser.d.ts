export interface ParsedAgendaVEvent {
    externalUid: string;
    title: string;
    description: string | null;
    location: string | null;
    startsAt: string;
    endsAt: string | null;
    allDay: boolean;
    recurrenceRule: string | null;
    externalUpdatedAt: string | null;
    deleted: boolean;
}
export declare function parseFirstVEvent(raw: string): ParsedAgendaVEvent | null;
//# sourceMappingURL=agendaIcsParser.d.ts.map