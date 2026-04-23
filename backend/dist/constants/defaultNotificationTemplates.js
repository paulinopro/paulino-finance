"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_NOTIFICATION_TEMPLATES = void 0;
/** Textos por defecto para plantillas por usuario (título + mensaje con variables {nombre}). */
exports.DEFAULT_NOTIFICATION_TEMPLATES = {
    CARD_PAYMENT: {
        title: 'Recordatorio de Pago de Tarjeta',
        message: `🔔 <b>Recordatorio de Pago de Tarjeta</b> 🔔

<b>Banco:</b> {bankName}
<b>Tarjeta:</b> {cardName}
<b>Tipo de moneda:</b> {currencyTypeLabel}

{{#if creditLimitDop}}<b>Límite de crédito (DOP):</b> {creditLimitDop}{{/if}}
{{#if currentDebtDop}}<b>Deuda actual (DOP):</b> {currentDebtDop}{{/if}}
{{#if minimumPaymentDop}}<b>Pago mínimo (DOP):</b> {minimumPaymentDop}{{/if}}
{{#if creditLimitUsd}}<b>Límite de crédito (USD):</b> {creditLimitUsd}{{/if}}
{{#if currentDebtUsd}}<b>Deuda actual (USD):</b> {currentDebtUsd}{{/if}}
{{#if minimumPaymentUsd}}<b>Pago mínimo (USD):</b> {minimumPaymentUsd}{{/if}}

<b>Deuda resumida:</b> {debtText}
<b>Día de corte:</b> {cutOffDay}
<b>Día límite de pago:</b> {dueDay} de este mes
<b>Días restantes (recordatorio):</b> {days}`,
    },
    LOAN_PAYMENT: {
        title: 'Recordatorio de Pago de Préstamo',
        message: '🔔 <b>Recordatorio de Pago de Préstamo</b> 🔔\n\n<b>Préstamo:</b> {loanName}\n<b>Monto de cuota:</b> {installmentAmount} {currency}\n<b>Progreso:</b> {paidInstallments}/{totalInstallments} cuotas\n<b>Próximo pago:</b> {nextPaymentDate}\n<b>Días restantes:</b> {days}',
    },
    RECURRING_EXPENSE: {
        title: 'Recordatorio de Gasto Recurrente',
        message: `🔔 <b>Recordatorio de Gasto Recurrente</b> 🔔

<b>Calendario:</b> {expenseScheduleLabel}
{{#if category}}<b>Categoría:</b> {category}{{/if}}
<b>Descripción:</b> {description}
<b>Monto:</b> {amount} {currency}
<b>Fecha de pago:</b> {paymentDay} de este mes
<b>Días restantes:</b> {days}`,
    },
};
//# sourceMappingURL=defaultNotificationTemplates.js.map