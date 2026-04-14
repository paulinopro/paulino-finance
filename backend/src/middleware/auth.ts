import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthJwtPayload } from '../utils/jwt';

export interface AuthRequest extends Request {
  userId?: number;
  user?: any;
  impersonatedBy?: number;
  isSuperAdmin?: boolean;
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret && process.env.NODE_ENV === 'production') {
      return res.status(500).json({ message: 'Server misconfiguration' });
    }
    const decoded = jwt.verify(
      token,
      secret || 'dev-only-fallback-change-in-production'
    ) as AuthJwtPayload;

    req.userId = decoded.userId;
    req.impersonatedBy = decoded.impersonatedBy;
    req.isSuperAdmin = decoded.isSuperAdmin === true;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
