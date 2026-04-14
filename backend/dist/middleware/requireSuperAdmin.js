"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSuperAdmin = void 0;
const requireSuperAdmin = (req, res, next) => {
    if (!req.isSuperAdmin) {
        return res.status(403).json({ message: 'Se requiere cuenta de super administrador' });
    }
    if (req.impersonatedBy != null) {
        return res.status(403).json({
            message: 'Cierra la sesión suplantada antes de usar el panel de administración',
        });
    }
    next();
};
exports.requireSuperAdmin = requireSuperAdmin;
//# sourceMappingURL=requireSuperAdmin.js.map