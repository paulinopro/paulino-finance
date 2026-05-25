import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare function googleCalendarOAuthCallbackPublic(req: Request, res: Response): Promise<void>;
export declare function googleCalendarAuthorizeStart(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function googleCalendarDisconnect(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function googleCalendarListWritable(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function googleCalendarSetDefault(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=agendaOAuthController.d.ts.map