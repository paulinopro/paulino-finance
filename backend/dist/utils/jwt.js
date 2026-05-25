"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signGoogleAgendaOAuthState = signGoogleAgendaOAuthState;
exports.verifyGoogleAgendaOAuthState = verifyGoogleAgendaOAuthState;
exports.signAuthToken = signAuthToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_PURPOSE_GOOGLE_AGENDA = 'agenda_google_oauth_link';
/** Token corto de estado OAuth (solo enlaza cuenta Google al usuario tras callback). */
function signGoogleAgendaOAuthState(userId) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret && process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required in production');
    }
    return jsonwebtoken_1.default.sign({ purpose: JWT_PURPOSE_GOOGLE_AGENDA, agendaUserId: userId }, jwtSecret || 'dev-only-fallback-change-in-production', {
        expiresIn: '15m',
    });
}
function verifyGoogleAgendaOAuthState(token) {
    try {
        const jwtSecret = process.env.JWT_SECRET || 'dev-only-fallback-change-in-production';
        const p = jsonwebtoken_1.default.verify(token, jwtSecret);
        if (p.purpose !== JWT_PURPOSE_GOOGLE_AGENDA)
            return null;
        const uid = p.agendaUserId;
        if (typeof uid === 'number' && Number.isFinite(uid))
            return uid;
        if (typeof uid === 'string' && /^[0-9]+$/.test(uid))
            return parseInt(uid, 10);
        return null;
    }
    catch {
        return null;
    }
}
function signAuthToken(payload) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret && process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required in production');
    }
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    return jsonwebtoken_1.default.sign(payload, jwtSecret || 'dev-only-fallback-change-in-production', { expiresIn: jwtExpiresIn });
}
//# sourceMappingURL=jwt.js.map