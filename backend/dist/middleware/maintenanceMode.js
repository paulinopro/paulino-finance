"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMaintenanceModeCached = getMaintenanceModeCached;
exports.invalidateMaintenanceModeCache = invalidateMaintenanceModeCache;
exports.maintenanceApiGuard = maintenanceApiGuard;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const database_1 = require("../config/database");
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Sin trailing slash. Rutas que siguen operando con escritura en mantenimiento. */
const WHITELIST_PREFIXES = ['/api/auth', '/api/admin', '/api/subscription'];
let cache = { t: 0, on: false };
const CACHE_MS = 15000;
async function getMaintenanceModeCached() {
    if (Date.now() - cache.t < CACHE_MS) {
        return cache.on;
    }
    try {
        const r = await (0, database_1.query)(`SELECT value FROM system_settings WHERE key = 'maintenance_mode'`);
        const on = r.rows[0]?.value === 'true';
        cache = { t: Date.now(), on };
        return on;
    }
    catch {
        cache = { t: Date.now(), on: false };
        return false;
    }
}
function invalidateMaintenanceModeCache() {
    cache = { t: 0, on: false };
}
function isSuperAdminFromAuthHeader(req) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token)
        return false;
    try {
        const secret = process.env.JWT_SECRET || 'dev-only-fallback-change-in-production';
        const decoded = jsonwebtoken_1.default.verify(token, secret);
        return decoded.isSuperAdmin === true;
    }
    catch {
        return false;
    }
}
function requestPathname(req) {
    return (req.originalUrl || req.url || '')
        .split('?')[0]
        .replace(/\/$/, '') || '/';
}
/**
 * Con modo mantenimiento, bloquea solo métodos mutadores fuera de auth/admin/suscripción.
 * El JWT de super admin permite seguir operando.
 */
function maintenanceApiGuard(req, res, next) {
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
            message: 'La plataforma está en mantenimiento (solo lectura). Los super administradores pueden operar con normalidad.',
            maintenanceMode: true,
        });
    })
        .catch(next);
}
//# sourceMappingURL=maintenanceMode.js.map