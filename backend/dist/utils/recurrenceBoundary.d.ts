/**
 * Fechas opcionales de vigencia de una serie recurrente (ingreso/gasto).
 * Cuerpo API: recurrenceStartDate / recurrenceEndDate (camelCase) o snake_case.
 */
export declare function parseRecurrenceBoundaryFromBody(body: Record<string, unknown>): {
    start: string | null;
    end: string | null;
    error: string | null;
};
//# sourceMappingURL=recurrenceBoundary.d.ts.map