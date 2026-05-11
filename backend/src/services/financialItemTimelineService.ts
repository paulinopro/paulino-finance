import { query } from '../config/database';
import { generateCalendarEvents } from './calendarService';
import {
  dateToYmdLocal,
  getExpenseOccurrenceDatesInPeriod,
  getFixedIncomeOccurrenceDates,
  parseYmdLocal,
  toYmdFromPgDate,
} from '../utils/dateUtils';

export class TimelineNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimelineNotFoundError';
  }
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

/** Solo para calcular la próxima ocurrencia (no amplía el historial). */
const NEXT_LOOKUP_MONTHS = 72;

/**
 * Inicio del historial: vigencia explícita de la serie, fecha de referencia del registro,
 * o día de creación en último recurso. El historial no muestra fechas anteriores.
 */
function timelineStartYmd(row: {
  recurrence_start_date?: unknown;
  date?: unknown;
  created_at?: unknown;
}): string {
  if (row.recurrence_start_date != null && row.recurrence_start_date !== '') {
    const y = toYmdFromPgDate(row.recurrence_start_date);
    if (y) return y;
  }
  if (row.date != null && row.date !== '') {
    const y = toYmdFromPgDate(row.date);
    if (y) return y;
  }
  if (row.created_at != null && row.created_at !== '') {
    const y = toYmdFromPgDate(row.created_at);
    if (y) return y;
  }
  return dateToYmdLocal(new Date());
}

/** Historial y regeneración de eventos: desde inicio del ítem hasta hoy (periodo actual). */
function timelineHistoryRangeYmd(row: {
  recurrence_start_date?: unknown;
  date?: unknown;
  created_at?: unknown;
}): { startStr: string; endStr: string } {
  const todayYmd = dateToYmdLocal(new Date());
  let startStr = timelineStartYmd(row);
  if (startStr > todayYmd) startStr = todayYmd;
  return { startStr, endStr: todayYmd };
}

function computeNextExpenseOccurrence(row: {
  recurrence_type: string;
  date: unknown;
  is_paid: boolean;
  frequency: string | null;
  payment_day: number | null;
  payment_month: number | null;
  recurrence_start_date: unknown;
  recurrence_end_date: unknown;
}): string | null {
  const today = dateToYmdLocal(new Date());
  if (row.recurrence_type === 'non_recurrent') {
    const d = row.date ? toYmdFromPgDate(row.date) : '';
    if (!d || row.is_paid) return null;
    return d >= today ? d : null;
  }
  const periodStart = parseYmdLocal(today);
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + NEXT_LOOKUP_MONTHS);
  const dates = getExpenseOccurrenceDatesInPeriod(
    {
      frequency: row.frequency,
      payment_day: row.payment_day,
      payment_month: row.payment_month,
      date: row.date,
      recurrence_start_date: row.recurrence_start_date,
      recurrence_end_date: row.recurrence_end_date,
    },
    periodStart,
    periodEnd
  );
  const future = dates.filter((d) => d >= today).sort();
  return future[0] ?? null;
}

function computeNextIncomeOccurrence(row: {
  recurrence_type: string;
  date: unknown;
  is_received: boolean;
  frequency: string | null;
  receipt_day: number | null;
  recurrence_start_date: unknown;
  recurrence_end_date: unknown;
}): string | null {
  const today = dateToYmdLocal(new Date());
  if (row.recurrence_type === 'non_recurrent') {
    const d = row.date ? toYmdFromPgDate(row.date) : '';
    if (!d || row.is_received) return null;
    return d >= today ? d : null;
  }
  const periodStart = parseYmdLocal(today);
  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + NEXT_LOOKUP_MONTHS);
  const dates = getFixedIncomeOccurrenceDates(
    {
      frequency: row.frequency,
      receipt_day: row.receipt_day,
      date: row.date,
      recurrence_start_date: row.recurrence_start_date,
      recurrence_end_date: row.recurrence_end_date,
    },
    periodStart,
    periodEnd
  );
  const future = dates.filter((d) => d >= today).sort();
  return future[0] ?? null;
}

function mapTimelineRow(r: Record<string, unknown>): FinancialTimelineEntry {
  return {
    id: Number(r.id),
    eventDate: toYmdFromPgDate(r.event_date),
    amount: parseFloat(String(r.amount ?? 0)),
    currency: String(r.currency || 'DOP'),
    status: String(r.status || 'PENDING'),
    showOnCalendar: Boolean(r.show_on_calendar),
    eventType: String(r.event_type),
  };
}

async function queryPaginatedTimelineEntries(
  userId: number,
  relatedId: number,
  eventTypes: string[],
  startStr: string,
  endStr: string,
  page: number,
  limit: number
): Promise<{ entries: FinancialTimelineEntry[]; total: number }> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const offset = (safePage - 1) * safeLimit;

  const countR = await query(
    `SELECT COUNT(*)::int AS c
     FROM calendar_events
     WHERE user_id = $1 AND related_id = $2 AND event_type = ANY($3::varchar[])
       AND event_date >= $4::date AND event_date <= $5::date`,
    [userId, relatedId, eventTypes, startStr, endStr]
  );
  const total = Number(countR.rows[0]?.c ?? 0);

  const ev = await query(
    `SELECT id, event_date, title, amount, currency, status, show_on_calendar, event_type
     FROM calendar_events
     WHERE user_id = $1 AND related_id = $2 AND event_type = ANY($3::varchar[])
       AND event_date >= $4::date AND event_date <= $5::date
     ORDER BY event_date DESC, id DESC
     LIMIT $6 OFFSET $7`,
    [userId, relatedId, eventTypes, startStr, endStr, safeLimit, offset]
  );

  const entries = ev.rows.map((row: Record<string, unknown>) => mapTimelineRow(row));
  return { entries, total };
}

export interface TimelineQueryOpts {
  page?: number;
  limit?: number;
  /** Si es false (p. ej. página > 1), no regenera eventos del calendario para este rango. */
  refreshCalendar?: boolean;
}

const DEFAULT_TIMELINE_LIMIT = 10;
const MAX_TIMELINE_LIMIT = 100;

function clampTimelinePagination(page?: number, limit?: number): { page: number; limit: number } {
  const p = page != null && Number.isFinite(page) ? Math.floor(Number(page)) : 1;
  let l = limit != null && Number.isFinite(limit) ? Math.floor(Number(limit)) : DEFAULT_TIMELINE_LIMIT;
  if (Number.isNaN(l)) l = DEFAULT_TIMELINE_LIMIT;
  l = Math.min(MAX_TIMELINE_LIMIT, Math.max(1, l));
  return { page: Math.max(1, p), limit: l };
}

export async function buildExpenseTimeline(
  userId: number,
  expenseId: number,
  opts?: TimelineQueryOpts
): Promise<ExpenseTimelineResult> {
  const src = await query(
    `SELECT id, description, recurrence_type, frequency, payment_day, payment_month, date,
            recurrence_start_date, recurrence_end_date, is_paid, created_at
     FROM expenses WHERE id = $1 AND user_id = $2`,
    [expenseId, userId]
  );
  if (src.rows.length === 0) {
    throw new TimelineNotFoundError('Expense not found');
  }
  const row = src.rows[0];

  const { startStr, endStr } = timelineHistoryRangeYmd({
    recurrence_start_date: row.recurrence_start_date,
    date: row.date,
    created_at: row.created_at,
  });
  const { page, limit } = clampTimelinePagination(opts?.page, opts?.limit);
  const refreshCalendar = opts?.refreshCalendar !== false;

  if (refreshCalendar) {
    await generateCalendarEvents(userId, startStr, endStr);
  }

  const { entries, total } = await queryPaginatedTimelineEntries(
    userId,
    expenseId,
    ['EXPENSE', 'RECURRING_EXPENSE'],
    startStr,
    endStr,
    page,
    limit
  );
  const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

  return {
    description: String(row.description ?? ''),
    recurrenceType: String(row.recurrence_type ?? ''),
    nextOccurrenceDate: computeNextExpenseOccurrence({
      recurrence_type: String(row.recurrence_type),
      date: row.date,
      is_paid: Boolean(row.is_paid),
      frequency: row.frequency != null ? String(row.frequency) : null,
      payment_day: row.payment_day != null ? Number(row.payment_day) : null,
      payment_month: row.payment_month != null ? Number(row.payment_month) : null,
      recurrence_start_date: row.recurrence_start_date,
      recurrence_end_date: row.recurrence_end_date,
    }),
    entries,
    pagination: { page, limit, total, totalPages },
  };
}

export async function buildIncomeTimeline(
  userId: number,
  incomeId: number,
  opts?: TimelineQueryOpts
): Promise<IncomeTimelineResult> {
  const src = await query(
    `SELECT id, description, recurrence_type, frequency, receipt_day, date,
            recurrence_start_date, recurrence_end_date, is_received, created_at
     FROM income WHERE id = $1 AND user_id = $2`,
    [incomeId, userId]
  );
  if (src.rows.length === 0) {
    throw new TimelineNotFoundError('Income not found');
  }
  const row = src.rows[0];

  const { startStr, endStr } = timelineHistoryRangeYmd({
    recurrence_start_date: row.recurrence_start_date,
    date: row.date,
    created_at: row.created_at,
  });
  const { page, limit } = clampTimelinePagination(opts?.page, opts?.limit);
  const refreshCalendar = opts?.refreshCalendar !== false;

  if (refreshCalendar) {
    await generateCalendarEvents(userId, startStr, endStr);
  }

  const { entries, total } = await queryPaginatedTimelineEntries(
    userId,
    incomeId,
    ['INCOME'],
    startStr,
    endStr,
    page,
    limit
  );
  const totalPages = total === 0 ? 1 : Math.ceil(total / limit);

  return {
    description: String(row.description ?? ''),
    recurrenceType: String(row.recurrence_type ?? ''),
    nextOccurrenceDate: computeNextIncomeOccurrence({
      recurrence_type: String(row.recurrence_type),
      date: row.date,
      is_received: Boolean(row.is_received),
      frequency: row.frequency != null ? String(row.frequency) : null,
      receipt_day: row.receipt_day != null ? Number(row.receipt_day) : null,
      recurrence_start_date: row.recurrence_start_date,
      recurrence_end_date: row.recurrence_end_date,
    }),
    entries,
    pagination: { page, limit, total, totalPages },
  };
}
