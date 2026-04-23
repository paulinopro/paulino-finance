import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const listCashAdjustments: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createCashAdjustment: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=cashAdjustmentController.d.ts.map