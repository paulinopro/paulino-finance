"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAuthToken = signAuthToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function signAuthToken(payload) {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret && process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required in production');
    }
    const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    return jsonwebtoken_1.default.sign(payload, jwtSecret || 'dev-only-fallback-change-in-production', { expiresIn: jwtExpiresIn });
}
//# sourceMappingURL=jwt.js.map