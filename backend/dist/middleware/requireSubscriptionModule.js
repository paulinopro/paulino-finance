"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireSubscriptionModule = requireSubscriptionModule;
const subscriptionService_1 = require("../services/subscriptionService");
function requireSubscriptionModule(moduleKey) {
    return async (req, res, next) => {
        try {
            if (req.isSuperAdmin) {
                return next();
            }
            const userId = req.userId;
            if (userId == null) {
                return res.status(401).json({ message: 'No autenticado' });
            }
            const allowed = await (0, subscriptionService_1.getAllowedModulesForUserId)(userId);
            if (!allowed.includes(moduleKey)) {
                return res.status(403).json({
                    message: 'Tu suscripción no incluye este módulo. Elige un plan en Suscripción / planes.',
                    code: 'SUBSCRIPTION_MODULE_DENIED',
                    module: moduleKey,
                });
            }
            next();
        }
        catch (e) {
            console.error('requireSubscriptionModule', e);
            res.status(500).json({ message: 'Error al comprobar suscripción' });
        }
    };
}
//# sourceMappingURL=requireSubscriptionModule.js.map