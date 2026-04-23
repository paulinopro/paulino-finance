import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  getMe,
  updateMe,
  getRegistrationStatus,
  getPublicConfig,
  changePassword,
  forgotPassword,
  resetPasswordWithToken,
} from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

const loginMax =
  process.env.AUTH_LOGIN_MAX_PER_WINDOW !== undefined
    ? Number(process.env.AUTH_LOGIN_MAX_PER_WINDOW)
    : process.env.NODE_ENV === 'production'
      ? 40
      : 300;

const registerMax =
  process.env.AUTH_REGISTER_MAX_PER_WINDOW !== undefined
    ? Number(process.env.AUTH_REGISTER_MAX_PER_WINDOW)
    : process.env.NODE_ENV === 'production'
      ? 15
      : 100;

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: loginMax,
  message: { message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: registerMax,
  message: { message: 'Demasiados registros desde esta IP. Intenta más tarde.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordMax =
  process.env.AUTH_FORGOT_PASSWORD_MAX_PER_WINDOW !== undefined
    ? Number(process.env.AUTH_FORGOT_PASSWORD_MAX_PER_WINDOW)
    : process.env.NODE_ENV === 'production'
      ? 5
      : 30;

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: forgotPasswordMax,
  message: {
    message: 'Demasiadas solicitudes de recuperación. Intenta de nuevo en una hora.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RESET_PASSWORD_MAX_PER_WINDOW) || 20,
  message: { message: 'Demasiados intentos. Espera unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/registration-status', getRegistrationStatus);
router.get('/public-config', getPublicConfig);
router.post('/register', registerLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/forgot-password', forgotPasswordLimiter, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, resetPasswordWithToken);
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);
router.put('/password', authenticate, changePassword);

export default router;
