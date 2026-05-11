import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { UserCircle, Lock, Mail } from 'lucide-react';

const Profile: React.FC = () => {
  const { t } = useTranslation();
  const { user, updateUser } = useAuth();
  const [account, setAccount] = useState({
    email: '',
    firstName: '',
    lastName: '',
    cedula: '',
  });
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  });
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setAccount({
        email: user.email || '',
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        cedula: user.cedula ?? '',
      });
    }
  }, [user]);

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAccount(true);
    try {
      const response = await api.put('/auth/me', {
        email: account.email.trim(),
        firstName: account.firstName || null,
        lastName: account.lastName || null,
        cedula: account.cedula.trim() || null,
      });
      updateUser(response.data.user);
      toast.success(t('toast.profile.accountUpdated'));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.profile.saveError'));
    } finally {
      setSavingAccount(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      toast.error(t('toast.profile.passwordMismatch'));
      return;
    }
    if (passwords.new.length < 6) {
      toast.error(t('toast.profile.passwordTooShort'));
      return;
    }
    setSavingPassword(true);
    try {
      await api.put('/auth/password', {
        currentPassword: passwords.current,
        newPassword: passwords.new,
      });
      setPasswords({ current: '', new: '', confirm: '' });
      toast.success(t('toast.profile.passwordUpdated'));
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.profile.passwordChangeError'));
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="text-center sm:text-left">
        <h1 className="page-title mb-2">{t('pages.profile.title')}</h1>
        <p className="text-dark-400 text-sm sm:text-base">{t('pages.profile.subtitle')}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <div className="flex items-center space-x-3 mb-6">
          <UserCircle className="w-7 h-7 text-primary-400" />
          <div>
            <h2 className="text-xl font-semibold text-white">{t('pages.profile.accountSectionTitle')}</h2>
            <p className="text-sm text-dark-500">{t('pages.profile.accountSectionHint')}</p>
          </div>
        </div>
        <form onSubmit={handleAccountSubmit} className="space-y-4">
          <div>
            <label className="label flex items-center gap-2">
              <Mail className="w-4 h-4 text-dark-500" />
              {t('pages.profile.emailLabel')}
            </label>
            <input
              type="email"
              required
              autoComplete="email"
              value={account.email}
              onChange={(e) => setAccount({ ...account, email: e.target.value })}
              className="input w-full"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">{t('pages.profile.firstName')}</label>
              <input
                type="text"
                autoComplete="given-name"
                value={account.firstName}
                onChange={(e) => setAccount({ ...account, firstName: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="label">{t('pages.profile.lastName')}</label>
              <input
                type="text"
                autoComplete="family-name"
                value={account.lastName}
                onChange={(e) => setAccount({ ...account, lastName: e.target.value })}
                className="input w-full"
              />
            </div>
          </div>
          <div>
            <label className="label">{t('pages.profile.idDocument')}</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t('pages.profile.idPlaceholder')}
              maxLength={50}
              value={account.cedula}
              onChange={(e) => setAccount({ ...account, cedula: e.target.value })}
              className="input w-full"
            />
            <p className="text-xs text-dark-500 mt-1">{t('pages.profile.idHint')}</p>
          </div>
          <button type="submit" disabled={savingAccount} className="btn-primary">
            {savingAccount ? t('pages.profile.savingAccount') : t('pages.profile.saveAccount')}
          </button>
        </form>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="card"
      >
        <div className="flex items-center space-x-3 mb-6">
          <Lock className="w-7 h-7 text-primary-400" />
          <div>
            <h2 className="text-xl font-semibold text-white">{t('pages.profile.passwordSectionTitle')}</h2>
            <p className="text-sm text-dark-500">{t('pages.profile.passwordSectionHint')}</p>
          </div>
        </div>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="label">{t('pages.profile.currentPassword')}</label>
            <input
              type="password"
              autoComplete="current-password"
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
              className="input w-full"
            />
          </div>
          <div>
            <label className="label">{t('pages.profile.newPassword')}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={passwords.new}
              onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
              className="input w-full"
              minLength={6}
            />
          </div>
          <div>
            <label className="label">{t('pages.profile.confirmPassword')}</label>
            <input
              type="password"
              autoComplete="new-password"
              value={passwords.confirm}
              onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
              className="input w-full"
              minLength={6}
            />
          </div>
          <button type="submit" disabled={savingPassword} className="btn-primary">
            {savingPassword ? t('pages.profile.updatingPassword') : t('pages.profile.changePassword')}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default Profile;
