"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const loginMax = process.env.AUTH_LOGIN_MAX_PER_WINDOW !== undefined
    ? Number(process.env.AUTH_LOGIN_MAX_PER_WINDOW)
    : process.env.NODE_ENV === 'production'
        ? 40
        : 300;
const registerMax = process.env.AUTH_REGISTER_MAX_PER_WINDOW !== undefined
    ? Number(process.env.AUTH_REGISTER_MAX_PER_WINDOW)
    : process.env.NODE_ENV === 'production'
        ? 15
        : 100;
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: loginMax,
    message: { message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const registerLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: registerMax,
    message: { message: 'Demasiados registros desde esta IP. Intenta más tarde.' },
    standardHeaders: true,
    legacyHeaders: false,
});
const forgotPasswordMax = process.env.AUTH_FORGOT_PASSWORD_MAX_PER_WINDOW !== undefined
    ? Number(process.env.AUTH_FORGOT_PASSWORD_MAX_PER_WINDOW)
    : process.env.NODE_ENV === 'production'
        ? 5
        : 30;
const forgotPasswordLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000,
    max: forgotPasswordMax,
    message: {
        message: 'Demasiadas solicitudes de recuperación. Intenta de nuevo en una hora.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
const resetPasswordLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_RESET_PASSWORD_MAX_PER_WINDOW) || 20,
    message: { message: 'Demasiados intentos. Espera unos minutos.' },
    standardHeaders: true,
    legacyHeaders: false,
});
router.get('/registration-status', authController_1.getRegistrationStatus);
router.post('/register', registerLimiter, authController_1.register);
router.post('/login', loginLimiter, authController_1.login);
router.post('/forgot-password', forgotPasswordLimiter, authController_1.forgotPassword);
router.post('/reset-password', resetPasswordLimiter, authController_1.resetPasswordWithToken);
router.get('/me', auth_1.authenticate, authController_1.getMe);
router.put('/me', auth_1.authenticate, authController_1.updateMe);
router.put('/password', auth_1.authenticate, authController_1.changePassword);
exports.default = router;
//# sourceMappingURL=auth.js.map