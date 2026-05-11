"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXPENSE_CATEGORY_DEFAULT_PRESETS = void 0;
exports.expenseCategoryPresetOrder = expenseCategoryPresetOrder;
/**
 * Categorías por defecto (nombre visible, nombre de ícono Lucide PascalCase, color hex).
 * Debe estar alineado con el cliente al elegir íconos en el picker (`categoryIconPicker.tsx`).
 */
exports.EXPENSE_CATEGORY_DEFAULT_PRESETS = [
    { name: 'Comida', icon: 'UtensilsCrossed', color: '#f97316' },
    { name: 'Transporte', icon: 'Car', color: '#3b82f6' },
    { name: 'Entretenimiento', icon: 'Clapperboard', color: '#a855f7' },
    { name: 'Salud', icon: 'HeartPulse', color: '#ef4444' },
    { name: 'Educación', icon: 'GraduationCap', color: '#6366f1' },
    { name: 'Compras', icon: 'ShoppingBag', color: '#ec4899' },
    { name: 'Rentas', icon: 'KeyRound', color: '#eab308' },
    { name: 'Servicios', icon: 'Zap', color: '#64748b' },
    { name: 'Vivienda', icon: 'Home', color: '#84cc16' },
    { name: 'Seguros', icon: 'ShieldCheck', color: '#06b6d4' },
    { name: 'Impuestos', icon: 'Landmark', color: '#0891b2' },
    { name: 'Suscripciones', icon: 'Repeat', color: '#8b5cf6' },
    { name: 'Ropa', icon: 'Shirt', color: '#db2777' },
    { name: 'Belleza', icon: 'Sparkles', color: '#f472b6' },
    { name: 'Mascotas', icon: 'PawPrint', color: '#b45309' },
    { name: 'Regalos', icon: 'Gift', color: '#f43f5e' },
    { name: 'Otros Gastos', icon: 'MoreHorizontal', color: '#94a3b8' },
];
function expenseCategoryPresetOrder() {
    return Object.fromEntries(exports.EXPENSE_CATEGORY_DEFAULT_PRESETS.map((p, i) => [p.name, i]));
}
//# sourceMappingURL=expenseCategoryPresets.js.map