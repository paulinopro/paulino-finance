import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const listUsers: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getSystemSettings: (_req: AuthRequest, res: Response) => Promise<void>;
export declare const updateSystemSettings: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const impersonateUser: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const stopImpersonation: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateUserAdmin: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=adminController.d.ts.map