import type { CalendarEvent } from '../types';

const HEX = {
  PENDING: '#f59e0b',
  PAID: '#10b981',
  RECEIVED: '#10b981',
  OVERDUE: '#ef4444',
  CANCELLED: '#6b7280',
};

export const CALENDAR_DETAIL_EXPENSE_TYPES = new Set<CalendarEvent['eventType']>([
  'CARD_PAYMENT',
  'LOAN_PAYMENT',
  'EXPENSE',
  'RECURRING_EXPENSE',
]);

export type PeriodEffectiveBucket = 'paid' | 'overdue' | 'pending' | 'cancelled';

export const PERIOD_ROW_BORDER_COLOR: Record<PeriodEffectiveBucket, string> = {
  paid: HEX.PAID,
  overdue: HEX.OVERDUE,
  pending: HEX.PENDING,
  cancelled: HEX.CANCELLED,
};

export function calendarEventYmd(ev: CalendarEvent): string {
  return ev.eventDate.split('T')[0];
}

/** Misma lógica que el pie del resumen: pendiente con fecha antes de hoy cuenta como vencido. */
export function getEffectiveCalendarPeriodBucket(
  ev: CalendarEvent,
  todayYmd: string
): PeriodEffectiveBucket {
  if (ev.status === 'CANCELLED') return 'cancelled';
  const d = calendarEventYmd(ev);

  if (ev.eventType === 'INCOME') {
    if (ev.status === 'RECEIVED') return 'paid';
    if (ev.status === 'OVERDUE') return 'overdue';
    if (ev.status === 'PENDING' && d < todayYmd) return 'overdue';
    return 'pending';
  }

  if (CALENDAR_DETAIL_EXPENSE_TYPES.has(ev.eventType)) {
    if (ev.status === 'PAID') return 'paid';
    if (ev.status === 'OVERDUE') return 'overdue';
    if (ev.status === 'PENDING' && d < todayYmd) return 'overdue';
    return 'pending';
  }

  return 'pending';
}

export function periodDetailStatusDisplay(
  ev: CalendarEvent,
  bucket: PeriodEffectiveBucket,
  labels: Record<string, string>
): string {
  if (bucket === 'cancelled') return labels.CANCELLED;
  if (bucket === 'paid') return ev.eventType === 'INCOME' ? labels.RECEIVED : labels.PAID;
  if (bucket === 'overdue') return labels.OVERDUE;
  return labels.PENDING;
}

export function sumCalendarRowsByCurrency(events: CalendarEvent[], fallbackCurrency: string): [string, number][] {
  const m = new Map<string, number>();
  for (const ev of events) {
    const c = (ev.currency || fallbackCurrency).trim().toUpperCase();
    m.set(c, (m.get(c) ?? 0) + ev.amount);
  }
  return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export function compareCalendarEventsForPeriod(a: CalendarEvent, b: CalendarEvent): number {
  const da = calendarEventYmd(a);
  const db = calendarEventYmd(b);
  if (da !== db) return da < db ? -1 : 1;
  const ta = (a.title || '').toLocaleLowerCase();
  const tb = (b.title || '').toLocaleLowerCase();
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id - b.id;
}
