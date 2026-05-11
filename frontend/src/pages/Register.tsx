import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import AuthBrandMark from '../components/AuthBrandMark';
import api from '../services/api';

const Register: React.FC = () => {
  const { t } = useTranslation();
  const [registrationEnabled, setRegistrationEnabled] = useState<boolean | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get<{ registrationEnabled: boolean }>('/auth/registration-status')
      .then((res) => setRegistrationEnabled(res.data.registrationEnabled))
      .catch(() => setRegistrationEnabled(true));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error(t('auth.register.passwordsMismatch'));
      return;
    }

    if (formData.password.length < 6) {
      toast.error(t('auth.register.passwordTooShort'));
      return;
    }

    setLoading(true);

    try {
      await register(
        formData.email,
        formData.password,
        formData.firstName || undefined,
        formData.lastName || undefined
      );
      toast.success(t('auth.register.toastCreated'));
      navigate('/');
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('auth.register.toastErrorFallback'));
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
            <h1 className="page-title mb-2">{t('auth.register.title')}</h1>
            <p className="text-dark-400 text-sm sm:text-base">{t('auth.register.subtitle')}</p>
          </div>

          {registrationEnabled === false && (
            <div className="mb-6 p-4 rounded-lg bg-dark-700 border border-dark-600 text-dark-200 text-sm text-center">
              {t('auth.register.disabledBanner')}
            </div>
          )}

          {registrationEnabled === null && (
            <p className="text-center text-dark-500 text-sm mb-4">{t('auth.register.checkingStatus')}</p>
          )}

          {registrationEnabled !== false && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="label">
                  {t('auth.register.firstName')}
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="input w-full"
                  placeholder={t('auth.register.phonePlaceholderFN')}
                />
              </div>
              <div>
                <label htmlFor="lastName" className="label">
                  {t('auth.register.lastName')}
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="input w-full"
                  placeholder={t('auth.register.phonePlaceholderLN')}
                />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="label">
                {t('auth.register.email')}
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                className="input w-full"
                placeholder="tu@email.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                {t('auth.register.password')}
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={formData.password}
                onChange={handleChange}
                className="input w-full"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="label">
                {t('auth.register.confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="input w-full"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading || registrationEnabled !== true}
              className="btn-primary w-full py-3 mt-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t('auth.register.submitLoading') : t('auth.register.submitIdle')}
            </button>
          </form>
          )}

          <p className="mt-6 text-center text-dark-400">
            {t('auth.register.haveAccount')}{' '}
            <Link to="/login" className="text-primary-500 hover:text-primary-400 font-medium">
              {t('auth.register.loginCta')}
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Register;
