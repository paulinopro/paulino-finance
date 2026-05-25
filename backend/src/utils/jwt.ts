import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

export interface AuthJwtPayload {
  userId: number;
  isSuperAdmin?: boolean;
  impersonatedBy?: number;
}

const JWT_PURPOSE_GOOGLE_AGENDA = 'agenda_google_oauth_link';

/** Token corto de estado OAuth (solo enlaza cuenta Google al usuario tras callback). */
export function signGoogleAgendaOAuthState(userId: number): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }
  return jwt.sign({ purpose: JWT_PURPOSE_GOOGLE_AGENDA, agendaUserId: userId }, jwtSecret || 'dev-only-fallback-change-in-production', {
    expiresIn: '15m',
  } as SignOptions);
}

export function verifyGoogleAgendaOAuthState(token: string): number | null {
  try {
    const jwtSecret = process.env.JWT_SECRET || 'dev-only-fallback-change-in-production';
    const p = jwt.verify(token, jwtSecret) as JwtPayload;
    if (p.purpose !== JWT_PURPOSE_GOOGLE_AGENDA) return null;
    const uid = p.agendaUserId;
    if (typeof uid === 'number' && Number.isFinite(uid)) return uid;
    if (typeof uid === 'string' && /^[0-9]+$/.test(uid)) return parseInt(uid, 10);
    return null;
  } catch {
    return null;
  }
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
