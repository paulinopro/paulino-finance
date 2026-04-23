/**
 * Aprovisiona producto del catálogo PayPal + planes de facturación (mensual/anual)
 * según la API documentada (Catalog Products + Billing Plans).
 * Reutiliza OAuth de paypalService (PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE).
 */
export type SubscriptionPlanRow = {
    id: number;
    name: string;
    description: string | null;
    price_monthly: string | number;
    price_yearly: string | number;
    currency: string;
    paypal_product_id: string | null;
    paypal_plan_id_monthly: string | null;
    paypal_plan_id_yearly: string | null;
};
export type ProvisionResult = {
    ok: true;
    paypalProductId: string;
    paypalPlanIdMonthly: string;
    paypalPlanIdYearly: string;
    created: {
        product: boolean;
        monthly: boolean;
        yearly: boolean;
    };
} | {
    ok: false;
    message: string;
};
/**
 * Crea en PayPal lo que falte (producto y/o planes) y devuelve los IDs finales.
 * No sobrescribe IDs existentes salvo que falte el recurso en PayPal (solo creación incremental).
 */
export declare function provisionPaypalSubscriptionPlan(row: SubscriptionPlanRow): Promise<ProvisionResult>;
/** Carga la fila por id y persiste los IDs tras aprovisionar. */
export declare function syncPaypalSubscriptionPlanById(planId: number): Promise<ProvisionResult>;
//# sourceMappingURL=paypalPlanProvisioningService.d.ts.map