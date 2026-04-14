import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export const requireSuperAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
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
