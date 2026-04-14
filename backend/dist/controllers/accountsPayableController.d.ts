import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getAccountsPayable: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createAccountPayable: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateAccountPayable: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const payAccountPayable: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteAccountPayable: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=accountsPayableController.d.ts.map