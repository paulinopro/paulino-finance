/** Preferencias de UI del calendario financiero (solo backend / API usuario). */

export type CalendarCardPaymentAmountBasis = 'minimum_payment' | 'current_debt';

export function normalizeCalendarCardPaymentAmountBasis(
  raw: unknown
): CalendarCardPaymentAmountBasis | null {
  const s = String(raw ?? '').trim();
  if (s === 'minimum_payment') return 'minimum_payment';
  if (s === 'current_debt') return 'current_debt';
  return null;
}

export function coerceCalendarCardPaymentAmountBasis(raw: unknown): CalendarCardPaymentAmountBasis {
  return normalizeCalendarCardPaymentAmountBasis(raw) ?? 'minimum_payment';
}
