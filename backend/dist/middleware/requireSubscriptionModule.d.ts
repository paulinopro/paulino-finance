import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
export declare function requireSubscriptionModule(moduleKey: string): (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=requireSubscriptionModule.d.ts.map