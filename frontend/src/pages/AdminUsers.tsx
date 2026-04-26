import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Search, LogIn, Download, Stethoscope, X, UserX, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService, AdminUserRow, AdminSubscriptionPlanSummary } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import TablePagination from '../components/TablePagination';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';
import PageHeader from '../components/PageHeader';
import { SUBSCRIPTION_STATUS_FILTER_OPTIONS, subscriptionStatusLabelEs } from '../constants/subscriptionModules';

function formatPeriodUtc(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-DO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  } catch {
    return '—';
  }
}

const AdminUsers: React.FC = () => {
  const { setSession } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [fActive, setFActive] = useState<'' | 'true' | 'false'>('');
  const [fPlan, setFPlan] = useState<string>('');
  const [fSub, setFSub] = useState<string>('');
  const [fCreatedFrom, setFCreatedFrom] = useState('');
  const [fCreatedTo, setFCreatedTo] = useState('');
  const [fBillingFrom, setFBillingFrom] = useState('');
  const [fBillingTo, setFBillingTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<AdminSubscriptionPlanSummary[]>([]);
  const [savingPlanUserId, setSavingPlanUserId] = useState<number | null>(null);
  const [assignPlanBilling, setAssignPlanBilling] = useState<Record<number, 'monthly' | 'yearly'>>({});

  const limit = TABLE_PAGE_SIZE;

  const searchApplied = searchTerm.trim();

  useEffect(() => {
    adminService
      .listSubscriptionPlans()
      .then((d) => setPlans(d.plans))
      .catch(() => {
        toast.error('No se pudieron cargar los planes');
      });
  }, []);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, fActive, fPlan, fSub, fCreatedFrom, fCreatedTo, fBillingFrom, fBillingTo]);

  const listParams = {
    page,
    limit,
    search: searchApplied || undefined,
    isActive: fActive || undefined,
    planId: fPlan === '' ? undefined : fPlan,
    subscriptionStatus: fSub || undefined,
    createdFrom: fCreatedFrom.trim() || undefined,
    createdTo: fCreatedTo.trim() || undefined,
    billingPeriodFrom: fBillingFrom.trim() || undefined,
    billingPeriodTo: fBillingTo.trim() || undefined,
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await adminService.listUsers(listParams);
      setUsers(list.users);
      setTotal(list.total);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchApplied, fActive, fPlan, fSub, fCreatedFrom, fCreatedTo, fBillingFrom, fBillingTo]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtersActive =
    !!searchApplied ||
    !!fActive ||
    !!fPlan ||
    !!fSub ||
    !!fCreatedFrom.trim() ||
    !!fCreatedTo.trim() ||
    !!fBillingFrom.trim() ||
    !!fBillingTo.trim();

  const clearFilters = () => {
    setSearchTerm('');
    setFActive('');
    setFPlan('');
    setFSub('');
    setFCreatedFrom('');
    setFCreatedTo('');
    setFBillingFrom('');
    setFBillingTo('');
    setPage(1);
  };

  const downloadCsv = async () => {
    try {
      await adminService.downloadUsersCsv({
        search: searchApplied || undefined,
        isActive: fActive || undefined,
        planId: fPlan === '' ? undefined : fPlan,
        subscriptionStatus: fSub || undefined,
        createdFrom: fCreatedFrom.trim() || undefined,
        createdTo: fCreatedTo.trim() || undefined,
        billingPeriodFrom: fBillingFrom.trim() || undefined,
        billingPeriodTo: fBillingTo.trim() || undefined,
      });
      toast.success('Descarga de CSV iniciada');
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al exportar');
    }
  };

  const toggleActive = async (u: AdminUserRow) => {
    if (u.isSuperAdmin) return;
    if (u.isActive) {
      const ok = window.confirm(
        `¿Deshabilitar la cuenta ${u.email}? No podrá iniciar sesión hasta que la reactives desde esta consola.`
      );
      if (!ok) return;
    }
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
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <AdminBreadcrumbs />

        <PageHeader
          title="Usuarios"
          subtitle="Cuentas registradas, planes de suscripción y acciones de soporte (suplantar, habilitar)."
          actions={
            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => void downloadCsv()}
                className="btn-primary inline-flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto sm:flex-initial"
              >
                <Download className="w-4 h-4" />
                Exportar CSV
              </button>
              <Link
                to="/admin/system"
                className="inline-flex items-center justify-center gap-1.5 text-sm text-amber-500/90 hover:text-amber-400 font-medium border border-amber-800/50 rounded-lg px-3 py-2 transition shrink-0 w-full sm:w-auto"
              >
                <Stethoscope className="h-4 w-4" />
                Estado del API
              </Link>
            </div>
          }
        />

        {/* Filtros (misma idea que Ingresos / Gastos: una card con grid) */}
        <div className="card">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative sm:col-span-2 lg:col-span-2">
              <label className="text-xs text-dark-400 block mb-1">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
                <input
                  type="text"
                  placeholder="Email o nombre…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input w-full pl-10"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-dark-400 hover:text-white"
                    aria-label="Limpiar búsqueda"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">Cuenta (login)</label>
              <select
                className="input w-full"
                value={fActive}
                onChange={(e) => setFActive(e.target.value as '' | 'true' | 'false')}
              >
                <option value="">Cualquiera</option>
                <option value="true">Activa</option>
                <option value="false">Deshabilitada</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">Plan asignado</label>
              <select
                className="input w-full"
                value={fPlan}
                onChange={(e) => setFPlan(e.target.value)}
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
              <label className="text-xs text-dark-400 block mb-1">Estado suscripción</label>
              <select className="input w-full" value={fSub} onChange={(e) => setFSub(e.target.value)}>
                <option value="">Cualquiera</option>
                {SUBSCRIPTION_STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">Alta desde (registro)</label>
              <input
                type="date"
                className="input w-full"
                value={fCreatedFrom}
                onChange={(e) => setFCreatedFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">Alta hasta (registro)</label>
              <input
                type="date"
                className="input w-full"
                value={fCreatedTo}
                onChange={(e) => setFCreatedTo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">Periodo facturación desde (UTC)</label>
              <input
                type="date"
                className="input w-full"
                value={fBillingFrom}
                onChange={(e) => setFBillingFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">Periodo facturación hasta (UTC)</label>
              <input
                type="date"
                className="input w-full"
                value={fBillingTo}
                onChange={(e) => setFBillingTo(e.target.value)}
              />
            </div>
          </div>
          {filtersActive && (
            <div className="mt-3 flex justify-end">
              <button type="button" onClick={clearFilters} className="text-sm text-accent-400 hover:text-accent-300">
                Limpiar filtros
              </button>
            </div>
          )}
          <p className="text-[0.65rem] text-dark-500 mt-3 border-t border-dark-700/80 pt-3">
            Alta filtra por fecha de registro. Periodo de facturación: ciclo actual (UTC) que se solapa con el rango; excluye
            usuarios sin fila de suscripción o sin fechas de periodo.
          </p>
        </div>

        {!loading && users.length === 0 ? (
          <div className="card text-center py-12">
            <Shield className="w-16 h-16 text-dark-600 mx-auto mb-4" />
            <p className="text-dark-400 mb-4">No hay usuarios que coincidan con los filtros</p>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="btn-primary">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="card overflow-hidden">
              <div className="table-responsive table-stack">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-700">
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium">Usuario</th>
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium min-w-[200px]">
                        Plan
                      </th>
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium">Estado sub.</th>
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium min-w-[8.5rem]">
                        Inicio periodo (UTC)
                      </th>
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium min-w-[8.5rem]">
                        Fin periodo (UTC)
                      </th>
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium">Cuenta</th>
                      <th className="text-right align-middle py-3 px-4 text-dark-400 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-dark-500">
                          Cargando…
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr
                          key={u.id}
                          className="border-b border-dark-800/80 hover:bg-dark-800/40 max-md:border-0"
                        >
                          <td data-label="Usuario" className="py-3 px-4 align-middle">
                            <span className="table-stack-value !flex-col !items-end gap-0.5 text-right">
                              <div className="text-white font-medium">
                                <Link
                                  to={`/admin/users/${u.id}`}
                                  className="hover:underline text-primary-300"
                                >
                                  {u.email}
                                </Link>
                              </div>
                              <div className="text-dark-500 text-xs">
                                {[u.firstName, u.lastName].filter(Boolean).join(' ') || '—'}
                                {u.isSuperAdmin && <span className="ml-2 text-amber-400">Super admin</span>}
                              </div>
                            </span>
                          </td>
                          <td data-label="Plan" className="py-3 px-4 align-middle">
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
                                    {u.planId != null && !plans.some((p) => p.id === u.planId) && (
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
                          <td data-label="Estado sub." className="py-3 px-4 align-middle">
                            <span className="table-stack-value text-dark-300 text-sm">
                              {subscriptionStatusLabelEs(u.subscriptionStatus)}
                            </span>
                          </td>
                          <td
                            data-label="Inicio periodo"
                            className="py-3 px-4 align-middle text-dark-300 text-xs tabular-nums"
                          >
                            {formatPeriodUtc(u.currentPeriodStart)}
                          </td>
                          <td
                            data-label="Fin periodo"
                            className="py-3 px-4 align-middle text-dark-300 text-xs tabular-nums"
                          >
                            {formatPeriodUtc(u.currentPeriodEnd)}
                          </td>
                          <td data-label="Cuenta" className="py-3 px-4 align-middle">
                            <span className="table-stack-value">
                              <span className={u.isActive ? 'text-emerald-400' : 'text-red-400'}>
                                {u.isActive ? 'Activa' : 'Deshabilitada'}
                              </span>
                            </span>
                          </td>
                          <td data-label="Acciones" className="py-3 px-4 align-middle text-right">
                            <span className="table-stack-value inline-flex flex-wrap items-center justify-end gap-2">
                              {!u.isSuperAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => impersonate(u)}
                                    disabled={!u.isActive}
                                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-dark-600 bg-dark-800/60 text-primary-400 hover:bg-dark-700 hover:text-primary-300 disabled:opacity-40 disabled:pointer-events-none disabled:hover:bg-dark-800/60"
                                    title={u.isActive ? 'Suplantar usuario' : 'No se puede suplantar: cuenta deshabilitada'}
                                    aria-label={u.isActive ? `Suplantar ${u.email}` : 'Suplantar no disponible'}
                                  >
                                    <LogIn className="w-4 h-4" aria-hidden />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => toggleActive(u)}
                                    className={
                                      u.isActive
                                        ? 'inline-flex items-center justify-center w-9 h-9 rounded-lg border border-amber-700/50 bg-dark-800/60 text-amber-400 hover:bg-amber-950/40 hover:text-amber-300'
                                        : 'inline-flex items-center justify-center w-9 h-9 rounded-lg border border-emerald-700/45 bg-dark-800/60 text-emerald-400 hover:bg-emerald-950/35 hover:text-emerald-300'
                                    }
                                    title={u.isActive ? 'Deshabilitar cuenta' : 'Habilitar cuenta'}
                                    aria-label={
                                      u.isActive ? `Deshabilitar ${u.email}` : `Habilitar ${u.email}`
                                    }
                                  >
                                    {u.isActive ? (
                                      <UserX className="w-4 h-4" aria-hidden />
                                    ) : (
                                      <UserCheck className="w-4 h-4" aria-hidden />
                                    )}
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
            {total > 0 && (
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
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AdminUsers;
