import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getBudgets: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createBudget: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateBudget: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteBudget: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=budgetController.d.ts.map