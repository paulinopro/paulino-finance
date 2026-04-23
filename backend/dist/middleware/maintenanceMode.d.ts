import { Request, Response, NextFunction } from 'express';
export declare function getMaintenanceModeCached(): Promise<boolean>;
export declare function invalidateMaintenanceModeCache(): void;
/**
 * Con modo mantenimiento, bloquea solo métodos mutadores fuera de auth/admin/suscripción.
 * El JWT de super admin permite seguir operando.
 */
export declare function maintenanceApiGuard(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=maintenanceMode.d.ts.map