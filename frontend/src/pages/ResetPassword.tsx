import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import AuthBrandMark from '../components/AuthBrandMark';
import api from '../services/api';

const ResetPassword: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tokenFromUrl = searchParams.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState(tokenFromUrl);

  useEffect(() => {
    setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveToken = (tokenFromUrl || token).trim();
    if (!effectiveToken) {
      toast.error(t('auth.reset.toastMissingToken'));
      return;
    }
    if (password.length < 6) {
      toast.error(t('auth.reset.toastPasswordTooShort'));
      return;
    }
    if (password !== confirm) {
      toast.error(t('auth.reset.toastPasswordMismatch'));
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token: effectiveToken, password });
      toast.success(t('auth.reset.toastUpdated'));
      navigate('/login', { replace: true });
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('auth.reset.toastErrorFallback'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 flex items-center justify-center p-4 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <div className="card">
          <div className="text-center mb-8">
            <AuthBrandMark />
            <h1 className="page-title mb-2">{t('auth.reset.title')}</h1>
            <p className="text-dark-400 text-sm sm:text-base">{t('auth.reset.subtitle')}</p>
          </div>

          {!tokenFromUrl && (
            <div className="mb-4 p-3 rounded-lg bg-amber-900/25 border border-amber-700/40 text-amber-100 text-sm">
              {t('auth.reset.missingTokenBanner')}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {!tokenFromUrl && (
              <div>
                <label htmlFor="token" className="label">
                  {t('auth.reset.tokenLabel')}
                </label>
                <input
                  id="token"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="input w-full font-mono text-sm"
                  placeholder={t('auth.reset.tokenPlaceholder')}
                  autoComplete="off"
                />
              </div>
            )}

            <div>
              <label htmlFor="new-password" className="label">
                {t('auth.reset.newPassword')}
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                placeholder={t('auth.reset.passwordPlaceholder')}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="label">
                {t('auth.reset.confirmPassword')}
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input w-full"
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('auth.reset.saveLoading') : t('auth.reset.saveIdle')}
            </button>
          </form>

          <div className="mt-6 flex flex-col gap-2 text-center text-sm">
            <Link to="/forgot-password" className="text-primary-500 hover:text-primary-400 font-medium">
              {t('auth.reset.anotherLink')}
            </Link>
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-dark-400 hover:text-dark-300"
            >
              <ArrowLeft size={16} />
              {t('auth.reset.backToLogin')}
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default ResetPassword;
