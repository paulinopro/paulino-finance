import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getIncome: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getIncomeItem: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createIncome: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateIncome: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteIncome: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateIncomeReceiptStatus: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=incomeController.d.ts.map