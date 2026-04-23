"use strict";
/**
 * Taxonomía unificada Ingresos / Gastos (API y BD en snake_case).
 *
 * UI español ↔ API:
 * - Tipo (Fijo / Variable)     → nature: fixed | variable
 * - Frecuencia (Diario, Mensual, …) → frequency (solo si recurrente; null si único)
 * - Naturaleza (Recurrente / Único) → recurrence_type: recurrent | non_recurrent
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_FREQUENCY_TO_CANONICAL = exports.FREQUENCY_VALUES = exports.RECURRENCE_TYPE_VALUES = exports.NATURE_VALUES = void 0;
exports.normalizeFrequency = normalizeFrequency;
exports.isValidFrequency = isValidFrequency;
exports.describeExpenseScheduleEs = describeExpenseScheduleEs;
exports.expenseUsesImmediateBalance = expenseUsesImmediateBalance;
exports.NATURE_VALUES = ['fixed', 'variable'];
exports.RECURRENCE_TYPE_VALUES = ['recurrent', 'non_recurrent'];
exports.FREQUENCY_VALUES = [
    'daily',
    'weekly',
    'biweekly',
    'semi_monthly',
    'monthly',
    'quarterly',
    'semi_annual',
    'annual',
];
/** Valores antiguos en income.frequency / expense (mayúsculas) → canónico */
exports.LEGACY_FREQUENCY_TO_CANONICAL = {
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
function normalizeFrequency(v) {
    if (v == null || v === '')
        return null;
    const k = String(v).trim();
    const c = exports.LEGACY_FREQUENCY_TO_CANONICAL[k] ?? exports.LEGACY_FREQUENCY_TO_CANONICAL[k.toUpperCase()];
    return c ?? null;
}
function isValidFrequency(v) {
    return normalizeFrequency(v) != null;
}
/** Etiqueta legible en español para el calendario del gasto (PDF, notificaciones). */
function describeExpenseScheduleEs(expense) {
    const recurrenceType = expense.recurrenceType ?? expense.recurrence_type;
    if (recurrenceType === 'non_recurrent')
        return 'No recurrente';
    const f = normalizeFrequency(expense.frequency ?? undefined);
    if (f === 'monthly')
        return 'Recurrente mensual';
    if (f === 'annual')
        return 'Anual';
    if (f === 'weekly')
        return 'Recurrente semanal';
    if (f === 'daily')
        return 'Recurrente diario';
    if (f === 'biweekly')
        return 'Recurrente cada 2 semanas';
    if (f === 'semi_monthly')
        return 'Recurrente quincenal';
    if (f === 'quarterly')
        return 'Recurrente trimestral';
    if (f === 'semi_annual')
        return 'Recurrente semestral';
    if (f)
        return `Recurrente (${f})`;
    return 'Recurrente';
}
/**
 * Gastos puntuales o anuales mueven saldo al crear/editar/borrar.
 * Recurrentes no anuales solo al marcar pagado (p. ej. mensual).
 */
function expenseUsesImmediateBalance(row) {
    if (row.recurrence_type === 'non_recurrent')
        return true;
    const fq = normalizeFrequency(row.frequency ?? undefined);
    if (fq === 'annual')
        return true;
    return false;
}
//# sourceMappingURL=incomeExpenseTaxonomy.js.map