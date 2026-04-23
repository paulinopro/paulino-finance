"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recurringAmountToMonthlySameCurrency = recurringAmountToMonthlySameCurrency;
const incomeExpenseTaxonomy_1 = require("../constants/incomeExpenseTaxonomy");
/**
 * Convierte el importe de un flujo recurrente (por período indicado en `frequency`)
 * a su equivalente mensual promedio, en la misma moneda.
 */
function recurringAmountToMonthlySameCurrency(amount, frequency) {
    const a = Math.abs(amount);
    if (a === 0)
        return 0;
    const f = (0, incomeExpenseTaxonomy_1.normalizeFrequency)(frequency) ?? 'monthly';
    // Días y períodos alineados con año promedio (misma idea que proyecciones a largo plazo).
    const dPerMonth = 365.25 / 12;
    const wPerMonth = 52 / 12;
    const biwPerMonth = 26 / 12;
    switch (f) {
        case 'daily':
            return a * dPerMonth;
        case 'weekly':
            return a * wPerMonth;
        case 'biweekly':
            return a * biwPerMonth;
        case 'semi_monthly':
            return a * 2;
        case 'monthly':
            return a;
        case 'quarterly':
            return a / 3;
        case 'semi_annual':
            return a / 6;
        case 'annual':
            return a / 12;
        default:
            return a;
    }
}
//# sourceMappingURL=projectionsMonthlyEquivalent.js.map