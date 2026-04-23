import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
export declare const getAdminStats: (_req: AuthRequest, res: Response) => Promise<void>;
/**
 * Conteos ligeros para cierre del criterio de “periodo sin nulos”.
 * No modifica datos; el arreglo es SQL manual o webhooks a futuro.
 */
export declare const getAdminSubscriptionDataQuality: (_req: AuthRequest, res: Response) => Promise<void>;
export declare const getAdminHealth: (_req: AuthRequest, res: Response) => Promise<void>;
export declare const listAdminAuditLog: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const listUsers: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getUserById: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getUserSubscriptionPayments: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const getSystemSettings: (_req: AuthRequest, res: Response) => Promise<void>;
export declare const updateSystemSettings: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const impersonateUser: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const stopImpersonation: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
export declare const updateUserAdmin: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=adminController.d.ts.map