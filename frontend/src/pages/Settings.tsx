import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Settings as SettingsIcon, User, Bell, DollarSign, Send, Clock } from 'lucide-react';

const Settings: React.FC = () => {
  const { user, updateUser } = useAuth();
  const [formData, setFormData] = useState({
    telegramChatId: '',
    exchangeRateDopUsd: '55',
    timezone: 'America/Santo_Domingo',
  });
  const [notificationSettings, setNotificationSettings] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        telegramChatId: user.telegramChatId || '',
        exchangeRateDopUsd: user.exchangeRateDopUsd?.toString() || '55',
        timezone: user.timezone || 'America/Santo_Domingo',
      });
    }
    fetchNotificationSettings();
  }, [user]);

  const fetchNotificationSettings = async () => {
    try {
      const response = await api.get('/notifications/settings');
      setNotificationSettings(response.data.settings || {});
    } catch (error: any) {
      console.error('Error fetching notification settings:', error);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Update user profile via API
      const response = await api.put('/auth/me', {
        telegramChatId: formData.telegramChatId,
        exchangeRateDopUsd: parseFloat(formData.exchangeRateDopUsd),
        timezone: formData.timezone,
      });
      updateUser(response.data.user);
      toast.success('Perfil actualizado');
    } catch (error: any) {
      toast.error('Error al actualizar perfil');
    } finally {
      setLoading(false);
    }
  };


  const handleTestNotification = async () => {
    if (!formData.telegramChatId) {
      toast.error('Debes configurar tu Telegram Chat ID primero');
      return;
    }
    setTestingNotification(true);
    try {
      await api.post('/notifications/test');
      toast.success('Notificación de prueba enviada. Revisa tu Telegram.');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al enviar notificación de prueba');
    } finally {
      setTestingNotification(false);
    }
  };

  const handleNotificationSettingsUpdate = async (type: string, settings: any) => {
    try {
      await api.post('/notifications/settings', {
        notificationType: type,
        ...settings,
      });
      toast.success('Configuración de notificaciones actualizada');
      fetchNotificationSettings();
    } catch (error: any) {
      toast.error('Error al actualizar configuración');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-2">Configuración</h1>
        <p className="text-dark-400 text-sm sm:text-base">
          Preferencias de la app. Tu nombre y correo se editan en{' '}
          <Link to="/profile" className="text-primary-400 hover:underline">
            Mi perfil
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Settings */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
          <div className="flex items-center space-x-3 mb-6">
            <User className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-semibold text-white">Telegram y horario</h2>
          </div>
          <form onSubmit={handleProfileUpdate} className="space-y-4">
            <div>
              <label className="label">Telegram Chat ID</label>
              <input
                type="text"
                value={formData.telegramChatId}
                onChange={(e) => setFormData({ ...formData, telegramChatId: e.target.value })}
                className="input w-full"
                placeholder="123456789"
              />
              <p className="text-xs text-dark-400 mt-1">
                Obtén tu Chat ID enviando un mensaje a tu bot y visitando: https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
              </p>
            </div>
            <div>
              <label className="label">Zona Horaria (Timezone)</label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="input w-full"
              >
                <option value="America/Santo_Domingo">América/Santo Domingo (AST, UTC-4)</option>
                <option value="America/New_York">América/Nueva York (EST/EDT, UTC-5/-4)</option>
                <option value="America/Chicago">América/Chicago (CST/CDT, UTC-6/-5)</option>
                <option value="America/Denver">América/Denver (MST/MDT, UTC-7/-6)</option>
                <option value="America/Los_Angeles">América/Los Ángeles (PST/PDT, UTC-8/-7)</option>
                <option value="America/Mexico_City">América/Ciudad de México (CST, UTC-6)</option>
                <option value="America/Bogota">América/Bogotá (COT, UTC-5)</option>
                <option value="America/Lima">América/Lima (PET, UTC-5)</option>
                <option value="America/Santiago">América/Santiago (CLT, UTC-3)</option>
                <option value="America/Buenos_Aires">América/Buenos Aires (ART, UTC-3)</option>
                <option value="America/Sao_Paulo">América/São Paulo (BRT, UTC-3)</option>
                <option value="Europe/London">Europa/Londres (GMT/BST, UTC+0/+1)</option>
                <option value="Europe/Paris">Europa/París (CET/CEST, UTC+1/+2)</option>
                <option value="Europe/Madrid">Europa/Madrid (CET/CEST, UTC+1/+2)</option>
                <option value="Asia/Tokyo">Asia/Tokio (JST, UTC+9)</option>
                <option value="Asia/Shanghai">Asia/Shanghái (CST, UTC+8)</option>
                <option value="Asia/Dubai">Asia/Dubái (GST, UTC+4)</option>
                <option value="UTC">UTC (UTC+0)</option>
              </select>
              <p className="text-xs text-dark-400 mt-1">
                Selecciona tu zona horaria para que las fechas se muestren correctamente
              </p>
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </form>
        </motion.div>

        {/* Exchange Rate Settings */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card">
          <div className="flex items-center space-x-3 mb-6">
            <DollarSign className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-semibold text-white">Tasa de Cambio</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label">Tasa DOP/USD</label>
              <input
                type="number"
                step="0.01"
                value={formData.exchangeRateDopUsd}
                onChange={(e) => setFormData({ ...formData, exchangeRateDopUsd: e.target.value })}
                className="input w-full"
              />
              <p className="text-xs text-dark-400 mt-1">Tasa de cambio para convertir entre DOP y USD</p>
            </div>
            <button onClick={handleProfileUpdate} disabled={loading} className="btn-primary w-full">
              Actualizar Tasa
            </button>
          </div>
        </motion.div>

        {/* Notification Settings */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="card lg:col-span-2">
          <div className="flex items-center space-x-3 mb-6">
            <Bell className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-semibold text-white">Notificaciones</h2>
          </div>
          <div className="space-y-6">
            {['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'].map((type) => {
              const settings = notificationSettings[type] || { enabled: true, telegramEnabled: false, daysBefore: [3, 7] };
              return (
                <div key={type} className="bg-dark-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-white">
                      {type === 'CARD_PAYMENT' && 'Pagos de Tarjetas'}
                      {type === 'LOAN_PAYMENT' && 'Pagos de Préstamos'}
                      {type === 'RECURRING_EXPENSE' && 'Gastos Recurrentes'}
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(e) => handleNotificationSettingsUpdate(type, { ...settings, enabled: e.target.checked })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                  {settings.enabled && (
                    <div className="space-y-3">
                      <div>
                        <label className="label">Notificaciones por Telegram</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.telegramEnabled}
                            onChange={(e) => handleNotificationSettingsUpdate(type, { ...settings, telegramEnabled: e.target.checked })}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                      </div>
                      <div>
                        <label className="label">Días antes de notificar (separados por comas)</label>
                        <input
                          type="text"
                          value={settings.daysBefore?.join(', ') || '3, 7'}
                          onChange={(e) => {
                            const days = e.target.value.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
                            handleNotificationSettingsUpdate(type, { ...settings, daysBefore: days });
                          }}
                          className="input w-full"
                          placeholder="3, 7"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-white">Probar Notificación de Telegram</h3>
              </div>
              <p className="text-dark-400 text-sm mb-4">
                Envía una notificación de prueba a tu Telegram para verificar que la configuración es correcta.
              </p>
              <button
                onClick={handleTestNotification}
                disabled={testingNotification || !formData.telegramChatId}
                className="btn-primary w-full flex items-center justify-center space-x-2"
              >
                {testingNotification ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></span>
                    <span>Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    <span>Probar Notificación</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Settings;
