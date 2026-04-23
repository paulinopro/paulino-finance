import { Request, Response } from 'express';
/**
 * Webhook de PayPal: BILLING.SUBSCRIPTION.*, PAYMENT.SALE.COMPLETED.
 * - Activar en el panel de PayPal el evento PAYMENT.SALE.COMPLETED para el historial de cobros.
 * - En producción: PAYPAL_WEBHOOK_ID + verificación de firma (o PAYPAL_SKIP_WEBHOOK_VERIFY solo en dev).
 */
export declare const paypalWebhook: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=paypalWebhookController.d.ts.map