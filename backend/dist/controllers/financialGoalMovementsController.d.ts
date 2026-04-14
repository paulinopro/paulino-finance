import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getGoalMovements: (req: AuthRequest, res: Response) => Promise<void>;
export declare const addGoalMovement: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateGoalMovement: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const deleteGoalMovement: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=financialGoalMovementsController.d.ts.map