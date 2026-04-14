export type NotificationTemplateType = 'CARD_PAYMENT' | 'LOAN_PAYMENT' | 'RECURRING_EXPENSE';

/** Textos por defecto para plantillas por usuario (título + mensaje con variables {nombre}). */
export const DEFAULT_NOTIFICATION_TEMPLATES: Record<
  NotificationTemplateType,
  { title: string; message: string }
> = {
  CARD_PAYMENT: {
    title: 'Recordatorio de Pago de Tarjeta',
    message:
      '🔔 <b>Recordatorio de Pago de Tarjeta</b>\n\nTarjeta: {cardName} - {bankName}\nFecha límite: {dueDay} de este mes\nDeuda actual: {debtText}\nDías restantes: {days}',
  },
  LOAN_PAYMENT: {
    title: 'Recordatorio de Pago de Préstamo',
    message:
      '🔔 <b>Recordatorio de Pago de Préstamo</b>\n\nPréstamo: {loanName}\nMonto de cuota: {installmentAmount} {currency}\nProgreso: {paidInstallments}/{totalInstallments} cuotas\nPróximo pago: {nextPaymentDate}\nDías restantes: {days}',
  },
  RECURRING_EXPENSE: {
    title: 'Recordatorio de Gasto Recurrente',
    message:
      '🔔 <b>Recordatorio de Gasto Recurrente</b>\n\nDescripción: {description}\nMonto: {amount} {currency}\nFecha de pago: {paymentDay} de este mes\nDías restantes: {days}',
  },
};
