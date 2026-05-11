import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ArrowLeft } from 'lucide-react';
import AuthBrandMark from '../components/AuthBrandMark';
import api from '../services/api';

const ForgotPassword: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
      toast.success(t('auth.forgot.toastSuccess'));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('auth.forgot.toastErrorFallback'));
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
            <h1 className="page-title mb-2">{t('auth.forgot.title')}</h1>
            <p className="text-dark-400 text-sm sm:text-base">
              {sent ? t('auth.forgot.subtitleSent') : t('auth.forgot.subtitleBeforeSend')}
            </p>
          </div>

          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="label">
                  {t('auth.forgot.email')}
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input w-full"
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? t('auth.forgot.submitSending') : t('auth.forgot.submitIdle')}
              </button>
            </form>
          ) : (
            <p className="text-dark-300 text-sm text-center">{t('auth.forgot.spamHint')}</p>
          )}

          <Link
            to="/login"
            className="mt-6 flex items-center justify-center gap-2 text-primary-500 hover:text-primary-400 text-sm font-medium"
          >
            <ArrowLeft size={16} />
            {t('auth.forgot.backToLogin')}
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
