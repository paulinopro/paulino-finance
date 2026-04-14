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
 * Calculate recurring dates based on frequency and start date
 * @param startDate - The starting date for the recurring income/expense
 * @param frequency - 'MONTHLY', 'BIWEEKLY', or 'WEEKLY'
 * @param endDate - The end date of the period to calculate dates for
 * @returns Array of dates (as ISO strings) when the income/expense occurs
 */
export declare const calculateRecurringDates: (startDate: Date, frequency: string, endDate: Date) => string[];
/**
 * Calculate recurring dates for monthly income based on receipt_day
 * @param receiptDay - Day of month (1-31)
 * @param startDate - Start of period
 * @param endDate - End of period
 * @returns Array of dates (as ISO strings) when the income occurs
 */
export declare const calculateMonthlyRecurringDates: (receiptDay: number, startDate: Date, endDate: Date) => string[];
//# sourceMappingURL=dateUtils.d.ts.map