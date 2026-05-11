import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, UserCheck, Wrench, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../services/adminService';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';
import { useTranslation } from 'react-i18next';

const AdminSettings: React.FC = () => {
  const { t } = useTranslation();
  const [regEnabled, setRegEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    adminService
      .getSettings()
      .then((s) => {
        setRegEnabled(s.registrationEnabled);
        setMaintenanceMode(s.maintenanceMode);
      })
      .catch(() => {
        toast.error(t('toast.adminSettings.loadError'));
      })
      .finally(() => setInitialLoad(false));
  }, [t]);

  const toggleRegistration = async () => {
    setSettingsLoading(true);
    try {
      const next = !regEnabled;
      await adminService.updateSettings({ registrationEnabled: next });
      setRegEnabled(next);
      toast.success(next ? t('toast.adminSettings.registrationEnabled') : t('toast.adminSettings.registrationDisabled'));
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.adminSettings.saveError'));
    } finally {
      setSettingsLoading(false);
    }
  };

  const toggleMaintenance = async () => {
    setMaintenanceLoading(true);
    try {
      const next = !maintenanceMode;
      const data = await adminService.updateSettings({ maintenanceMode: next });
      setMaintenanceMode(data.maintenanceMode);
      setRegEnabled(data.registrationEnabled);
      toast.success(next ? t('toast.adminSettings.maintenanceOn') : t('toast.adminSettings.maintenanceOff'));
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.adminSettings.saveError'));
    } finally {
      setMaintenanceLoading(false);
    }
  };

  if (initialLoad) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <p className="text-dark-500">{t('common.actions.loading')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <AdminBreadcrumbs />
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-xl bg-primary-600/20 text-primary-400">
            <Settings className="w-8 h-8" />
          </div>
          <div>
            <h1 className="page-title">{t('pages.adminGlobalSettings.title')}</h1>
            <p className="text-dark-400 text-sm">{t('pages.adminGlobalSettings.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-start gap-3 mb-4">
              <UserCheck className="w-5 h-5 text-emerald-400/90 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-white">{t('pages.adminGlobalSettings.registrationHeading')}</h2>
                <p className="text-sm text-dark-400 mt-1 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 text-dark-500 mt-0.5" aria-hidden />
                  {t('pages.adminGlobalSettings.registrationHelp')}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={settingsLoading}
              onClick={toggleRegistration}
              className={`w-full sm:w-auto px-4 py-2.5 rounded-lg font-medium transition ${
                regEnabled
                  ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                  : 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              } disabled:opacity-50`}
            >
              {settingsLoading
                ? '…'
                : regEnabled
                  ? t('pages.adminGlobalSettings.registrationEnabled')
                  : t('pages.adminGlobalSettings.registrationDisabled')}
            </button>
          </div>

          <div className="card p-5">
            <div className="flex items-start gap-3 mb-4">
              <Wrench className="w-5 h-5 text-amber-400/90 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-white">{t('pages.adminGlobalSettings.maintenanceHeading')}</h2>
                <p className="text-sm text-dark-400 mt-1 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 text-dark-500 mt-0.5" aria-hidden />
                  {t('pages.adminGlobalSettings.maintenanceHelp')}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={maintenanceLoading}
              onClick={toggleMaintenance}
              className={`w-full sm:w-auto px-4 py-2.5 rounded-lg font-medium transition ${
                maintenanceMode
                  ? 'bg-amber-600/20 text-amber-300 hover:bg-amber-600/30'
                  : 'bg-dark-600/30 text-dark-300 hover:bg-dark-600/50'
              } disabled:opacity-50`}
            >
              {maintenanceLoading
                ? '…'
                : maintenanceMode
                  ? t('pages.adminGlobalSettings.maintenanceActive')
                  : t('pages.adminGlobalSettings.maintenanceInactive')}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminSettings;
