/**
 * Shell visual alineado con Presupuestos: borde izquierdo de acento, bg-dark-800, hover.
 * Usar: className={[LIST_CARD_SHELL, accentClass].join(' ')}
 */
export const LIST_CARD_SHELL = [
  'group relative flex flex-col overflow-hidden rounded-2xl border border-dark-600/70 border-l-4',
  'bg-dark-800',
  'p-4 sm:p-5 shadow-lg shadow-black/20',
  'transition-[box-shadow,transform,border-color] duration-200',
  'hover:border-dark-500/80 hover:shadow-xl hover:shadow-black/25 sm:hover:-translate-y-0.5',
].join(' ');

/** Semáforo por % de uso (presupuesto, meta, utilización de crédito, préstamo). */
export function listCardAccentFromPercent(percentage: number): string {
  if (percentage >= 100) return 'border-l-red-500';
  if (percentage >= 80) return 'border-l-amber-500';
  return 'border-l-emerald-500';
}

export function listCardAccentNeutral(): string {
  return 'border-l-primary-500';
}

/** Lista sin selección / estado neutro (gris). */
export function listCardAccentSubtle(): string {
  return 'border-l-dark-600';
}

export function listCardProgressColor(percentage: number): string {
  if (percentage >= 100) return '#ef4444';
  if (percentage >= 80) return '#f59e0b';
  return '#10b981';
}

export type PayableStatus = 'PENDING' | 'PAID' | 'OVERDUE';

export function listCardAccentPayable(status: PayableStatus): string {
  switch (status) {
    case 'PAID':
      return 'border-l-emerald-500';
    case 'OVERDUE':
      return 'border-l-red-500';
    default:
      return 'border-l-amber-500';
  }
}

export function listCardAccentReceivable(status: string): string {
  switch (status) {
    case 'RECEIVED':
      return 'border-l-emerald-500';
    case 'OVERDUE':
      return 'border-l-red-500';
    default:
      return 'border-l-amber-500';
  }
}

export function listCardAccentLoan(status: string): string {
  switch (status) {
    case 'PAID':
      return 'border-l-emerald-500';
    case 'DEFAULTED':
      return 'border-l-red-500';
    default:
      return 'border-l-primary-500';
  }
}

/** Utilización de tarjeta: deuda vs límite (por moneda ya resuelta en el caller). */
export function listCardAccentCreditUtilization(debt: number, limit: number): string {
  if (limit <= 0) return listCardAccentNeutral();
  const pct = (debt / limit) * 100;
  return listCardAccentFromPercent(Math.min(100, pct));
}

/** Botones de acción en cabecera (mismo criterio que Presupuestos). */
export const listCardBtnEdit =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-primary-400 transition-colors hover:bg-primary-500/15 active:bg-primary-500/25';
export const listCardBtnDanger =
  'inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-red-400 transition-colors hover:bg-red-500/10 active:bg-red-500/20';
