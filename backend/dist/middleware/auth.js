"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authenticate = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'No token provided' });
        }
        const secret = process.env.JWT_SECRET;
        if (!secret && process.env.NODE_ENV === 'production') {
            return res.status(500).json({ message: 'Server misconfiguration' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, secret || 'dev-only-fallback-change-in-production');
        req.userId = decoded.userId;
        req.impersonatedBy = decoded.impersonatedBy;
        req.isSuperAdmin = decoded.isSuperAdmin === true;
        next();
    }
    catch (error) {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};
exports.authenticate = authenticate;
//# sourceMappingURL=auth.js.map