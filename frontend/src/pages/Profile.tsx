import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { UserCircle, Lock, Mail } from 'lucide-react';

const Profile: React.FC = () => {
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
      toast.success('Datos de cuenta actualizados');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'No se pudo guardar');
    } finally {
      setSavingAccount(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.new !== passwords.confirm) {
      toast.error('Las contraseñas nuevas no coinciden');
      return;
    }
    if (passwords.new.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres');
      return;
    }
    setSavingPassword(true);
    try {
      await api.put('/auth/password', {
        currentPassword: passwords.current,
        newPassword: passwords.new,
      });
      setPasswords({ current: '', new: '', confirm: '' });
      toast.success('Contraseña actualizada');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'No se pudo cambiar la contraseña');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="text-center sm:text-left">
        <h1 className="page-title mb-2">Mi perfil</h1>
        <p className="text-dark-400 text-sm sm:text-base">Datos de tu cuenta y seguridad</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
      >
        <div className="flex items-center space-x-3 mb-6">
          <UserCircle className="w-7 h-7 text-primary-400" />
          <div>
            <h2 className="text-xl font-semibold text-white">Información de la cuenta</h2>
            <p className="text-sm text-dark-500">Correo y nombre visible en la app</p>
          </div>
        </div>
        <form onSubmit={handleAccountSubmit} className="space-y-4">
          <div>
            <label className="label flex items-center gap-2">
              <Mail className="w-4 h-4 text-dark-500" />
              Correo electrónico
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
              <label className="label">Nombre</label>
              <input
                type="text"
                autoComplete="given-name"
                value={account.firstName}
                onChange={(e) => setAccount({ ...account, firstName: e.target.value })}
                className="input w-full"
              />
            </div>
            <div>
              <label className="label">Apellido</label>
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
            <label className="label">Cédula</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ej. 001-0000000-0"
              maxLength={50}
              value={account.cedula}
              onChange={(e) => setAccount({ ...account, cedula: e.target.value })}
              className="input w-full"
            />
            <p className="text-xs text-dark-500 mt-1">Opcional. Tu documento de identidad.</p>
          </div>
          <button type="submit" disabled={savingAccount} className="btn-primary">
            {savingAccount ? 'Guardando…' : 'Guardar cambios'}
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
            <h2 className="text-xl font-semibold text-white">Contraseña</h2>
            <p className="text-sm text-dark-500">Usa una contraseña segura que no reutilices en otros sitios</p>
          </div>
        </div>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div>
            <label className="label">Contraseña actual</label>
            <input
              type="password"
              autoComplete="current-password"
              value={passwords.current}
              onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
              className="input w-full"
            />
          </div>
          <div>
            <label className="label">Nueva contraseña</label>
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
            <label className="label">Confirmar nueva contraseña</label>
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
            {savingPassword ? 'Actualizando…' : 'Cambiar contraseña'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default Profile;
