"use strict";
/** Preferencias de UI del calendario financiero (solo backend / API usuario). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeCalendarCardPaymentAmountBasis = normalizeCalendarCardPaymentAmountBasis;
exports.coerceCalendarCardPaymentAmountBasis = coerceCalendarCardPaymentAmountBasis;
function normalizeCalendarCardPaymentAmountBasis(raw) {
    const s = String(raw ?? '').trim();
    if (s === 'minimum_payment')
        return 'minimum_payment';
    if (s === 'current_debt')
        return 'current_debt';
    return null;
}
function coerceCalendarCardPaymentAmountBasis(raw) {
    return normalizeCalendarCardPaymentAmountBasis(raw) ?? 'minimum_payment';
}
//# sourceMappingURL=calendarUserPreferences.js.map