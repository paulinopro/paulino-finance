export interface CalendarEvent {
    id: number;
    eventType: 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'INCOME' | 'EXPENSE' | 'RECURRING_EXPENSE';
    relatedId: number;
    relatedType: string;
    eventDate: string;
    title: string;
    amount: number;
    currency: string;
    status: 'PENDING' | 'PAID' | 'RECEIVED' | 'OVERDUE' | 'CANCELLED';
    isRecurring: boolean;
    recurrencePattern?: string;
    color: string;
    notes?: string;
    /** Metadatos del ingreso/gasto origen (JOIN en GET events). */
    sourceNature?: 'fixed' | 'variable';
    sourceRecurrenceType?: 'recurrent' | 'non_recurrent';
    sourceFrequency?: string | null;
}
/**
 * Deja de mostrar en el calendario financiero las filas ligadas al origen (p. ej. al borrar un ingreso).
 * Los registros permanecen en la base para historial (`show_on_calendar = false`).
 */
export declare function deleteCalendarEventsForRelated(userId: number, relatedId: number, eventTypes: string[]): Promise<void>;
/**
 * Oculta del calendario financiero los eventos cuyo origen ya no existe (mantiene la fila para historial).
 */
export declare function hideOrphanCalendarEvents(userId: number): Promise<number>;
/**
 * Eventos aún huérfanos respecto al origen (el registro fuente no existe).
 * Pueden seguir en historial con show_on_calendar = false.
 */
export declare function listOrphanCalendarEvents(userId: number): Promise<Array<{
    id: number;
    event_type: string;
    related_id: number;
    related_type: string;
    event_date: string;
    title: string;
    amount: string;
    currency: string;
    status: string;
}>>;
/** Eventos archivados: no se muestran en el calendario pero conservan datos para historial. */
export declare const getHiddenCalendarEvents: (userId: number, startDate: string, endDate: string) => Promise<CalendarEvent[]>;
export interface CalendarEventInput {
    eventType: 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'INCOME' | 'EXPENSE' | 'RECURRING_EXPENSE';
    relatedId: number;
    relatedType: string;
    eventDate: string;
    title: string;
    amount: number;
    currency?: string;
    status?: 'PENDING' | 'PAID' | 'RECEIVED' | 'OVERDUE' | 'CANCELLED';
    isRecurring?: boolean;
    recurrencePattern?: string;
    color?: string;
    notes?: string;
}
/**
 * Get calendar events for a date range
 */
export declare const getCalendarEvents: (userId: number, startDate: string, endDate: string, filters?: {
    eventTypes?: string[];
    status?: string[];
    showPaid?: boolean;
}) => Promise<CalendarEvent[]>;
/**
 * Generate calendar events from existing financial data
 */
export declare const generateCalendarEvents: (userId: number, startDate: string, endDate: string) => Promise<{
    orphansHidden: number;
}>;
/**
 * Update event status
 */
export declare const updateEventStatus: (userId: number, eventId: number, status: "PENDING" | "PAID" | "RECEIVED" | "OVERDUE" | "CANCELLED", opts?: {
    actualAmount?: number | string | null;
}) => Promise<CalendarEvent | null>;
/**
 * Get financial summary for a date range
 */
export declare const getFinancialSummary: (userId: number, startDate: string, endDate: string) => Promise<{
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    pendingPayments: number;
    overduePayments: number;
    /** Todos los totales expresados en moneda principal (conversión con tasa del usuario / API). */
    displayCurrency: string;
}>;
//# sourceMappingURL=calendarService.d.ts.map