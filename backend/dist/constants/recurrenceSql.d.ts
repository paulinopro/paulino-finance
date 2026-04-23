/**
 * Fragmentos WHERE SQL: taxonomía `nature` + `recurrence_type` + `frequency` (sin columnas legacy).
 */
/** Ingreso único con importe en `date` dentro del rango [start, end] (params $2,$3 en cash-flow). */
export declare const INCOME_DATE_IN_RANGE_PUNCTUAL = "\n  date >= $2 AND date <= $3\n  AND recurrence_type = 'non_recurrent'";
/** Ingreso recurrente (fechas vía getFixedIncomeOccurrenceDates en código). */
export declare const INCOME_RECURRENT_ROWS = "recurrence_type = 'recurrent'";
/** Gasto único con fecha en rango. */
export declare const EXPENSE_DATE_IN_RANGE_PUNCTUAL = "\n  date >= $2 AND date <= $3\n  AND recurrence_type = 'non_recurrent'";
/** Gasto recurrente mensual (día de pago). */
export declare const EXPENSE_RECURRING_MONTHLY = "\n  recurrence_type = 'recurrent'\n  AND LOWER(TRIM(COALESCE(frequency, ''))) = 'monthly'\n  AND payment_day IS NOT NULL";
/** Gasto recurrente anual (mes y día de pago). */
export declare const EXPENSE_RECURRING_ANNUAL = "\n  recurrence_type = 'recurrent'\n  AND LOWER(TRIM(COALESCE(frequency, ''))) = 'annual'\n  AND payment_month IS NOT NULL\n  AND payment_day IS NOT NULL";
/** Gasto recurrente con frecuencia no mensual ni anual (se expande con getExpenseOccurrenceDatesInPeriod). */
export declare const EXPENSE_RECURRING_OTHER_FREQ = "\n  recurrence_type = 'recurrent'\n  AND LOWER(TRIM(COALESCE(frequency, ''))) IN (\n    'daily', 'weekly', 'biweekly', 'semi_monthly', 'quarterly', 'semi_annual'\n  )";
/** Ingreso puntual en mes calendario ($2 = mes, $3 = año). */
export declare const INCOME_PUNCTUAL_CALENDAR_MONTH = "\n  EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3\n  AND recurrence_type = 'non_recurrent'";
/** Ingreso puntual en un año ($2 = año). */
export declare const INCOME_PUNCTUAL_CALENDAR_YEAR = "\n  EXTRACT(YEAR FROM date) = $2\n  AND recurrence_type = 'non_recurrent'";
/** Ingreso puntual en un día ($2 año, $3 mes, $4 día). */
export declare const INCOME_PUNCTUAL_CALENDAR_DAY = "\n  EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(DAY FROM date) = $4\n  AND recurrence_type = 'non_recurrent'";
/** Gasto puntual en mes calendario ($2 = mes, $3 = año). */
export declare const EXPENSE_PUNCTUAL_CALENDAR_MONTH = "\n  EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3\n  AND recurrence_type = 'non_recurrent'";
/** Gasto puntual en un año ($2 = año). */
export declare const EXPENSE_PUNCTUAL_CALENDAR_YEAR = "\n  EXTRACT(YEAR FROM date) = $2\n  AND recurrence_type = 'non_recurrent'";
/** Gasto puntual en un día ($2 año, $3 mes, $4 día). */
export declare const EXPENSE_PUNCTUAL_CALENDAR_DAY = "\n  EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(DAY FROM date) = $4\n  AND recurrence_type = 'non_recurrent'";
/** Gastos que cuentan para totales mensuales (stats / salud mensual): puntual del mes + recurrente mensual + anual del mes. */
export declare const EXPENSE_STATS_MONTH_OR = "\n  ( \n  EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3\n  AND recurrence_type = 'non_recurrent' )\n  OR ( \n  recurrence_type = 'recurrent'\n  AND LOWER(TRIM(COALESCE(frequency, ''))) = 'monthly'\n  AND payment_day IS NOT NULL )\n  OR (\n    ( \n  recurrence_type = 'recurrent'\n  AND LOWER(TRIM(COALESCE(frequency, ''))) = 'annual'\n  AND payment_month IS NOT NULL\n  AND payment_day IS NOT NULL )\n    AND payment_month = $2\n    AND EXTRACT(YEAR FROM date) = $3\n  )";
/** Coincide con un día: puntual + recurrente mensual (día) + anual (mes/día). */
export declare const EXPENSE_DAILY_MATCH = "\n  ( \n  EXTRACT(YEAR FROM date) = $2 AND EXTRACT(MONTH FROM date) = $3 AND EXTRACT(DAY FROM date) = $4\n  AND recurrence_type = 'non_recurrent' )\n  OR ( ( \n  recurrence_type = 'recurrent'\n  AND LOWER(TRIM(COALESCE(frequency, ''))) = 'monthly'\n  AND payment_day IS NOT NULL ) AND payment_day = $4 )\n  OR ( ( \n  recurrence_type = 'recurrent'\n  AND LOWER(TRIM(COALESCE(frequency, ''))) = 'annual'\n  AND payment_month IS NOT NULL\n  AND payment_day IS NOT NULL ) AND payment_month = $3 AND payment_day = $4 )";
/** Gasto anual recurrente con `date` en el año ($2). */
export declare const EXPENSE_ANNUAL_ROW_IN_YEAR = "\n  ( \n  recurrence_type = 'recurrent'\n  AND LOWER(TRIM(COALESCE(frequency, ''))) = 'annual'\n  AND payment_month IS NOT NULL\n  AND payment_day IS NOT NULL )\n  AND EXTRACT(YEAR FROM date) = $2";
//# sourceMappingURL=recurrenceSql.d.ts.map