/** Replica el ítem a todos los proveedores externos configurados y conectados. */
export declare function enqueueAgendaOutboundSync(userId: number, agendaItemId: number): void;
/** Borra remotamente antes de eliminar la fila local (`agenda_item_sync_state` cascada). */
export declare function removeAgendaItemFromExternalCalendars(userId: number, agendaItemId: number): Promise<void>;
//# sourceMappingURL=agendaOutboundSync.d.ts.map