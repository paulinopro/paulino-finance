import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
/**
 * Métricas y score 0–100 coherentes cuando el ingreso del período es 0:
 * evita dividir entre 0 (ratios en 0) y el +10 artificial por gastos bajo 70% del ingreso
 * cuando hay gastos pero no ingreso declarado.
 */
export declare function computeFinancialHealthMetrics(totalIncomeDop: number, totalExpensesDop: number, totalDebtsDop: number): {
    savings: number;
    savingsRate: number;
    debtToIncomeRatio: number;
    expenseToIncomeRatio: number;
    healthScore: number;
};
export declare const getSummary: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getStats: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getMonthlyHealth: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAnnualHealth: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getDailyHealth: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getWeeklyHealth: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=dashboardController.d.ts.map