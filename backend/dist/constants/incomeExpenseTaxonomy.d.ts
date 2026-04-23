/**
 * Taxonomía unificada Ingresos / Gastos (API y BD en snake_case).
 *
 * UI español ↔ API:
 * - Tipo (Fijo / Variable)     → nature: fixed | variable
 * - Frecuencia (Diario, Mensual, …) → frequency (solo si recurrente; null si único)
 * - Naturaleza (Recurrente / Único) → recurrence_type: recurrent | non_recurrent
 */
export declare const NATURE_VALUES: readonly ["fixed", "variable"];
export type Nature = (typeof NATURE_VALUES)[number];
export declare const RECURRENCE_TYPE_VALUES: readonly ["recurrent", "non_recurrent"];
export type RecurrenceType = (typeof RECURRENCE_TYPE_VALUES)[number];
export declare const FREQUENCY_VALUES: readonly ["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "semi_annual", "annual"];
export type Frequency = (typeof FREQUENCY_VALUES)[number];
/** Valores antiguos en income.frequency / expense (mayúsculas) → canónico */
export declare const LEGACY_FREQUENCY_TO_CANONICAL: Record<string, Frequency>;
export declare function normalizeFrequency(v: string | null | undefined): Frequency | null;
export declare function isValidFrequency(v: string | null | undefined): v is Frequency;
/** Etiqueta legible en español para el calendario del gasto (PDF, notificaciones). */
export declare function describeExpenseScheduleEs(expense: {
    nature?: string | null;
    recurrenceType?: string;
    recurrence_type?: string | null;
    frequency?: string | null;
}): string;
/**
 * Gastos puntuales o anuales mueven saldo al crear/editar/borrar.
 * Recurrentes no anuales solo al marcar pagado (p. ej. mensual).
 */
export declare function expenseUsesImmediateBalance(row: {
    recurrence_type?: string | null;
    frequency?: string | null;
}): boolean;
//# sourceMappingURL=incomeExpenseTaxonomy.d.ts.map