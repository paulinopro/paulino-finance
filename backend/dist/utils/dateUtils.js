"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateMonthlyRecurringDates = exports.getFixedIncomeOccurrenceDates = exports.calculateAnnualRecurringDates = exports.calculateSemiAnnualRecurringDates = exports.calculateQuarterlyRecurringDates = exports.calculateSemiMonthlyRecurringDates = exports.calculateRecurringDates = exports.parseDateInTimezone = exports.formatDateForTimezone = exports.getUserTimezone = void 0;
exports.dateToYmdLocal = dateToYmdLocal;
exports.toYmdFromPgDate = toYmdFromPgDate;
exports.getExpenseOccurrenceDatesInPeriod = getExpenseOccurrenceDatesInPeriod;
const database_1 = require("../config/database");
const incomeExpenseTaxonomy_1 = require("../constants/incomeExpenseTaxonomy");
/**
 * Fecha de calendario local como YYYY-MM-DD. Evita `toISOString().split('T')[0]`, que usa UTC y puede
 * cambiar el día según la zona horaria del servidor o del cliente.
 */
function dateToYmdLocal(d) {
    if (!(d instanceof Date) || isNaN(d.getTime()))
        return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
/**
 * DATE / TIMESTAMP de Postgres (objeto Date o string) → YYYY-MM-DD estable para JSON y comparaciones.
 */
function toYmdFromPgDate(value) {
    if (value == null || value === '')
        return '';
    if (value instanceof Date)
        return dateToYmdLocal(value);
    const s = String(value).trim();
    const head = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (head)
        return head[1];
    const t = Date.parse(s);
    if (!isNaN(t))
        return dateToYmdLocal(new Date(t));
    return '';
}
/**
 * Get user timezone from database
 */
const getUserTimezone = async (userId) => {
    try {
        const result = await (0, database_1.query)('SELECT timezone FROM users WHERE id = $1', [userId]);
        return result.rows[0]?.timezone || 'America/Santo_Domingo';
    }
    catch (error) {
        console.error('Error getting user timezone:', error);
        return 'America/Santo_Domingo';
    }
};
exports.getUserTimezone = getUserTimezone;
/**
 * Format date to ISO string in user's timezone
 * This ensures dates are consistent between backend and frontend
 */
const formatDateForTimezone = (date, timezone) => {
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
exports.formatDateForTimezone = formatDateForTimezone;
/**
 * Parse date string considering user timezone
 * This helps avoid timezone shifts when parsing dates
 */
const parseDateInTimezone = (dateString, timezone) => {
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
exports.parseDateInTimezone = parseDateInTimezone;
/**
 * Get timezone offset in milliseconds for a specific date and timezone
 */
function getTimezoneOffset(date, timezone) {
    // Create a formatter for the timezone
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    return tzDate.getTime() - utcDate.getTime();
}
/**
 * Calculate recurring dates based on frequency and start date (interval-based).
 * @param startDate - Anchor date for the recurring income (first occurrence reference)
 * @param frequency - DAILY, WEEKLY, BIWEEKLY (every 14 days)
 * @param endDate - End of the projection window (inclusive)
 */
const calculateRecurringDates = (startDate, frequency, endDate) => {
    const dates = [];
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    let currentDate = new Date(start);
    const stepDays = frequency === 'DAILY' ? 1 : frequency === 'WEEKLY' ? 7 : frequency === 'BIWEEKLY' ? 14 : 0;
    if (stepDays <= 0) {
        return dates;
    }
    while (currentDate <= end) {
        if (currentDate >= start) {
            dates.push(dateToYmdLocal(currentDate));
        }
        currentDate.setDate(currentDate.getDate() + stepDays);
    }
    return dates;
};
exports.calculateRecurringDates = calculateRecurringDates;
/** Quincenal (semi-monthly): día 15 y día 30 o último día del mes si es menor (p. ej. febrero). */
const calculateSemiMonthlyRecurringDates = (periodStart, periodEnd) => {
    const dates = [];
    const start = new Date(periodStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(periodEnd);
    end.setHours(23, 59, 59, 999);
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
        const y = cur.getFullYear();
        const m = cur.getMonth();
        const lastDay = new Date(y, m + 1, 0).getDate();
        const secondDay = Math.min(30, lastDay);
        for (const d of [15, secondDay]) {
            const eventDate = new Date(y, m, d);
            if (eventDate >= start && eventDate <= end) {
                dates.push(dateToYmdLocal(eventDate));
            }
        }
        cur.setMonth(cur.getMonth() + 1);
    }
    return [...new Set(dates)].sort();
};
exports.calculateSemiMonthlyRecurringDates = calculateSemiMonthlyRecurringDates;
/** Ingreso anual fijo: misma fecha calendario cada año en el rango. */
/** Cada 3 meses desde la fecha ancla (mismo día del mes cuando aplica). */
const calculateQuarterlyRecurringDates = (anchor, periodStart, periodEnd) => {
    const dates = [];
    const a = new Date(anchor);
    if (isNaN(a.getTime()))
        return dates;
    const start = new Date(periodStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(periodEnd);
    end.setHours(23, 59, 59, 999);
    let cur = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    cur.setHours(0, 0, 0, 0);
    while (cur < start) {
        cur.setMonth(cur.getMonth() + 3);
    }
    while (cur <= end) {
        dates.push(dateToYmdLocal(cur));
        cur.setMonth(cur.getMonth() + 3);
    }
    return dates;
};
exports.calculateQuarterlyRecurringDates = calculateQuarterlyRecurringDates;
/** Cada 6 meses desde la fecha ancla. */
const calculateSemiAnnualRecurringDates = (anchor, periodStart, periodEnd) => {
    const dates = [];
    const a = new Date(anchor);
    if (isNaN(a.getTime()))
        return dates;
    const start = new Date(periodStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(periodEnd);
    end.setHours(23, 59, 59, 999);
    let cur = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    cur.setHours(0, 0, 0, 0);
    while (cur < start) {
        cur.setMonth(cur.getMonth() + 6);
    }
    while (cur <= end) {
        dates.push(dateToYmdLocal(cur));
        cur.setMonth(cur.getMonth() + 6);
    }
    return dates;
};
exports.calculateSemiAnnualRecurringDates = calculateSemiAnnualRecurringDates;
const calculateAnnualRecurringDates = (anchor, periodStart, periodEnd) => {
    const dates = [];
    const a = new Date(anchor);
    if (isNaN(a.getTime()))
        return dates;
    const month = a.getMonth();
    const day = a.getDate();
    const start = new Date(periodStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(periodEnd);
    end.setHours(23, 59, 59, 999);
    let y = start.getFullYear();
    const endY = end.getFullYear();
    while (y <= endY) {
        const last = new Date(y, month + 1, 0).getDate();
        const d = Math.min(day, last);
        const eventDate = new Date(y, month, d);
        if (eventDate >= start && eventDate <= end) {
            dates.push(dateToYmdLocal(eventDate));
        }
        y++;
    }
    return dates;
};
exports.calculateAnnualRecurringDates = calculateAnnualRecurringDates;
/**
 * Fechas de ocurrencia de un ingreso fijo en [periodStart, periodEnd] (inclusive).
 * Cubre: MONTHLY, DAILY, WEEKLY, BIWEEKLY, SEMI_MONTHLY, ANNUAL.
 */
const getFixedIncomeOccurrenceDates = (row, periodStart, periodEnd) => {
    const fq = (0, incomeExpenseTaxonomy_1.normalizeFrequency)(row.frequency);
    if (!fq)
        return [];
    const ps = new Date(periodStart);
    ps.setHours(0, 0, 0, 0);
    const pe = new Date(periodEnd);
    pe.setHours(23, 59, 59, 999);
    if (fq === 'monthly' && row.receipt_day != null) {
        return (0, exports.calculateMonthlyRecurringDates)(parseInt(String(row.receipt_day), 10), ps, pe);
    }
    if ((fq === 'daily' || fq === 'weekly' || fq === 'biweekly') && row.date) {
        const anchor = new Date(row.date);
        if (isNaN(anchor.getTime()))
            return [];
        const legacyFq = fq === 'daily' ? 'DAILY' : fq === 'weekly' ? 'WEEKLY' : 'BIWEEKLY';
        const raw = (0, exports.calculateRecurringDates)(anchor, legacyFq, pe);
        const lo = dateToYmdLocal(ps);
        const hi = dateToYmdLocal(pe);
        return raw.filter((d) => d >= lo && d <= hi);
    }
    if (fq === 'semi_monthly') {
        return (0, exports.calculateSemiMonthlyRecurringDates)(ps, pe);
    }
    if (fq === 'annual' && row.date) {
        const anchor = new Date(row.date);
        return (0, exports.calculateAnnualRecurringDates)(anchor, ps, pe);
    }
    if ((fq === 'quarterly' || fq === 'semi_annual') && row.date) {
        const anchor = new Date(row.date);
        return fq === 'quarterly'
            ? (0, exports.calculateQuarterlyRecurringDates)(anchor, ps, pe)
            : (0, exports.calculateSemiAnnualRecurringDates)(anchor, ps, pe);
    }
    return [];
};
exports.getFixedIncomeOccurrenceDates = getFixedIncomeOccurrenceDates;
/**
 * Calculate recurring dates for monthly income based on receipt_day
 * @param receiptDay - Day of month (1-31)
 * @param startDate - Start of period
 * @param endDate - End of period
 * @returns Array of dates (as ISO strings) when the income occurs
 */
const calculateMonthlyRecurringDates = (receiptDay, startDate, endDate) => {
    const dates = [];
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
            dates.push(dateToYmdLocal(eventDate));
        }
        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
    }
    return dates;
};
exports.calculateMonthlyRecurringDates = calculateMonthlyRecurringDates;
/**
 * Fechas en [periodStart, periodEnd] donde aplica un gasto recurrente.
 * Mensual: payment_day; anual: payment_month + payment_day; el resto: misma lógica que ingresos fijos.
 */
function getExpenseOccurrenceDatesInPeriod(row, periodStart, periodEnd) {
    const fq = (0, incomeExpenseTaxonomy_1.normalizeFrequency)(row.frequency);
    if (!fq)
        return [];
    if (fq === 'monthly' && row.payment_day != null) {
        return (0, exports.calculateMonthlyRecurringDates)(parseInt(String(row.payment_day), 10), periodStart, periodEnd);
    }
    if (fq === 'annual' && row.payment_month != null && row.payment_day != null) {
        const dates = [];
        const rangeStart = new Date(periodStart);
        rangeStart.setHours(0, 0, 0, 0);
        const rangeEnd = new Date(periodEnd);
        rangeEnd.setHours(23, 59, 59, 999);
        const pm = parseInt(String(row.payment_month), 10);
        const pd = parseInt(String(row.payment_day), 10);
        const yMin = rangeStart.getFullYear();
        const yMax = rangeEnd.getFullYear();
        for (let y = yMin; y <= yMax; y++) {
            const lastDay = new Date(y, pm, 0).getDate();
            const day = Math.min(pd, lastDay);
            const eventDate = new Date(y, pm - 1, day, 12, 0, 0, 0);
            if (eventDate >= rangeStart && eventDate <= rangeEnd) {
                dates.push(dateToYmdLocal(eventDate));
            }
        }
        return dates;
    }
    return (0, exports.getFixedIncomeOccurrenceDates)({ frequency: row.frequency, receipt_day: row.payment_day, date: row.date }, periodStart, periodEnd);
}
//# sourceMappingURL=dateUtils.js.map