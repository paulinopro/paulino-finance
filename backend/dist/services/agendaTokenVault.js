"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptAgendaSecret = encryptAgendaSecret;
exports.decryptAgendaSecret = decryptAgendaSecret;
const crypto_1 = __importDefault(require("crypto"));
const PREFIX = 'v1:';
function vaultKey() {
    const env = process.env.AGENDA_TOKEN_KEY;
    if (env && env.length >= 32) {
        return crypto_1.default.createHash('sha256').update(env, 'utf8').digest();
    }
    const jwtSecret = process.env.JWT_SECRET || '';
    const dev = jwtSecret.length > 0 ? jwtSecret : 'dev-agenda-token-vault-change-me';
    return crypto_1.default.createHash('sha256').update(`${dev}:paulino-finance-agenda`, 'utf8').digest();
}
/**
 * Codifica valores sensibles antes de persistirlos (p. ej. refresh token OAuth).
 * Formato Base64 concatenando iv + authTag + cipher (AES-256-GCM).
 */
function encryptAgendaSecret(plainText) {
    const key = vaultKey();
    const iv = crypto_1.default.randomBytes(12);
    const cipher = crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, tag, enc]).toString('base64');
    return `${PREFIX}${combined}`;
}
function decryptAgendaSecret(stored) {
    try {
        if (!stored.startsWith(PREFIX)) {
            /** Valores legacy en claro durante desarrollo anterior */
            if (process.env.NODE_ENV !== 'production')
                return stored;
            return null;
        }
        const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
        const iv = raw.subarray(0, 12);
        const tag = raw.subarray(12, 28);
        const data = raw.subarray(28);
        const key = vaultKey();
        const decipher = crypto_1.default.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(data), decipher.final()]);
        return dec.toString('utf8');
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=agendaTokenVault.js.map