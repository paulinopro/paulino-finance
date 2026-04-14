import jwt, { SignOptions } from 'jsonwebtoken';

export interface AuthJwtPayload {
  userId: number;
  isSuperAdmin?: boolean;
  impersonatedBy?: number;
}

export function signAuthToken(payload: AuthJwtPayload): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(
    payload,
    jwtSecret || 'dev-only-fallback-change-in-production',
    { expiresIn: jwtExpiresIn } as SignOptions
  );
}
