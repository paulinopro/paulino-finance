import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
export declare const requireSuperAdmin: (req: AuthRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=requireSuperAdmin.d.ts.map