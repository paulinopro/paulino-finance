/** Alineado con `backend/src/constants/calendarUserPreferences.ts`. */

export type CalendarCardPaymentAmountBasis = 'minimum_payment' | 'current_debt';

export const DEFAULT_CALENDAR_CARD_PAYMENT_AMOUNT_BASIS: CalendarCardPaymentAmountBasis =
  'minimum_payment';

export const CALENDAR_CARD_PAYMENT_AMOUNT_BASIS_OPTIONS = [
  { value: 'minimum_payment' as const },
  { value: 'current_debt' as const },
];
