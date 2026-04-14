import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getCategories: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createCategory: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateCategory: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteCategory: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=categoryController.d.ts.map