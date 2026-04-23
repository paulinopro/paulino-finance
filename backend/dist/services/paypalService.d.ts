/**
 * Integración mínima con PayPal Subscriptions (REST v1).
 * Requiere en .env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_API_BASE
 * (sandbox: https://api-m.sandbox.paypal.com, live: https://api-m.paypal.com)
 */
type CreateApprovalResult = {
    ok: true;
    approvalUrl: string;
    paypalSubscriptionId: string;
} | {
    ok: false;
    message: string;
};
/** OAuth2 client_credentials; reutilizable por otros servicios PayPal (catálogo, planes, etc.). */
export declare function getAccessToken(): Promise<string | null>;
export declare function createPaypalSubscriptionApproval(params: {
    userId: number;
    paypalPlanId: string | null;
    billingCycle: string;
    returnUrl: string;
    cancelUrl: string;
}): Promise<CreateApprovalResult>;
export type PaypalWebhookVerifyParams = {
    webhookId: string;
    webhookEvent: Record<string, unknown>;
    transmissionId?: string;
    transmissionTime?: string;
    certUrl?: string;
    authAlgo?: string;
    transmissionSig?: string;
};
/**
 * Verifica la firma del webhook con POST /v1/notifications/verify-webhook-signature.
 * Requiere PAYPAL_WEBHOOK_ID (ID del webhook en el panel de desarrollador PayPal).
 */
export declare function verifyPaypalWebhookSignature(params: PaypalWebhookVerifyParams): Promise<boolean>;
export {};
//# sourceMappingURL=paypalService.d.ts.map