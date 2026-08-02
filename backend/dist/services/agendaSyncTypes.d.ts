export type AgendaSyncProvider = 'LOCAL' | 'GOOGLE_CALENDAR' | 'ICLOUD_CALDAV';
export interface AgendaVersionStamp {
    source: string;
    updatedAt: string | Date | null | undefined;
}
export interface AgendaExternalEventDraft {
    provider: Exclude<AgendaSyncProvider, 'LOCAL'>;
    connectionId: number;
    externalUid: string;
    etag?: string | null;
    title: string;
    description?: string | null;
    location?: string | null;
    startsAt: string;
    endsAt?: string | null;
    allDay: boolean;
    status?: 'OPEN' | 'DONE' | 'TENTATIVE' | 'CANCELLED';
    recurrenceRule?: string | null;
    externalUpdatedAt?: string | null;
    deleted?: boolean;
}
export declare function chooseLatestAgendaVersion<T extends AgendaVersionStamp>(local: T, external: T): T;
//# sourceMappingURL=agendaSyncTypes.d.ts.map