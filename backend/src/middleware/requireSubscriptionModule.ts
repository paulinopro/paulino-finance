import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { getAllowedModulesForUserId } from '../services/subscriptionService';

export function requireSubscriptionModule(moduleKey: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (req.isSuperAdmin) {
        return next();
      }
      const userId = req.userId;
      if (userId == null) {
        return res.status(401).json({ message: 'No autenticado' });
      }
      const allowed = await getAllowedModulesForUserId(userId);
      if (!allowed.includes(moduleKey)) {
        return res.status(403).json({
          message:
            'Tu suscripción no incluye este módulo. Elige un plan en Suscripción / planes.',
          code: 'SUBSCRIPTION_MODULE_DENIED',
          module: moduleKey,
        });
      }
      next();
    } catch (e) {
      console.error('requireSubscriptionModule', e);
      res.status(500).json({ message: 'Error al comprobar suscripción' });
    }
  };
}
