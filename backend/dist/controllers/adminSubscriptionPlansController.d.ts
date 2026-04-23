import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const listSubscriptionPlans: (_req: AuthRequest, res: Response) => Promise<void>;
export declare const createSubscriptionPlan: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateSubscriptionPlan: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
/** Crea en PayPal el producto (catálogo) y los planes de facturación mensual/anual; guarda PROD- y P- en BD. */
export declare const syncSubscriptionPlanPaypal: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteSubscriptionPlan: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=adminSubscriptionPlansController.d.ts.map