import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import AuthBrandMark from '../components/AuthBrandMark';

const Login: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await login(email, password);
      toast.success(t('auth.login.toastWelcome'));
      navigate('/');
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('auth.login.toastErrorFallback'));
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
            <h1 className="page-title mb-2">{t('auth.login.title')}</h1>
            <p className="text-dark-400 text-sm sm:text-base">{t('auth.login.subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="label">
                {t('auth.login.email')}
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input w-full"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label htmlFor="password" className="label mb-0">
                  {t('auth.login.password')}
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs sm:text-sm text-primary-500 hover:text-primary-400 font-medium shrink-0"
                >
                  {t('auth.login.forgotPassword')}
                </Link>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input w-full"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('auth.login.submitLoading') : t('auth.login.submitIdle')}
            </button>
          </form>

          <p className="mt-6 text-center text-dark-400">
            {t('auth.login.noAccount')}{' '}
            <Link to="/register" className="text-primary-500 hover:text-primary-400 font-medium">
              {t('auth.login.signupCta')}
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
