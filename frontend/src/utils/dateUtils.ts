/**
 * Format date using user's timezone
 * The dateString should be in format YYYY-MM-DD
 */
export const formatDateInTimezone = (dateString: string, timezone: string = 'America/Santo_Domingo'): string => {
  // Validate date string
  if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
    console.warn('formatDateInTimezone: Invalid date string', dateString);
    return 'Fecha inválida';
  }
  
  // Trim whitespace
  const trimmedDate = dateString.trim();
  
  // Parse the date string directly to avoid timezone shifts
  // dateString is already in YYYY-MM-DD format from backend
  const parts = trimmedDate.split('-');
  if (parts.length !== 3) {
    console.warn('formatDateInTimezone: Invalid date format', dateString);
    return trimmedDate; // Return original if can't parse
  }
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  
  // Validate parsed values
  if (isNaN(year) || isNaN(month) || isNaN(day) || 
      year < 1900 || year > 2100 || 
      month < 1 || month > 12 || 
      day < 1 || day > 31) {
    console.warn('formatDateInTimezone: Invalid date values', { year, month, day, dateString });
    return trimmedDate; // Return original if invalid
  }
  
  // Create a date object in UTC to avoid timezone shifts
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  
  // Validate the date object
  if (isNaN(date.getTime())) {
    console.warn('formatDateInTimezone: Invalid date object created', { year, month, day, dateString });
    return `${day}/${month}/${year}`; // Fallback to simple format
  }
  
  try {
    const formatted = new Intl.DateTimeFormat('es-DO', {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
    return formatted;
  } catch (error) {
    console.warn('formatDateInTimezone: Error formatting date', error, { dateString, timezone });
    // Fallback to simple format if timezone formatting fails
    return `${day}/${month}/${year}`;
  }
};

/**
 * Format date for input fields (YYYY-MM-DD) using user's timezone
 */
export const formatDateForInput = (dateString: string, timezone: string = 'America/Santo_Domingo'): string => {
  const date = new Date(dateString + 'T00:00:00');
  
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  return formatter.format(date);
};
