/**
 * Glosario datos / UI (español) — ficha cliente y /subscription
 * - `current_period_start` / `current_period_end` (suscripción activa): ventana de **ciclo** actual
 *   (típ. desde último corte o último cobro reconocido hasta `next_billing_time` o fin de ciclo).
 * - Cada fila de `subscription_payments`: el periodo **facturado** por ese cobro (alineado cuando PayPal/BD
 *   lo permiten; ver `assignPlanToUser` y `paypalWebhookController`).
 * - `billing_interval`: intención de modalidad (mensual/anual) según plan PayPal o asignación manual.
 */
export type BillingInterval = 'monthly' | 'yearly';
/** Resuelve mensual/anual desde columna persistida o comparando paypal_plan_id con el plan. */
export declare function resolveBillingIntervalForRow(row: {
    billing_interval?: string | null;
    paypal_plan_id?: string | null;
    paypal_plan_id_monthly?: string | null;
    paypal_plan_id_yearly?: string | null;
}): BillingInterval | null;
export declare function getAllowedModulesForUserId(userId: number): Promise<string[]>;
export declare function getSubscriptionDetailsForUser(userId: number): Promise<{
    isSuperAdmin: boolean;
    status: "active";
    plan: null;
    modules: ("dashboard" | "cards" | "loans" | "income" | "expenses" | "accounts" | "reports" | "calendar" | "accounts_payable" | "accounts_receivable" | "budgets" | "financial_goals" | "cash_flow" | "projections" | "vehicles" | "notifications" | "categories" | "templates" | "settings" | "profile" | "subscription")[];
    currentPeriodStart: null;
    currentPeriodEnd: null;
    billingInterval: null;
    paypalSubscriptionId: null;
} | {
    isSuperAdmin: boolean;
    status: "none";
    plan: null;
    modules: string[];
    currentPeriodStart: null;
    currentPeriodEnd: null;
    billingInterval: null;
    paypalSubscriptionId: null;
} | {
    isSuperAdmin: boolean;
    status: any;
    plan: {
        id: any;
        name: any;
        slug: any;
        priceMonthly: number;
        priceYearly: number;
        currency: any;
    };
    modules: string[];
    currentPeriodStart: any;
    currentPeriodEnd: any;
    billingInterval: BillingInterval | null;
    paypalSubscriptionId: any;
}>;
export type SubscriptionPaymentRow = {
    id: number;
    amount: string;
    currency: string;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
    paidAt: string;
    source: string;
    planName: string | null;
    planSlug: string | null;
};
/** Historial de pagos por `user_id` (sin comprobar actor). Usar solo desde `requireSuperAdmin` o propio usuario. */
export declare function getSubscriptionPaymentHistoryByUserId(userId: number): Promise<SubscriptionPaymentRow[]>;
export declare function getSubscriptionPaymentHistoryForUser(userId: number): Promise<SubscriptionPaymentRow[]>;
type ManualAssignInterval = 'monthly' | 'yearly';
/**
 * Asignación manual desde consola (sin flujo PayPal en ese momento). Fija un ciclo **mensual o anual**
 * a partir de ahora. Los webhooks `BILLING.SUBSCRIPTION.*` sobrescriben periodo e intervalo al sincronizar
 * con PayPal. El intervalo anual acota el riesgo de desalinear con un cobro anual en PayPal hasta el
 * próximo evento; ver `docs/Operacion_Super_Admin.md`.
 */
export declare function assignPlanToUser(userId: number, planId: number, options?: {
    billingInterval?: ManualAssignInterval;
}): Promise<void>;
export {};
//# sourceMappingURL=subscriptionService.d.ts.map