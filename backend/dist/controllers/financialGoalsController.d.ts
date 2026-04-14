import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getFinancialGoals: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createFinancialGoal: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateFinancialGoal: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteFinancialGoal: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=financialGoalsController.d.ts.map