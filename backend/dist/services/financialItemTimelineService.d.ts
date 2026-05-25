export declare class TimelineNotFoundError extends Error {
    constructor(message: string);
}
export interface FinancialTimelineEntry {
    id: number;
    eventDate: string;
    amount: number;
    currency: string;
    status: string;
    showOnCalendar: boolean;
    eventType: string;
}
export interface TimelinePaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export interface ExpenseTimelineResult {
    description: string;
    recurrenceType: string;
    nextOccurrenceDate: string | null;
    entries: FinancialTimelineEntry[];
    pagination: TimelinePaginationMeta;
}
export interface IncomeTimelineResult {
    description: string;
    recurrenceType: string;
    nextOccurrenceDate: string | null;
    entries: FinancialTimelineEntry[];
    pagination: TimelinePaginationMeta;
}
export interface TimelineQueryOpts {
    page?: number;
    limit?: number;
    /** Si es false (p. ej. página > 1), no regenera eventos del calendario para este rango. */
    refreshCalendar?: boolean;
}
export declare function buildExpenseTimeline(userId: number, expenseId: number, opts?: TimelineQueryOpts): Promise<ExpenseTimelineResult>;
export declare function buildIncomeTimeline(userId: number, incomeId: number, opts?: TimelineQueryOpts): Promise<IncomeTimelineResult>;
//# sourceMappingURL=financialItemTimelineService.d.ts.map