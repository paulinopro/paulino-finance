export interface AgendaSyncResult {
    imported: number;
    updated: number;
    pushed: number;
    deleted: number;
    errors: Array<{
        provider: string;
        message: string;
    }>;
}
export declare function syncAgendaForUser(userId: number): Promise<AgendaSyncResult>;
export declare function syncAgendaImportRange(userId: number, provider: 'GOOGLE_CALENDAR' | 'ICLOUD_CALDAV', fromIso: string, toIso: string): Promise<AgendaSyncResult>;
//# sourceMappingURL=agendaSyncService.d.ts.map