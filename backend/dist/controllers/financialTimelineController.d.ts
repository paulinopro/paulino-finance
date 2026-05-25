import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getExpenseTimeline: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getIncomeTimeline: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=financialTimelineController.d.ts.map