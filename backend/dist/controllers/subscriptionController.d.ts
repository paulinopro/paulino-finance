import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getMySubscription: (req: AuthRequest, res: Response) => Promise<void>;
export declare const listPublicPlans: (_req: Request, res: Response) => Promise<void>;
export declare const startPaypalSubscription: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=subscriptionController.d.ts.map