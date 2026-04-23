/**
 * Fecha de calendario local como YYYY-MM-DD. Evita `toISOString().split('T')[0]`, que usa UTC y puede
 * cambiar el día según la zona horaria del servidor o del cliente.
 */
export declare function dateToYmdLocal(d: Date): string;
/**
 * DATE / TIMESTAMP de Postgres (objeto Date o string) → YYYY-MM-DD estable para JSON y comparaciones.
 */
export declare function toYmdFromPgDate(value: unknown): string;
/**
 * Get user timezone from database
 */
export declare const getUserTimezone: (userId: number) => Promise<string>;
/**
 * Format date to ISO string in user's timezone
 * This ensures dates are consistent between backend and frontend
 */
export declare const formatDateForTimezone: (date: Date | string, timezone: string) => string;
/**
 * Parse date string considering user timezone
 * This helps avoid timezone shifts when parsing dates
 */
export declare const parseDateInTimezone: (dateString: string, timezone: string) => Date;
/**
 * Calculate recurring dates based on frequency and start date (interval-based).
 * @param startDate - Anchor date for the recurring income (first occurrence reference)
 * @param frequency - DAILY, WEEKLY, BIWEEKLY (every 14 days)
 * @param endDate - End of the projection window (inclusive)
 */
export declare const calculateRecurringDates: (startDate: Date, frequency: string, endDate: Date) => string[];
/** Quincenal (semi-monthly): día 15 y día 30 o último día del mes si es menor (p. ej. febrero). */
export declare const calculateSemiMonthlyRecurringDates: (periodStart: Date, periodEnd: Date) => string[];
/** Ingreso anual fijo: misma fecha calendario cada año en el rango. */
/** Cada 3 meses desde la fecha ancla (mismo día del mes cuando aplica). */
export declare const calculateQuarterlyRecurringDates: (anchor: Date, periodStart: Date, periodEnd: Date) => string[];
/** Cada 6 meses desde la fecha ancla. */
export declare const calculateSemiAnnualRecurringDates: (anchor: Date, periodStart: Date, periodEnd: Date) => string[];
export declare const calculateAnnualRecurringDates: (anchor: Date, periodStart: Date, periodEnd: Date) => string[];
export type FixedIncomeRow = {
    frequency: string | null;
    receipt_day?: number | null;
    date?: unknown;
};
/**
 * Fechas de ocurrencia de un ingreso fijo en [periodStart, periodEnd] (inclusive).
 * Cubre: MONTHLY, DAILY, WEEKLY, BIWEEKLY, SEMI_MONTHLY, ANNUAL.
 */
export declare const getFixedIncomeOccurrenceDates: (row: FixedIncomeRow, periodStart: Date, periodEnd: Date) => string[];
/**
 * Calculate recurring dates for monthly income based on receipt_day
 * @param receiptDay - Day of month (1-31)
 * @param startDate - Start of period
 * @param endDate - End of period
 * @returns Array of dates (as ISO strings) when the income occurs
 */
export declare const calculateMonthlyRecurringDates: (receiptDay: number, startDate: Date, endDate: Date) => string[];
export type ExpenseScheduleRow = {
    frequency: string | null;
    payment_day?: number | null;
    payment_month?: number | null;
    date?: unknown;
};
/**
 * Fechas en [periodStart, periodEnd] donde aplica un gasto recurrente.
 * Mensual: payment_day; anual: payment_month + payment_day; el resto: misma lógica que ingresos fijos.
 */
export declare function getExpenseOccurrenceDatesInPeriod(row: ExpenseScheduleRow, periodStart: Date, periodEnd: Date): string[];
//# sourceMappingURL=dateUtils.d.ts.map