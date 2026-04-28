/**
 * Fechas opcionales de vigencia de una serie recurrente (ingreso/gasto).
 * Cuerpo API: recurrenceStartDate / recurrenceEndDate (camelCase) o snake_case.
 */
export function parseRecurrenceBoundaryFromBody(body: Record<string, unknown>): {
  start: string | null;
  end: string | null;
  error: string | null;
} {
  const startRaw = body.recurrenceStartDate ?? body.recurrence_start_date;
  const endRaw = body.recurrenceEndDate ?? body.recurrence_end_date;
  const start = normalizeYmdBoundary(startRaw);
  const end = normalizeYmdBoundary(endRaw);
  if (
    startRaw !== undefined &&
    startRaw !== null &&
    String(startRaw).trim() !== '' &&
    !start
  ) {
    return {
      start: null,
      end: null,
      error: 'Fecha de inicio de la serie inválida (use AAAA-MM-DD)',
    };
  }
  if (
    endRaw !== undefined &&
    endRaw !== null &&
    String(endRaw).trim() !== '' &&
    !end
  ) {
    return {
      start: null,
      end: null,
      error: 'Fecha de fin de la serie inválida (use AAAA-MM-DD)',
    };
  }
  if (start && end && start > end) {
    return {
      start,
      end,
      error: 'La fecha de inicio de la serie no puede ser posterior a la fecha de fin',
    };
  }
  return { start, end, error: null };
}

function normalizeYmdBoundary(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}
