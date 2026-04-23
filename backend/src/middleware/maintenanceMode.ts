import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database';
import { AuthJwtPayload } from '../utils/jwt';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Sin trailing slash. Rutas que siguen operando con escritura en mantenimiento. */
const WHITELIST_PREFIXES = ['/api/auth', '/api/admin', '/api/subscription'];

let cache: { t: number; on: boolean } = { t: 0, on: false };
const CACHE_MS = 15_000;

export async function getMaintenanceModeCached(): Promise<boolean> {
  if (Date.now() - cache.t < CACHE_MS) {
    return cache.on;
  }
  try {
    const r = await query(`SELECT value FROM system_settings WHERE key = 'maintenance_mode'`);
    const on = r.rows[0]?.value === 'true';
    cache = { t: Date.now(), on };
    return on;
  } catch {
    cache = { t: Date.now(), on: false };
    return false;
  }
}

export function invalidateMaintenanceModeCache(): void {
  cache = { t: 0, on: false };
}

function isSuperAdminFromAuthHeader(req: Request): boolean {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return false;
  try {
    const secret = process.env.JWT_SECRET || 'dev-only-fallback-change-in-production';
    const decoded = jwt.verify(token, secret) as AuthJwtPayload;
    return decoded.isSuperAdmin === true;
  } catch {
    return false;
  }
}

function requestPathname(req: Request): string {
  return (req.originalUrl || (req as Request & { url?: string }).url || '')
    .split('?')[0]
    .replace(/\/$/, '') || '/';
}

/**
 * Con modo mantenimiento, bloquea solo métodos mutadores fuera de auth/admin/suscripción.
 * El JWT de super admin permite seguir operando.
 */
export function maintenanceApiGuard(req: Request, res: Response, next: NextFunction): void {
  void getMaintenanceModeCached()
    .then((maint) => {
      if (!maint) {
        return next();
      }
      if (!MUTATING.has(req.method)) {
        return next();
      }
      const path = requestPathname(req);
      for (const pre of WHITELIST_PREFIXES) {
        if (path === pre || path.startsWith(`${pre}/`)) {
          return next();
        }
      }
      if (isSuperAdminFromAuthHeader(req)) {
        return next();
      }
      return res.status(503).json({
        message:
          'La plataforma está en mantenimiento (solo lectura). Los super administradores pueden operar con normalidad.',
        maintenanceMode: true,
      });
    })
    .catch(next);
}
