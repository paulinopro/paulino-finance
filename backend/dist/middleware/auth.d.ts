import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    userId?: number;
    user?: any;
    impersonatedBy?: number;
    isSuperAdmin?: boolean;
}
export declare const authenticate: (req: AuthRequest, res: Response, next: NextFunction) => Response<any, Record<string, any>> | undefined;
//# sourceMappingURL=auth.d.ts.map