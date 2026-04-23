import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const listAccountTransfers: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createAccountTransfer: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=accountTransferController.d.ts.map