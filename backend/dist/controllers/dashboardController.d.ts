import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getSummary: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getStats: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getMonthlyHealth: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAnnualHealth: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getDailyHealth: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getWeeklyHealth: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=dashboardController.d.ts.map