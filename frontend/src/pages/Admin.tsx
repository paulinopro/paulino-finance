import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Shield,
  UserCheck,
  Search,
  LogIn,
  Layers,
  Download,
  Users,
  UserMinus,
  Link2,
  Activity,
  Stethoscope,
  Wrench,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService, AdminUserRow, AdminSubscriptionPlanSummary, type AdminKpis } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import TablePagination from '../components/TablePagination';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';

const Admin: React.FC = () => {
  const { setSession } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [fActive, setFActive] = useState<'' | 'true' | 'false'>('');
  const [fPlan, setFPlan] = useState<string>('');
  const [fSub, setFSub] = useState<string>('');
  const [stats, setStats] = useState<AdminKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [regEnabled, setRegEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);
  const [plans, setPlans] = useState<AdminSubscriptionPlanSummary[]>([]);
  const [savingPlanUserId, setSavingPlanUserId] = useState<number | null>(null);
  /** Al asignar plan manualmente, ciclo de la ventana (default mensual en API) */
  const [assignPlanBilling, setAssignPlanBilling] = useState<Record<number, 'monthly' | 'yearly'>>({});

  const limit = TABLE_PAGE_SIZE;

  useEffect(() => {
    adminService
      .listSubscriptionPlans()
      .then((d) => setPlans(d.plans))
      .catch(() => {
        toast.error('No se pudieron cargar los planes');
      });
  }, []);

  const listParams = {
    page,
    limit,
    search: search || undefined,
    isActive: fActive || undefined,
    planId: fPlan === '' ? undefined : fPlan,
    subscriptionStatus: fSub || undefined,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, settings] = await Promise.all([
        adminService.listUsers(listParams),
        adminService.getSettings(),
      ]);
      setUsers(list.users);
      setTotal(list.total);
      setRegEnabled(settings.registrationEnabled);
      setMaintenanceMode(settings.maintenanceMode);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al cargar administración');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, fActive, fPlan, fSub]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    adminService
      .getStats()
      .then((s) => setStats(s))
      .catch(() => {
        /* listado no depende de stats */
      });
  }, []);

  const toggleRegistration = async () => {
    setSettingsLoading(true);
    try {
      const next = !regEnabled;
      await adminService.updateSettings({ registrationEnabled: next });
      setRegEnabled(next);
      void adminService
        .getStats()
        .then((s) => setStats(s))
        .catch(() => undefined);
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
      void adminService
        .getStats()
        .then((s) => setStats(s))
        .catch(() => undefined);
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

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const downloadCsv = async () => {
    try {
      await adminService.downloadUsersCsv({
        search: search || undefined,
        isActive: fActive || undefined,
        planId: fPlan === '' ? undefined : fPlan,
        subscriptionStatus: fSub || undefined,
      });
      toast.success('Descarga de CSV iniciada');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al exportar');
    }
  };

  const toggleActive = async (u: AdminUserRow) => {
    if (u.isSuperAdmin) return;
    try {
      await adminService.updateUser(u.id, { isActive: !u.isActive });
      toast.success(u.isActive ? 'Usuario deshabilitado' : 'Usuario habilitado');
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error');
    }
  };

  const refreshUsers = async () => {
    try {
      const list = await adminService.listUsers(listParams);
      setUsers(list.users);
      setTotal(list.total);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al actualizar usuarios');
    }
  };

  const changePlan = async (u: AdminUserRow, newPlanIdStr: string) => {
    if (u.isSuperAdmin) return;
    if (newPlanIdStr === '') return;
    const newId = parseInt(newPlanIdStr, 10);
    if (Number.isNaN(newId) || newId === u.planId) return;
    const billing = assignPlanBilling[u.id] ?? 'monthly';
    setSavingPlanUserId(u.id);
    try {
      await adminService.updateUser(u.id, { planId: newId, billingInterval: billing });
      toast.success('Plan actualizado');
      await refreshUsers();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al asignar plan');
    } finally {
      setSavingPlanUserId(null);
    }
  };

  const impersonate = async (u: AdminUserRow) => {
    if (u.isSuperAdmin) return;
    try {
      const res = await adminService.impersonate(u.id);
      setSession(res.token, res.user, res.impersonatedBy);
      toast.success(`Sesión como ${u.email}`);
      window.location.href = '/';
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al suplantar');
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <AdminBreadcrumbs />
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between sm:text-left gap-4 mb-8">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:text-left w-full sm:w-auto">
            <div className="p-3 rounded-xl bg-primary-600/20 text-primary-400">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h1 className="page-title">Administración</h1>
              <p className="text-dark-400 text-sm">Usuarios, suscripciones y registro</p>
            </div>
          </div>
          <Link
            to="/admin/system"
            className="inline-flex items-center justify-center gap-1.5 text-sm text-amber-500/90 hover:text-amber-400 font-medium border border-amber-800/50 rounded-lg px-3 py-2 transition shrink-0"
          >
            <Stethoscope className="h-4 w-4" />
            Estado del API
          </Link>
        </div>

        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="card p-4 flex items-start gap-3">
              <Users className="w-5 h-5 text-primary-400 mt-0.5" />
              <div>
                <p className="text-dark-500 text-xs">Usuarios</p>
                <p className="text-lg font-semibold text-white">{stats.totalUsers}</p>
                <p className="text-dark-500 text-xs mt-1">{stats.newLast7d} nuevos (7d)</p>
              </div>
            </div>
            <div className="card p-4 flex items-start gap-3">
              <UserMinus className="w-5 h-5 text-emerald-400/90 mt-0.5" />
              <div>
                <p className="text-dark-500 text-xs">Cuentas activas / bloqueadas</p>
                <p className="text-lg font-semibold text-white">
                  {stats.activeUsers} <span className="text-dark-500 text-sm">/</span> {stats.disabledUsers}
                </p>
              </div>
            </div>
            <div className="card p-4 flex items-start gap-3">
              <Link2 className="w-5 h-5 text-sky-400/90 mt-0.5" />
              <div>
                <p className="text-dark-500 text-xs">Con suscripción</p>
                <p className="text-lg font-semibold text-white">{stats.withSubscription}</p>
                <p className="text-dark-500 text-xs mt-1">{stats.superAdmins} super admin</p>
              </div>
            </div>
            <Link
              to="/admin/audit"
              className="card p-4 flex items-start gap-3 hover:border-amber-500/30 border border-transparent transition"
            >
              <Activity className="w-5 h-5 text-amber-400/90 mt-0.5" />
              <div>
                <p className="text-dark-500 text-xs">Auditoría (24h)</p>
                <p className="text-lg font-semibold text-white">{stats.auditEventsLast24h}</p>
                <p className="text-dark-500 text-xs mt-1">Ver registro en consola →</p>
              </div>
            </Link>
          </div>
        )}

        <Link
          to="/admin/subscriptions"
          className="card mb-6 flex items-center gap-3 hover:border-primary-600/40 transition border border-dark-700"
        >
          <Layers className="w-6 h-6 text-primary-400 shrink-0" />
          <div>
            <p className="font-medium text-white">Planes de suscripción</p>
            <p className="text-dark-500 text-sm">Precios, módulos por plan e IDs de PayPal</p>
          </div>
        </Link>

        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2 mb-6">
          <div className="card p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-2 text-dark-300">
                <UserCheck className="w-5 h-5 shrink-0" />
                <span>Registro de nuevas cuentas</span>
              </div>
              <button
                type="button"
                disabled={settingsLoading}
                onClick={toggleRegistration}
                className={`px-4 py-2 rounded-lg font-medium transition shrink-0 ${
                  regEnabled
                    ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                    : 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
                }`}
              >
                {settingsLoading
                  ? '…'
                  : regEnabled
                    ? 'Habilitado (clic para deshabilitar)'
                    : 'Deshabilitado (clic para habilitar)'}
              </button>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start sm:items-center gap-2 text-dark-300">
                <Wrench className="w-5 h-5 shrink-0 mt-0.5 sm:mt-0" />
                <div>
                  <p className="text-sm">Mantenimiento (solo lectura para usuarios)</p>
                  <p className="text-xs text-dark-500 mt-0.5">
                    Los super admin siguen pudiendo escribir en toda la API.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={maintenanceLoading}
                onClick={toggleMaintenance}
                className={`px-4 py-2 rounded-lg font-medium transition shrink-0 ${
                  maintenanceMode
                    ? 'bg-amber-600/20 text-amber-300 hover:bg-amber-600/30'
                    : 'bg-dark-600/30 text-dark-300 hover:bg-dark-600/50'
                }`}
              >
                {maintenanceLoading
                  ? '…'
                  : maintenanceMode
                    ? 'Activo (clic para desactivar)'
                    : 'Inactivo (clic para activar)'}
              </button>
            </div>
          </div>
        </div>

        <div className="mb-4 space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <input
                className="input pl-10 w-full"
                placeholder="Buscar por email o nombre…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary px-4">
              Buscar
            </button>
          </form>
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-end">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
              <div>
                <span className="text-xs text-dark-500 block mb-1">Cuenta (login)</span>
                <select
                  className="input w-full"
                  value={fActive}
                  onChange={(e) => {
                    setFActive(e.target.value as '' | 'true' | 'false');
                    setPage(1);
                  }}
                >
                  <option value="">Cualquiera</option>
                  <option value="true">Activa</option>
                  <option value="false">Deshabilitada</option>
                </select>
              </div>
              <div>
                <span className="text-xs text-dark-500 block mb-1">Plan asignado</span>
                <select
                  className="input w-full"
                  value={fPlan}
                  onChange={(e) => {
                    setFPlan(e.target.value);
                    setPage(1);
                  }}
                  disabled={plans.length === 0}
                >
                  <option value="">Cualquiera</option>
                  <option value="none">Sin asignar</option>
                  {plans.map((p) => (
                    <option key={p.id} value={String(p.id)}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="text-xs text-dark-500 block mb-1">Estado suscripción</span>
                <select
                  className="input w-full"
                  value={fSub}
                  onChange={(e) => {
                    setFSub(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Cualquiera</option>
                  <option value="active">active</option>
                  <option value="trialing">trialing</option>
                  <option value="cancelled">cancelled</option>
                  <option value="expired">expired</option>
                  <option value="past_due">past_due</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadCsv}
              className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 shrink-0"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
        </div>

        <div className="space-y-4">
        <div className="card overflow-hidden">
          <div className="table-responsive table-stack">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-dark-700 text-dark-400">
                  <th className="py-3 px-2">Usuario</th>
                  <th className="py-3 px-2 min-w-[200px]">Plan</th>
                  <th className="py-3 px-2">Estado sub.</th>
                  <th className="py-3 px-2">Cuenta</th>
                  <th className="py-3 px-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-dark-500">
                      Cargando…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-dark-500">
                      Sin resultados
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="border-b border-dark-800/80 hover:bg-dark-800/40 max-md:border-0">
                      <td data-label="Usuario" className="py-3 px-2 align-top">
                        <span className="table-stack-value !flex-col !items-end gap-0.5 text-right">
                          <div className="text-white font-medium">
                            <Link to={`/admin/users/${u.id}`} className="hover:underline text-primary-300">
                              {u.email}
                            </Link>
                          </div>
                          <div className="text-dark-500 text-xs">
                            {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                            {u.isSuperAdmin && (
                              <span className="ml-2 text-amber-400">Super admin</span>
                            )}
                          </div>
                        </span>
                      </td>
                      <td data-label="Plan" className="py-3 px-2 align-top">
                        <span className="table-stack-value !block w-full min-w-0 max-md:max-w-[min(100%,12rem)]">
                          {u.isSuperAdmin ? (
                            <span className="text-dark-300 capitalize">
                              {u.subscriptionPlanName || u.subscriptionPlan}
                            </span>
                          ) : plans.length === 0 ? (
                            <span className="text-dark-500 text-xs">—</span>
                          ) : (
                            <div className="flex flex-col gap-1.5 w-full min-w-0 max-w-[240px]">
                              <select
                                className="input w-full min-w-[160px] text-xs py-1.5"
                                value={u.planId != null ? String(u.planId) : ''}
                                disabled={savingPlanUserId === u.id}
                                onChange={(e) => changePlan(u, e.target.value)}
                                aria-label={`Plan para ${u.email}`}
                              >
                                {u.planId == null && <option value="">Sin asignar</option>}
                                {u.planId != null &&
                                  !plans.some((p) => p.id === u.planId) && (
                                    <option value={String(u.planId)}>
                                      {u.subscriptionPlanName || u.subscriptionPlan || `Plan #${u.planId}`}
                                    </option>
                                  )}
                                {plans.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                              </select>
                              <label className="flex items-center gap-1.5 text-[0.65rem] text-dark-500">
                                <span className="shrink-0">Ciclo (manual):</span>
                                <select
                                  className="input flex-1 min-w-0 text-xs py-1"
                                  value={assignPlanBilling[u.id] ?? 'monthly'}
                                  onChange={(e) =>
                                    setAssignPlanBilling((prev) => ({
                                      ...prev,
                                      [u.id]: e.target.value as 'monthly' | 'yearly',
                                    }))
                                  }
                                  disabled={savingPlanUserId === u.id}
                                  aria-label={`Ciclo al asignar plan para ${u.email}`}
                                >
                                  <option value="monthly">Mensual</option>
                                  <option value="yearly">Anual</option>
                                </select>
                              </label>
                            </div>
                          )}
                        </span>
                      </td>
                      <td data-label="Estado sub." className="py-3 px-2">
                        <span className="table-stack-value text-dark-300 text-sm">{u.subscriptionStatus}</span>
                      </td>
                      <td data-label="Cuenta" className="py-3 px-2">
                        <span className="table-stack-value">
                          <span className={u.isActive ? 'text-emerald-400' : 'text-red-400'}>
                            {u.isActive ? 'Activa' : 'Deshabilitada'}
                          </span>
                        </span>
                      </td>
                      <td data-label="Acciones" className="py-3 px-2">
                        <span className="table-stack-value">
                          {!u.isSuperAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => impersonate(u)}
                              className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 text-xs"
                              title="Abrir como este usuario"
                            >
                              <LogIn className="w-3 h-3" />
                              Suplantar
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActive(u)}
                              className="text-xs text-dark-400 hover:text-white ml-2"
                            >
                              {u.isActive ? 'Deshabilitar' : 'Habilitar'}
                            </button>
                          </>
                        )}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={total}
          itemsPerPage={limit}
          onPageChange={setPage}
          itemLabel="usuarios"
          disabled={loading}
          variant="card"
        />
        </div>
      </motion.div>
    </div>
  );
};

export default Admin;
