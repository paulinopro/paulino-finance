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
}
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
export declare const generateCalendarEvents: (userId: number, startDate: string, endDate: string) => Promise<void>;
/**
 * Update event status
 */
export declare const updateEventStatus: (userId: number, eventId: number, status: "PENDING" | "PAID" | "RECEIVED" | "OVERDUE" | "CANCELLED") => Promise<CalendarEvent | null>;
/**
 * Get financial summary for a date range
 */
export declare const getFinancialSummary: (userId: number, startDate: string, endDate: string) => Promise<{
    totalIncome: number;
    totalExpenses: number;
    balance: number;
    pendingPayments: number;
    overduePayments: number;
}>;
//# sourceMappingURL=calendarService.d.ts.map