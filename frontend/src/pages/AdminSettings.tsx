import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Settings, UserCheck, Wrench, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../services/adminService';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';

const AdminSettings: React.FC = () => {
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
        toast.error('No se pudieron cargar los ajustes');
      })
      .finally(() => setInitialLoad(false));
  }, []);

  const toggleRegistration = async () => {
    setSettingsLoading(true);
    try {
      const next = !regEnabled;
      await adminService.updateSettings({ registrationEnabled: next });
      setRegEnabled(next);
      toast.success(next ? 'Registro de usuarios habilitado' : 'Registro de usuarios deshabilitado');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al guardar');
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
      toast.success(
        next
          ? 'Mantenimiento activo: el resto de usuarios queda en solo lectura'
          : 'Mantenimiento desactivado'
      );
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al guardar');
    } finally {
      setMaintenanceLoading(false);
    }
  };

  if (initialLoad) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <p className="text-dark-500">Cargando…</p>
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
            <h1 className="page-title">Configuración global</h1>
            <p className="text-dark-400 text-sm">Banderas del sistema; solo super administradores</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-start gap-3 mb-4">
              <UserCheck className="w-5 h-5 text-emerald-400/90 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-white">Registro de nuevas cuentas</h2>
                <p className="text-sm text-dark-400 mt-1 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 text-dark-500 mt-0.5" aria-hidden />
                  Si está deshabilitado, el endpoint de registro rechaza nuevas altas. El inicio de sesión de
                  usuarios existentes no cambia.
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
                  ? 'Habilitado — clic para deshabilitar el registro'
                  : 'Deshabilitado — clic para permitir registro'}
            </button>
          </div>

          <div className="card p-5">
            <div className="flex items-start gap-3 mb-4">
              <Wrench className="w-5 h-5 text-amber-400/90 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-white">Modo mantenimiento (solo lectura)</h2>
                <p className="text-sm text-dark-400 mt-1 flex items-start gap-2">
                  <Info className="w-4 h-4 shrink-0 text-dark-500 mt-0.5" aria-hidden />
                  Con la opción activa, los usuarios no super admin no pueden realizar acciones de escritura en la
                  API (POST, PUT, PATCH, DELETE), salvo rutas de autenticación, suscripción y administración. Los
                  super administradores conservan acceso completo.
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
                  ? 'Activo — clic para desactivar mantenimiento'
                  : 'Inactivo — clic para activar solo lectura para usuarios'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminSettings;
