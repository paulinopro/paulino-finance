import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, UserCheck, Search, LogIn, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService, AdminUserRow, AdminSubscriptionPlanSummary } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import { TABLE_PAGE_SIZE } from '../constants/pagination';

const Admin: React.FC = () => {
  const { setSession } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [regEnabled, setRegEnabled] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [plans, setPlans] = useState<AdminSubscriptionPlanSummary[]>([]);
  const [savingPlanUserId, setSavingPlanUserId] = useState<number | null>(null);

  const limit = TABLE_PAGE_SIZE;

  useEffect(() => {
    adminService
      .listSubscriptionPlans()
      .then((d) => setPlans(d.plans))
      .catch(() => {
        toast.error('No se pudieron cargar los planes');
      });
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [list, settings] = await Promise.all([
        adminService.listUsers({ page, limit, search: search || undefined }),
        adminService.getSettings(),
      ]);
      setUsers(list.users);
      setTotal(list.total);
      setRegEnabled(settings.registrationEnabled);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al cargar administración');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search]);

  const toggleRegistration = async () => {
    setSettingsLoading(true);
    try {
      const next = !regEnabled;
      await adminService.updateSettings(next);
      setRegEnabled(next);
      toast.success(next ? 'Registro de usuarios habilitado' : 'Registro de usuarios deshabilitado');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al guardar');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
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
      const list = await adminService.listUsers({ page, limit, search: search || undefined });
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
    setSavingPlanUserId(u.id);
    try {
      await adminService.updateUser(u.id, { planId: newId });
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
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-xl bg-primary-600/20 text-primary-400">
            <Shield className="w-8 h-8" />
          </div>
          <div>
            <h1 className="page-title">Administración</h1>
            <p className="text-dark-400 text-sm">Usuarios, suscripciones y registro</p>
          </div>
        </div>

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

        <div className="card mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2 text-dark-300">
              <UserCheck className="w-5 h-5" />
              <span>Registro de nuevas cuentas</span>
            </div>
            <button
              type="button"
              disabled={settingsLoading}
              onClick={toggleRegistration}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                regEnabled
                  ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                  : 'bg-red-600/20 text-red-400 hover:bg-red-600/30'
              }`}
            >
              {settingsLoading ? '…' : regEnabled ? 'Habilitado (clic para deshabilitar)' : 'Deshabilitado (clic para habilitar)'}
            </button>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
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
                          <div className="text-white font-medium">{u.email}</div>
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
                            <select
                              className="input w-full min-w-[160px] max-w-[240px] text-xs py-1.5"
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
                          )}
                        </span>
                      </td>
                      <td data-label="Estado sub." className="py-3 px-2 capitalize">
                        <span className="table-stack-value text-dark-300">{u.subscriptionStatus}</span>
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
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700 text-sm text-dark-400">
              <span>
                {total} usuario{total !== 1 ? 's' : ''} · página {page} de {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn-secondary px-3 py-1 disabled:opacity-40"
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="btn-secondary px-3 py-1 disabled:opacity-40"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Admin;
