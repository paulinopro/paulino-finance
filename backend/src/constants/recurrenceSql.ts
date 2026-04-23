/**
 * Fragmentos WHERE SQL: taxonomía `nature` + `recurrence_type` + `frequency` (sin columnas legacy).
 */

/** Ingreso único con importe en `date` dentro del rango [start, end] (params $2,$3 en cash-flow). */
export const INCOME_DATE_IN_RANGE_PUNCTUAL = `
  date >= $2 AND date <= $3
  AND recurrence_type = 'non_recurrent'`;

/** Ingreso recurrente (fechas vía getFixedIncomeOccurrenceDates en código). */
export const INCOME_RECURRENT_ROWS = `recurrence_type = 'recurrent'`;

/** Gasto único con fecha en rango. */
export const EXPENSE_DATE_IN_RANGE_PUNCTUAL = `
  date >= $2 AND date <= $3
  AND recurrence_type = 'non_recurrent'`;

/** Gasto recurrente mensual (día de pago). */
export const EXPENSE_RECURRING_MONTHLY = `
  recurrence_type = 'recurrent'
  AND LOWER(TRIM(COALESCE(frequency, ''))) = 'monthly'
  AND payment_day IS NOT NULL`;

/** Gasto recurrente anual (mes y día de pago). */
export const EXPENSE_RECURRING_ANNUAL = `
  recurrence_type = 'recurrent'
  AND LOWER(TRIM(COALESCE(frequency, ''))) = 'annual'
  AND payment_month IS NOT NULL
  AND payment_day IS NOT NULL`;

/** Gasto recurrente con frecuencia no mensual ni anual (se expande con getExpenseOccurrenceDatesInPeriod). */
export const EXPENSE_RECURRING_OTHER_FREQ = `
  recurrence_type = 'recurrent'
  AND LOWER(TRIM(COALESCE(frequency, ''))) IN (
    'daily', 'weekly', 'biweekly', 'semi_monthly', 'quarterly', 'semi_annual'
  )`;

/** Ingreso puntual en mes calendario ($2 = mes, $3 = año). */
export const INCOME_PUNCTUAL_CALENDAR_MONTH = `
  EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
  AND recurrence_type = 'non_recurrent'`;

/** Ingreso puntual en un año ($2 = año). */
export const INCOME_PUNCTUAL_CALENDAR_YEAR = `
  EXTRACT(YEAR FROM date) = $2
  AND recurrence_type = 'non_recurrent'`;

/** Ingreso puntual en un día ($2 año, $3 mes, $4 día). */
export const INCOME_PUNCTUAL_CALENDAR_DAY = `
  EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(DAY FROM date) = $4
  AND recurrence_type = 'non_recurrent'`;

/** Gasto puntual en mes calendario ($2 = mes, $3 = año). */
export const EXPENSE_PUNCTUAL_CALENDAR_MONTH = `
  EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
  AND recurrence_type = 'non_recurrent'`;

/** Gasto puntual en un año ($2 = año). */
export const EXPENSE_PUNCTUAL_CALENDAR_YEAR = `
  EXTRACT(YEAR FROM date) = $2
  AND recurrence_type = 'non_recurrent'`;

/** Gasto puntual en un día ($2 año, $3 mes, $4 día). */
export const EXPENSE_PUNCTUAL_CALENDAR_DAY = `
  EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(DAY FROM date) = $4
  AND recurrence_type = 'non_recurrent'`;

/** Gastos que cuentan para totales mensuales (stats / salud mensual): puntual del mes + recurrente mensual + anual del mes. */
export const EXPENSE_STATS_MONTH_OR = `
  ( ${EXPENSE_PUNCTUAL_CALENDAR_MONTH} )
  OR ( ${EXPENSE_RECURRING_MONTHLY} )
  OR (
    ( ${EXPENSE_RECURRING_ANNUAL} )
    AND payment_month = $2
    AND EXTRACT(YEAR FROM date) = $3
  )`;

/** Coincide con un día: puntual + recurrente mensual (día) + anual (mes/día). */
export const EXPENSE_DAILY_MATCH = `
  ( ${EXPENSE_PUNCTUAL_CALENDAR_DAY} )
  OR ( ( ${EXPENSE_RECURRING_MONTHLY} ) AND payment_day = $4 )
  OR ( ( ${EXPENSE_RECURRING_ANNUAL} ) AND payment_month = $3 AND payment_day = $4 )`;

/** Gasto anual recurrente con `date` en el año ($2). */
export const EXPENSE_ANNUAL_ROW_IN_YEAR = `
  ( ${EXPENSE_RECURRING_ANNUAL} )
  AND EXTRACT(YEAR FROM date) = $2`;
