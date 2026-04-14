import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getExpenses: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getExpense: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createExpense: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateExpense: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteExpense: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateExpensePaymentStatus: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=expenseController.d.ts.map