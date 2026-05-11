import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { Layers, Plus, Trash2, Save, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../services/adminService';
import { SUBSCRIPTION_MODULE_KEYS, enabledModulesHasAtLeastOne } from '../constants/subscriptionModules';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';

const emptyModules = () => {
  const o: Record<string, boolean> = {};
  SUBSCRIPTION_MODULE_KEYS.forEach((k) => {
    o[k] = false;
  });
  return o;
};

const ADMIN_PLAN_EDIT_FIELDS = ['name', 'slug', 'description', 'currency', 'priceMonthly', 'priceYearly', 'sortOrder'] as const;

const AdminSubscriptionPlans: React.FC = () => {
  const { t } = useTranslation();
  const moduleLabel = (key: string) => t(`pages.subscriptionModuleLabels.${key}`);
  const { formatCurrency: fc, primaryCurrency } = useIntlFormatting();
  const { pageSize: adminPlansPageSize, setPageSize: setAdminPlansPageSize, pageSizeOptions: adminPlansPageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:adminSubscriptionPlans', TABLE_PAGE_SIZE);
  const editModalRef = useRef<HTMLDivElement>(null);
  const createModalRef = useRef<HTMLDivElement>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanSlug, setNewPlanSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminService.listSubscriptionPlans();
      setPlans(data.plans);
    } catch {
      toast.error(t('toast.adminPlans.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const [plansPage, setPlansPage] = useState(1);
  useEffect(() => {
    setPlansPage(1);
  }, [plans.length, adminPlansPageSize]);
  const plansTotalPages = Math.max(1, Math.ceil(plans.length / adminPlansPageSize));
  const plansPageSafe = Math.min(plansPage, plansTotalPages);
  useEffect(() => {
    setPlansPage((p) => Math.min(p, plansTotalPages));
  }, [plansTotalPages]);
  const pagedPlans = useMemo(() => {
    const start = (plansPageSafe - 1) * adminPlansPageSize;
    return plans.slice(start, start + adminPlansPageSize);
  }, [plans, plansPageSafe, adminPlansPageSize]);

  const saveEdit = async () => {
    if (!editing) return;
    if (!enabledModulesHasAtLeastOne(editing.enabledModules)) {
      toast.error(t('toast.adminPlans.modulesRequired'));
      return;
    }
    try {
      await adminService.updateSubscriptionPlan(editing.id, {
        name: editing.name,
        slug: editing.slug,
        description: editing.description,
        priceMonthly: parseFloat(editing.priceMonthly) || 0,
        priceYearly: parseFloat(editing.priceYearly) || 0,
        currency: editing.currency || 'USD',
        paypalPlanIdMonthly: editing.paypalPlanIdMonthly || null,
        paypalPlanIdYearly: editing.paypalPlanIdYearly || null,
        enabledModules: editing.enabledModules,
        isActive: editing.isActive,
        sortOrder: parseInt(String(editing.sortOrder), 10) || 0,
      });
      toast.success(t('toast.adminPlans.saved'));
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.adminPlans.saveError'));
    }
  };

  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    setNewPlanName('');
    setNewPlanSlug('');
    setSlugTouched(false);
    setCreateSaving(false);
  }, []);

  const openCreate = () => {
    setNewPlanName('');
    setNewPlanSlug('');
    setSlugTouched(false);
    setCreateOpen(true);
  };

  useEffect(() => {
    if (!createOpen || slugTouched) return;
    const raw = newPlanName.trim().toLowerCase().replace(/\s+/g, '-');
    const safe = raw
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    setNewPlanSlug(safe);
  }, [newPlanName, slugTouched, createOpen]);

  const submitCreate = async () => {
    const name = newPlanName.trim();
    const slug = newPlanSlug.trim().toLowerCase().replace(/\s+/g, '-').slice(0, 80);
    if (!name) {
      toast.error(t('toast.adminPlans.nameRequired'));
      return;
    }
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      toast.error(t('toast.adminPlans.slugInvalid'));
      return;
    }
    setCreateSaving(true);
    try {
      await adminService.createSubscriptionPlan({
        name,
        slug,
        description: '',
        priceMonthly: 0,
        priceYearly: 0,
        currency: 'USD',
        enabledModules: { ...emptyModules(), dashboard: true, subscription: true, profile: true },
        isActive: true,
        sortOrder: plans.length,
      });
      toast.success(t('toast.adminPlans.createdHint'));
      closeCreate();
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.adminPlans.createError'));
    } finally {
      setCreateSaving(false);
    }
  };

  const syncPaypal = async (id: number) => {
    setSyncingId(id);
    try {
      const r = await adminService.syncSubscriptionPlanPaypal(id);
      const parts: string[] = [];
      if (r.created.product) parts.push(t('toast.adminPlans.paypalProduct'));
      if (r.created.monthly) parts.push(t('toast.adminPlans.paypalMonthly'));
      if (r.created.yearly) parts.push(t('toast.adminPlans.paypalYearly'));
      toast.success(
        parts.length ? t('toast.adminPlans.paypalCreated', { parts: parts.join(', ') }) : t('toast.adminPlans.paypalSyncedNoop')
      );
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.adminPlans.paypalSyncError'));
    } finally {
      setSyncingId(null);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(t('confirm.deletePlan'))) return;
    try {
      await adminService.deleteSubscriptionPlan(id);
      toast.success(t('toast.adminPlans.deleted'));
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.adminPlans.deleteError'));
    }
  };

  useEscapeKey(!!editing || createOpen, () => {
    if (editing) setEditing(null);
    else closeCreate();
  });
  useModalFocusTrap(editModalRef, !!editing);
  useModalFocusTrap(createModalRef, createOpen && !editing);

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <AdminBreadcrumbs />
      <div className="flex flex-col items-center text-center gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:text-left">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
          <Layers className="w-8 h-8 text-primary-400 shrink-0" />
          <div>
            <h1 className="page-title">{t('pages.adminPlans.title')}</h1>
            <p className="text-dark-400 text-sm">{t('pages.adminPlans.subtitle')}</p>
          </div>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          {t('pages.adminPlans.newPlan')}
        </button>
      </div>

      <details className="rounded-xl border border-dark-700 bg-dark-900/35 px-3 py-2 text-sm text-dark-300">
        <summary className="cursor-pointer text-primary-400/95 font-medium select-none">
          {t('pages.adminPlans.helpTitle')}
        </summary>
        <ul className="mt-2 space-y-1.5 list-disc pl-4 text-xs text-dark-400">
          <li>{t('pages.adminPlans.helpLi1')}</li>
          <li>{t('pages.adminPlans.helpLi2')}</li>
          <li>{t('pages.adminPlans.helpLi3')}</li>
          <li>{t('pages.adminPlans.helpLi4')}</li>
        </ul>
      </details>

      {loading ? (
        <p className="text-dark-500">{t('common.actions.loading')}</p>
      ) : (
        <>
          <div className="space-y-4">
            {pagedPlans.map((p) => (
            <motion.div key={p.id} className="card flex flex-wrap justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                <p className="text-dark-500 text-sm">{p.slug}</p>
                <p className="text-dark-400 text-sm mt-2">{p.description}</p>
                <p className="text-primary-300 mt-2">
                  {fc(Number(p.priceMonthly) || 0, (p.currency || primaryCurrency) as string)}{' '}
                  {t('pages.adminPlans.perMonth')} ·{' '}
                  {fc(Number(p.priceYearly) || 0, (p.currency || primaryCurrency) as string)}{' '}
                  {t('pages.adminPlans.perYear')}
                </p>
                <p className="text-xs text-dark-500 mt-1">
                  {t('pages.adminPlans.paypalProductLabel')} {p.paypalProductId || t('common.emptyDash')}
                </p>
                <p className="text-xs text-dark-500 mt-0.5">
                  {t('pages.adminPlans.planIdsLine', {
                    monthly: p.paypalPlanIdMonthly || t('common.emptyDash'),
                    yearly: p.paypalPlanIdYearly || t('common.emptyDash'),
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm inline-flex items-center gap-1.5"
                  disabled={syncingId === p.id}
                  onClick={() => syncPaypal(p.id)}
                  title={t('pages.adminPlans.syncPayPalTooltip')}
                >
                  <RefreshCw className={`w-4 h-4 ${syncingId === p.id ? 'animate-spin' : ''}`} />
                  {t('pages.adminPlans.syncPayPal')}
                </button>
                <button type="button" className="btn-secondary text-sm" onClick={() => setEditing({ ...p })}>
                  {t('pages.adminPlans.editButton')}
                </button>
                <button type="button" className="text-red-400 p-2" onClick={() => remove(p.id)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
          </div>
          <TablePagination
            className="mt-4 sm:mt-5"
            currentPage={plansPageSafe}
            totalPages={plansTotalPages}
            totalItems={plans.length}
            itemsPerPage={adminPlansPageSize}
            onPageChange={setPlansPage}
            itemLabel={t('pages.adminPlans.plansPaginationLabel')}
            variant="card"
            pageSizeOptions={adminPlansPageSizeOptions}
            onPageSizeChange={setAdminPlansPageSize}
          />
        </>
      )}

      {createOpen && (
        <div
          className="modal-overlay"
          onClick={() => !createSaving && closeCreate()}
          role="presentation"
        >
          <div
            ref={createModalRef}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-plan-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="admin-plan-create-title" className="text-xl font-semibold text-white mb-1">
              {t('pages.adminPlans.createTitle')}
            </h3>
            <p className="text-dark-500 text-xs mb-4">{t('pages.adminPlans.createIntro')}</p>
            <div className="space-y-3 text-sm">
              <div>
                <label className="label" htmlFor="new-plan-name">
                  {t('pages.adminPlans.displayNameLabel')}
                </label>
                <input
                  id="new-plan-name"
                  className="input w-full"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  placeholder={t('pages.adminPlans.displayNamePlaceholder')}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="label" htmlFor="new-plan-slug">
                  {t('pages.adminPlans.slugLabel')}
                </label>
                <input
                  id="new-plan-slug"
                  className="input w-full font-mono text-xs"
                  value={newPlanSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setNewPlanSlug(e.target.value);
                  }}
                  placeholder={t('pages.adminPlans.slugPlaceholder')}
                  autoComplete="off"
                />
                <p className="text-dark-500 text-[0.65rem] mt-1">{t('pages.adminPlans.slugHint')}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-6">
              <button
                type="button"
                className="btn-primary flex items-center gap-2"
                disabled={createSaving}
                onClick={() => void submitCreate()}
              >
                <Plus className="w-4 h-4" />
                {createSaving ? t('pages.adminPlans.creating') : t('pages.adminPlans.createSubmit')}
              </button>
              <button type="button" className="btn-secondary" disabled={createSaving} onClick={closeCreate}>
                {t('common.actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)} role="presentation">
          <div
            ref={editModalRef}
            className="card modal-sheet max-w-lg w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-plan-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="admin-plan-modal-title" className="text-xl font-semibold text-white mb-4">
              {t('pages.adminPlans.editTitle')}
            </h3>
            <div className="space-y-3 text-sm">
              {ADMIN_PLAN_EDIT_FIELDS.map((field) => (
                  <div key={field}>
                    <label className="label">{t(`pages.adminPlans.planField.${field}`)}</label>
                    <input
                      className="input w-full"
                      value={editing[field] ?? ''}
                      onChange={(e) => setEditing({ ...editing, [field]: e.target.value })}
                    />
                  </div>
                ))}
              <div>
                <label className="label">{t('pages.adminPlans.paypalProductIdLabel')}</label>
                <input
                  className="input w-full"
                  value={editing.paypalProductId ?? ''}
                  onChange={(e) => setEditing({ ...editing, paypalProductId: e.target.value })}
                  placeholder={t('pages.adminPlans.paypalFieldPlaceholder')}
                />
              </div>
              <div>
                <label className="label">{t('pages.adminPlans.paypalPlanMonthlyLabel')}</label>
                <input
                  className="input w-full"
                  value={editing.paypalPlanIdMonthly ?? ''}
                  onChange={(e) => setEditing({ ...editing, paypalPlanIdMonthly: e.target.value })}
                />
              </div>
              <div>
                <label className="label">{t('pages.adminPlans.paypalPlanYearlyLabel')}</label>
                <input
                  className="input w-full"
                  value={editing.paypalPlanIdYearly ?? ''}
                  onChange={(e) => setEditing({ ...editing, paypalPlanIdYearly: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 text-dark-300">
                <input
                  type="checkbox"
                  checked={!!editing.isActive}
                  onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })}
                />
                {t('pages.adminPlans.isActive')}
              </label>
              <div>
                <p className="label">{t('pages.adminPlans.includedModules')}</p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {SUBSCRIPTION_MODULE_KEYS.map((key) => (
                    <label key={key} className="flex items-center gap-2 text-dark-300 text-xs">
                      <input
                        type="checkbox"
                        checked={!!editing.enabledModules?.[key]}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            enabledModules: {
                              ...(editing.enabledModules || {}),
                              [key]: e.target.checked,
                            },
                          })
                        }
                      />
                      {moduleLabel(key)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button type="button" className="btn-primary flex items-center gap-2" onClick={saveEdit}>
                <Save className="w-4 h-4" />
                {t('common.actions.save')}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                {t('common.actions.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSubscriptionPlans;
