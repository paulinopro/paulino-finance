/**
 * Taxonomía unificada Ingresos / Gastos (API y BD en snake_case).
 *
 * UI español ↔ API:
 * - Tipo (Fijo / Variable)     → nature: fixed | variable
 * - Frecuencia (Diario, Mensual, …) → frequency (solo si recurrente; null si único)
 * - Naturaleza (Recurrente / Único) → recurrence_type: recurrent | non_recurrent
 */

export const NATURE_VALUES = ['fixed', 'variable'] as const;
export type Nature = (typeof NATURE_VALUES)[number];

export const RECURRENCE_TYPE_VALUES = ['recurrent', 'non_recurrent'] as const;
export type RecurrenceType = (typeof RECURRENCE_TYPE_VALUES)[number];

export const FREQUENCY_VALUES = [
  'daily',
  'weekly',
  'biweekly',
  'semi_monthly',
  'monthly',
  'quarterly',
  'semi_annual',
  'annual',
] as const;
export type Frequency = (typeof FREQUENCY_VALUES)[number];

/** Valores antiguos en income.frequency / expense (mayúsculas) → canónico */
export const LEGACY_FREQUENCY_TO_CANONICAL: Record<string, Frequency> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  SEMI_MONTHLY: 'semi_monthly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  SEMI_ANNUAL: 'semi_annual',
  ANNUAL: 'annual',
  daily: 'daily',
  weekly: 'weekly',
  biweekly: 'biweekly',
  semi_monthly: 'semi_monthly',
  monthly: 'monthly',
  quarterly: 'quarterly',
  semi_annual: 'semi_annual',
  annual: 'annual',
};

export function normalizeFrequency(v: string | null | undefined): Frequency | null {
  if (v == null || v === '') return null;
  const k = String(v).trim();
  const c = LEGACY_FREQUENCY_TO_CANONICAL[k] ?? LEGACY_FREQUENCY_TO_CANONICAL[k.toUpperCase()];
  return c ?? null;
}

export function isValidFrequency(v: string | null | undefined): v is Frequency {
  return normalizeFrequency(v) != null;
}

/** Etiqueta legible en español para el calendario del gasto (PDF, notificaciones). */
export function describeExpenseScheduleEs(expense: {
  nature?: string | null;
  recurrenceType?: string;
  recurrence_type?: string | null;
  frequency?: string | null;
}): string {
  const recurrenceType = expense.recurrenceType ?? expense.recurrence_type;
  if (recurrenceType === 'non_recurrent') return 'No recurrente';
  const f = normalizeFrequency(expense.frequency ?? undefined);
  if (f === 'monthly') return 'Recurrente mensual';
  if (f === 'annual') return 'Anual';
  if (f === 'weekly') return 'Recurrente semanal';
  if (f === 'daily') return 'Recurrente diario';
  if (f === 'biweekly') return 'Recurrente cada 2 semanas';
  if (f === 'semi_monthly') return 'Recurrente quincenal';
  if (f === 'quarterly') return 'Recurrente trimestral';
  if (f === 'semi_annual') return 'Recurrente semestral';
  if (f) return `Recurrente (${f})`;
  return 'Recurrente';
}

/**
 * Gastos puntuales o anuales mueven saldo al crear/editar/borrar.
 * Recurrentes no anuales solo al marcar pagado (p. ej. mensual).
 */
export function expenseUsesImmediateBalance(row: {
  recurrence_type?: string | null;
  frequency?: string | null;
}): boolean {
  if (row.recurrence_type === 'non_recurrent') return true;
  const fq = normalizeFrequency(row.frequency ?? undefined);
  if (fq === 'annual') return true;
  return false;
}
