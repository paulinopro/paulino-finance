import crypto from 'crypto';

const PREFIX = 'v1:';

function vaultKey(): Buffer {
  const env = process.env.AGENDA_TOKEN_KEY;
  if (env && env.length >= 32) {
    return crypto.createHash('sha256').update(env, 'utf8').digest();
  }
  const jwtSecret = process.env.JWT_SECRET || '';
  const dev = jwtSecret.length > 0 ? jwtSecret : 'dev-agenda-token-vault-change-me';
  return crypto.createHash('sha256').update(`${dev}:paulino-finance-agenda`, 'utf8').digest();
}

/**
 * Codifica valores sensibles antes de persistirlos (p. ej. refresh token OAuth).
 * Formato Base64 concatenando iv + authTag + cipher (AES-256-GCM).
 */
export function encryptAgendaSecret(plainText: string): string {
  const key = vaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const combined = Buffer.concat([iv, tag, enc]).toString('base64');
  return `${PREFIX}${combined}`;
}

export function decryptAgendaSecret(stored: string): string | null {
  try {
    if (!stored.startsWith(PREFIX)) {
      /** Valores legacy en claro durante desarrollo anterior */
      if (process.env.NODE_ENV !== 'production') return stored;
      return null;
    }
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const key = vaultKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}
