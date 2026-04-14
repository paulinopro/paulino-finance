import { Request, Response } from 'express';
/**
 * Webhook de PayPal (BILLING.SUBSCRIPTION.*).
 * En producción: PAYPAL_WEBHOOK_ID + verificación de firma (o PAYPAL_SKIP_WEBHOOK_VERIFY solo en dev).
 */
export declare const paypalWebhook: (req: Request, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=paypalWebhookController.d.ts.map