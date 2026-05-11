import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Shield, Search, LogIn, Download, Stethoscope, X, UserX, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService, AdminUserRow, AdminSubscriptionPlanSummary } from '../services/adminService';
import { useAuth } from '../context/AuthContext';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';
import PageHeader from '../components/PageHeader';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';
import { SUBSCRIPTION_STATUS_FILTER_VALUES } from '../constants/subscriptionModules';
import type { TFunction } from 'i18next';

function subscriptionStatusLabel(t: TFunction, status: string | null | undefined): string {
  if (!status) return '—';
  const raw = String(status).trim();
  const low = raw.toLowerCase();
  const known = ['active', 'trialing', 'cancelled', 'expired', 'past_due'] as const;
  if ((known as readonly string[]).includes(low)) {
    return t(`pages.adminUsers.subscriptionStatus.${low}`);
  }
  if (low === 'n/a') return t('pages.adminUsers.subscriptionStatusNa');
  if (low === 'sin suscripción') return t('pages.adminUsers.noSubscription');
  return raw;
}

function formatPeriodUtc(iso: string | null | undefined, localeTag: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(localeTag, {
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
  const { t } = useTranslation();
  const { setSession } = useAuth();
  const { localeTag } = useIntlFormatting();
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

  const { pageSize: limit, setPageSize: setUsersPageLimit, pageSizeOptions: usersPageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:adminUsers', TABLE_PAGE_SIZE);

  const searchApplied = searchTerm.trim();

  useEffect(() => {
    adminService
      .listSubscriptionPlans()
      .then((d) => setPlans(d.plans))
      .catch(() => {
        toast.error(t('toast.adminUsers.plansLoadError'));
      });
  }, [t]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, fActive, fPlan, fSub, fCreatedFrom, fCreatedTo, fBillingFrom, fBillingTo, limit]);

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
      toast.error(e.response?.data?.message || t('toast.adminUsers.usersLoadError'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchApplied, fActive, fPlan, fSub, fCreatedFrom, fCreatedTo, fBillingFrom, fBillingTo, t]);

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
      toast.success(t('toast.adminUsers.csvStarted'));
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.generic.exportFailed'));
    }
  };

  const toggleActive = async (u: AdminUserRow) => {
    if (u.isSuperAdmin) return;
    if (u.isActive) {
      const ok = window.confirm(t('confirm.disableUser', { email: u.email }));
      if (!ok) return;
    }
    try {
      await adminService.updateUser(u.id, { isActive: !u.isActive });
      toast.success(u.isActive ? t('toast.adminUsers.userDisabled') : t('toast.adminUsers.userEnabled'));
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.generic.fallbackError'));
    }
  };

  const refreshUsers = async () => {
    try {
      const list = await adminService.listUsers(listParams);
      setUsers(list.users);
      setTotal(list.total);
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.adminUsers.usersUpdateError'));
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
      toast.success(t('toast.adminUsers.planUpdated'));
      await refreshUsers();
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.adminUsers.planAssignError'));
    } finally {
      setSavingPlanUserId(null);
    }
  };

  const impersonate = async (u: AdminUserRow) => {
    if (u.isSuperAdmin) return;
    try {
      const res = await adminService.impersonate(u.id);
      setSession(res.token, res.user, res.impersonatedBy);
      toast.success(t('toast.adminUsers.impersonateSuccess', { email: u.email }));
      window.location.href = '/';
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.adminUsers.impersonateError'));
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <AdminBreadcrumbs />

        <PageHeader
          title={t('pages.adminUsers.title')}
          subtitle={t('pages.adminUsers.subtitle')}
          actions={
            <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => void downloadCsv()}
                className="btn-primary inline-flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto sm:flex-initial"
              >
                <Download className="w-4 h-4" />
                {t('pages.adminUsers.exportCsv')}
              </button>
              <Link
                to="/admin/system"
                className="inline-flex items-center justify-center gap-1.5 text-sm text-amber-500/90 hover:text-amber-400 font-medium border border-amber-800/50 rounded-lg px-3 py-2 transition shrink-0 w-full sm:w-auto"
              >
                <Stethoscope className="h-4 w-4" />
                {t('pages.adminUsers.apiStatusLink')}
              </Link>
            </div>
          }
        />

        {/* Filtros (misma idea que Ingresos / Gastos: una card con grid) */}
        <div className="card">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="relative sm:col-span-2 lg:col-span-2">
              <label className="text-xs text-dark-400 block mb-1">{t('common.actions.search')}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
                <input
                  type="text"
                  placeholder={t('pages.adminUsers.searchPlaceholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input w-full pl-10"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-dark-400 hover:text-white"
                    aria-label={t('pages.adminUsers.clearSearchAria')}
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">{t('pages.adminUsers.filterAccountLogin')}</label>
              <select
                className="input w-full"
                value={fActive}
                onChange={(e) => setFActive(e.target.value as '' | 'true' | 'false')}
              >
                <option value="">{t('pages.adminUsers.filterAny')}</option>
                <option value="true">{t('pages.adminUsers.accountActive')}</option>
                <option value="false">{t('pages.adminUsers.accountDisabled')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">{t('pages.adminUsers.filterAssignedPlan')}</label>
              <select
                className="input w-full"
                value={fPlan}
                onChange={(e) => setFPlan(e.target.value)}
                disabled={plans.length === 0}
              >
                <option value="">{t('pages.adminUsers.filterAny')}</option>
                <option value="none">{t('pages.adminUsers.unassignedPlan')}</option>
                {plans.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">{t('pages.adminUsers.filterSubscriptionState')}</label>
              <select className="input w-full" value={fSub} onChange={(e) => setFSub(e.target.value)}>
                <option value="">{t('pages.adminUsers.filterAny')}</option>
                {SUBSCRIPTION_STATUS_FILTER_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {t(`pages.adminUsers.subscriptionStatus.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">{t('pages.adminUsers.createdFrom')}</label>
              <input
                type="date"
                className="input w-full"
                value={fCreatedFrom}
                onChange={(e) => setFCreatedFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">{t('pages.adminUsers.createdTo')}</label>
              <input
                type="date"
                className="input w-full"
                value={fCreatedTo}
                onChange={(e) => setFCreatedTo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">{t('pages.adminUsers.billingPeriodFromUtc')}</label>
              <input
                type="date"
                className="input w-full"
                value={fBillingFrom}
                onChange={(e) => setFBillingFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-dark-400 block mb-1">{t('pages.adminUsers.billingPeriodToUtc')}</label>
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
                {t('pages.adminUsers.clearFilters')}
              </button>
            </div>
          )}
          <p className="text-[0.65rem] text-dark-500 mt-3 border-t border-dark-700/80 pt-3">
            {t('pages.adminUsers.filtersHint')}
          </p>
        </div>

        {!loading && users.length === 0 ? (
          <div className="card text-center py-12">
            <Shield className="w-16 h-16 text-dark-600 mx-auto mb-4" />
            <p className="text-dark-400 mb-4">{t('pages.adminUsers.emptyFiltered')}</p>
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="btn-primary">
                {t('pages.adminUsers.clearFilters')}
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
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium">
                        {t('pages.adminUsers.colUser')}
                      </th>
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium min-w-[200px]">
                        {t('pages.adminUsers.colPlan')}
                      </th>
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium">
                        {t('pages.adminUsers.colSubStatus')}
                      </th>
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium min-w-[8.5rem]">
                        {t('pages.adminUsers.colPeriodStartUtc')}
                      </th>
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium min-w-[8.5rem]">
                        {t('pages.adminUsers.colPeriodEndUtc')}
                      </th>
                      <th className="text-left align-middle py-3 px-4 text-dark-400 font-medium">
                        {t('pages.adminUsers.colAccount')}
                      </th>
                      <th className="text-right align-middle py-3 px-4 text-dark-400 font-medium">
                        {t('pages.adminUsers.colActions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-dark-500">
                          {t('common.actions.loading')}
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => (
                        <tr
                          key={u.id}
                          className="border-b border-dark-800/80 hover:bg-dark-800/40 max-md:border-0"
                        >
                          <td data-label={t('pages.adminUsers.dataLabelUser')} className="py-3 px-4 align-middle">
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
                                {u.isSuperAdmin && (
                                  <span className="ml-2 text-amber-400">{t('pages.admin.kpiSuperAdmin')}</span>
                                )}
                              </div>
                            </span>
                          </td>
                          <td data-label={t('pages.adminUsers.dataLabelPlan')} className="py-3 px-4 align-middle">
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
                                    aria-label={t('pages.adminUsers.planSelectAria', { email: u.email })}
                                  >
                                    {u.planId == null && (
                                      <option value="">{t('pages.adminUsers.unassignedPlan')}</option>
                                    )}
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
                                    <span className="shrink-0">{t('pages.adminUsers.manualBillingCycle')}</span>
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
                                      aria-label={t('pages.adminUsers.billingCycleAssignAria', { email: u.email })}
                                    >
                                      <option value="monthly">{t('pages.adminUsers.monthly')}</option>
                                      <option value="yearly">{t('pages.adminUsers.yearly')}</option>
                                    </select>
                                  </label>
                                </div>
                              )}
                            </span>
                          </td>
                          <td data-label={t('pages.adminUsers.dataLabelSubStatus')} className="py-3 px-4 align-middle">
                            <span className="table-stack-value text-dark-300 text-sm">
                              {subscriptionStatusLabel(t, u.subscriptionStatus)}
                            </span>
                          </td>
                          <td
                            data-label={t('pages.adminUsers.dataLabelPeriodStart')}
                            className="py-3 px-4 align-middle text-dark-300 text-xs tabular-nums"
                          >
                            {formatPeriodUtc(u.currentPeriodStart, localeTag)}
                          </td>
                          <td
                            data-label={t('pages.adminUsers.dataLabelPeriodEnd')}
                            className="py-3 px-4 align-middle text-dark-300 text-xs tabular-nums"
                          >
                            {formatPeriodUtc(u.currentPeriodEnd, localeTag)}
                          </td>
                          <td data-label={t('pages.adminUsers.dataLabelAccount')} className="py-3 px-4 align-middle">
                            <span className="table-stack-value">
                              <span className={u.isActive ? 'text-emerald-400' : 'text-red-400'}>
                                {u.isActive ? t('pages.adminUsers.accountActive') : t('pages.adminUsers.accountDisabled')}
                              </span>
                            </span>
                          </td>
                          <td data-label={t('pages.adminUsers.dataLabelActions')} className="py-3 px-4 align-middle text-right">
                            <span className="table-stack-value inline-flex flex-wrap items-center justify-end gap-2">
                              {!u.isSuperAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => impersonate(u)}
                                    disabled={!u.isActive}
                                    className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-dark-600 bg-dark-800/60 text-primary-400 hover:bg-dark-700 hover:text-primary-300 disabled:opacity-40 disabled:pointer-events-none disabled:hover:bg-dark-800/60"
                                    title={
                                      u.isActive ? t('pages.adminUsers.impersonateTitle') : t('pages.adminUsers.impersonateDisabled')
                                    }
                                    aria-label={
                                      u.isActive
                                        ? t('pages.adminUsers.impersonateAria', { email: u.email })
                                        : t('pages.adminUsers.impersonateUnavailableAria')
                                    }
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
                                    title={u.isActive ? t('pages.adminUsers.toggleActiveDisable') : t('pages.adminUsers.toggleActiveEnable')}
                                    aria-label={
                                      u.isActive
                                        ? t('pages.adminUsers.disableAria', { email: u.email })
                                        : t('pages.adminUsers.enableAria', { email: u.email })
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
                itemLabel={t('pages.adminUsers.itemsLabel')}
                disabled={loading}
                variant="card"
                pageSizeOptions={usersPageSizeOptions}
                onPageSizeChange={setUsersPageLimit}
              />
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AdminUsers;
