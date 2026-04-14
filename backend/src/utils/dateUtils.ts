import { query } from '../config/database';

/**
 * Get user timezone from database
 */
export const getUserTimezone = async (userId: number): Promise<string> => {
  try {
    const result = await query('SELECT timezone FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.timezone || 'America/Santo_Domingo';
  } catch (error) {
    console.error('Error getting user timezone:', error);
    return 'America/Santo_Domingo';
  }
};

/**
 * Format date to ISO string in user's timezone
 * This ensures dates are consistent between backend and frontend
 */
export const formatDateForTimezone = (date: Date | string, timezone: string): string => {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  // Create a date string in the user's timezone
  // Using toLocaleString to get the date in the specified timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(dateObj);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  
  return `${year}-${month}-${day}`;
};

/**
 * Parse date string considering user timezone
 * This helps avoid timezone shifts when parsing dates
 */
export const parseDateInTimezone = (dateString: string, timezone: string): Date => {
  // Parse the date string as if it's in the user's timezone
  // Split the date string and create a date object
  const [year, month, day] = dateString.split('-').map(Number);
  
  // Create date in UTC, then adjust for timezone offset
  const date = new Date(Date.UTC(year, month - 1, day));
  
  // Get timezone offset for the specific date
  const tzOffset = getTimezoneOffset(date, timezone);
  
  // Adjust the date by the timezone offset
  return new Date(date.getTime() - tzOffset);
};

/**
 * Get timezone offset in milliseconds for a specific date and timezone
 */
function getTimezoneOffset(date: Date, timezone: string): number {
  // Create a formatter for the timezone
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  
  return tzDate.getTime() - utcDate.getTime();
}

/**
 * Calculate recurring dates based on frequency and start date
 * @param startDate - The starting date for the recurring income/expense
 * @param frequency - 'MONTHLY', 'BIWEEKLY', or 'WEEKLY'
 * @param endDate - The end date of the period to calculate dates for
 * @returns Array of dates (as ISO strings) when the income/expense occurs
 */
export const calculateRecurringDates = (
  startDate: Date,
  frequency: string,
  endDate: Date
): string[] => {
  const dates: string[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  let currentDate = new Date(start);

  if (frequency === 'MONTHLY') {
    // For monthly, use receipt_day logic (day of month)
    // This is handled separately in the calling code
    return dates;
  } else if (frequency === 'BIWEEKLY') {
    // Every 14 days
    while (currentDate <= end) {
      if (currentDate >= start) {
        dates.push(currentDate.toISOString().split('T')[0]);
      }
      currentDate.setDate(currentDate.getDate() + 14);
    }
  } else if (frequency === 'WEEKLY') {
    // Every 7 days
    while (currentDate <= end) {
      if (currentDate >= start) {
        dates.push(currentDate.toISOString().split('T')[0]);
      }
      currentDate.setDate(currentDate.getDate() + 7);
    }
  }

  return dates;
};

/**
 * Calculate recurring dates for monthly income based on receipt_day
 * @param receiptDay - Day of month (1-31)
 * @param startDate - Start of period
 * @param endDate - End of period
 * @returns Array of dates (as ISO strings) when the income occurs
 */
export const calculateMonthlyRecurringDates = (
  receiptDay: number,
  startDate: Date,
  endDate: Date
): string[] => {
  const dates: string[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  let currentDate = new Date(start.getFullYear(), start.getMonth(), 1);

  while (currentDate <= end) {
    // Check if the month has this day
    const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const dayToUse = Math.min(receiptDay, lastDayOfMonth);
    
    const eventDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dayToUse);
    
    if (eventDate >= start && eventDate <= end) {
      dates.push(eventDate.toISOString().split('T')[0]);
    }
    
    // Move to next month
    currentDate.setMonth(currentDate.getMonth() + 1);
  }

  return dates;
};