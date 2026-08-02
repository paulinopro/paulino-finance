import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare function getItems(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function getOneItem(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function postItem(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function patchItem(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function removeItem(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
export declare function getConnections(req: AuthRequest, res: Response): Promise<void>;
export declare function postSync(req: AuthRequest, res: Response): Promise<void>;
export declare function postImportRange(req: AuthRequest, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=agendaController.d.ts.map