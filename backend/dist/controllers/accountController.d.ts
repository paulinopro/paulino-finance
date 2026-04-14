import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getAccounts: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAccount: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const createAccount: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateAccount: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteAccount: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=accountController.d.ts.map