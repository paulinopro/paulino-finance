export type AgendaKind = 'EVENT' | 'TASK' | 'REMINDER' | 'APPOINTMENT' | 'NOTE';
export type AgendaStatus = 'OPEN' | 'DONE' | 'TENTATIVE' | 'CANCELLED';
export interface AgendaItemRow {
    id: number;
    user_id: number;
    kind: AgendaKind;
    title: string;
    description: string | null;
    starts_at: Date;
    ends_at: Date | null;
    all_day: boolean;
    status: AgendaStatus;
    recurrence_rule: string | null;
    finance_link_type: string | null;
    finance_link_id: number | null;
    metadata: Record<string, unknown>;
    sync_to_external: boolean;
    created_at: Date;
    updated_at: Date;
}
/** Estado conocido por la API del último push saliente (`agenda_item_sync_state`). */
export type OutboundPushHint = 'none' | 'ok' | 'err';
export interface AgendaOutboundSyncHints {
    google: OutboundPushHint;
    icloud: OutboundPushHint;
}
declare function rowToPayload(r: AgendaItemRow, outboundSync?: AgendaOutboundSyncHints): {
    id: number;
    kind: AgendaKind;
    title: string;
    description: string | undefined;
    startsAt: string;
    endsAt: string | undefined;
    allDay: boolean;
    status: AgendaStatus;
    recurrenceRule: string | undefined;
    financeLinkType: string | undefined;
    financeLinkId: number | undefined;
    metadata: Record<string, unknown>;
    syncToExternal: boolean;
    createdAt: string;
    updatedAt: string;
} | {
    outboundSync: AgendaOutboundSyncHints;
    id: number;
    kind: AgendaKind;
    title: string;
    description: string | undefined;
    startsAt: string;
    endsAt: string | undefined;
    allDay: boolean;
    status: AgendaStatus;
    recurrenceRule: string | undefined;
    financeLinkType: string | undefined;
    financeLinkId: number | undefined;
    metadata: Record<string, unknown>;
    syncToExternal: boolean;
    createdAt: string;
    updatedAt: string;
};
export type AgendaItemApiPayload = ReturnType<typeof rowToPayload>;
/** Mapa ítem → hints para Google / iCloud a partir de `agenda_item_sync_state`. */
export declare function fetchOutboundSyncHintsForAgendaItems(userId: number, itemIds: number[]): Promise<Map<number, AgendaOutboundSyncHints>>;
export declare function parseAgendaKind(v: unknown): AgendaKind | null;
export declare function parseAgendaStatus(v: unknown): AgendaStatus | null;
export declare function listAgendaItems(userId: number, opts: {
    fromIso: string;
    toIso: string;
    kinds?: AgendaKind[];
}): Promise<AgendaItemApiPayload[]>;
export declare function fetchAgendaItemRow(userId: number, id: number): Promise<AgendaItemRow | null>;
export declare function getAgendaItem(userId: number, id: number): Promise<AgendaItemApiPayload | null>;
export declare function createAgendaItem(userId: number, body: {
    kind: AgendaKind;
    title: string;
    description?: string | null;
    startsAt: string;
    endsAt?: string | null;
    allDay?: boolean;
    status?: AgendaStatus;
    recurrenceRule?: string | null;
    financeLinkType?: string | null;
    financeLinkId?: number | null;
    metadata?: Record<string, unknown>;
    syncToExternal?: boolean;
}): Promise<AgendaItemApiPayload>;
export declare function updateAgendaItem(userId: number, id: number, patch: Partial<{
    kind: AgendaKind;
    title: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
    allDay: boolean;
    status: AgendaStatus;
    recurrenceRule: string | null;
    financeLinkType: string | null;
    financeLinkId: number | null;
    metadata: Record<string, unknown>;
    syncToExternal: boolean;
}>): Promise<AgendaItemApiPayload | null>;
export declare function deleteAgendaItem(userId: number, id: number): Promise<boolean>;
export interface AgendaConnectionSafe {
    id: number;
    provider: string;
    accountLabel: string | undefined;
    status: string;
    syncDirection: string;
    externalDefaultCalendarId: string | undefined;
    lastError: string | undefined;
    meta: Record<string, unknown>;
}
export declare function listAgendaConnections(userId: number): Promise<AgendaConnectionSafe[]>;
export {};
//# sourceMappingURL=agendaService.d.ts.map