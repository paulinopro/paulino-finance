import type { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
/** Conecta Apple ID + contraseña de aplicación (CalDAV Basic). Las credenciales se cifran en reposo (`oauth_refresh_token`). */
export declare function icloudCalendarConnect(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function icloudCalendarDisconnect(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function icloudCalendarListWritable(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
export declare function icloudCalendarSetDefault(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=agendaICloudController.d.ts.map