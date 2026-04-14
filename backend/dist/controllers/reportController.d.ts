import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getExpensesReport: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getLoansReport: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getCardsReport: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAccountsReport: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getComprehensiveReport: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=reportController.d.ts.map