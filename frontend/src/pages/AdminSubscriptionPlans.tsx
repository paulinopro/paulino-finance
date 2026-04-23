import React, { useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { Layers, Plus, Trash2, Save, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../services/adminService';
import { SUBSCRIPTION_MODULE_KEYS, subscriptionModuleLabelEs } from '../constants/subscriptionModules';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import TablePagination from '../components/TablePagination';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';

const emptyModules = () => {
  const o: Record<string, boolean> = {};
  SUBSCRIPTION_MODULE_KEYS.forEach((k) => {
    o[k] = false;
  });
  return o;
};

const AdminSubscriptionPlans: React.FC = () => {
  const editModalRef = useRef<HTMLDivElement>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [syncingId, setSyncingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminService.listSubscriptionPlans();
      setPlans(data.plans);
    } catch {
      toast.error('Error al cargar planes');
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
  }, [plans.length]);
  const plansTotalPages = Math.max(1, Math.ceil(plans.length / TABLE_PAGE_SIZE));
  const plansPageSafe = Math.min(plansPage, plansTotalPages);
  useEffect(() => {
    setPlansPage((p) => Math.min(p, plansTotalPages));
  }, [plansTotalPages]);
  const pagedPlans = useMemo(() => {
    const start = (plansPageSafe - 1) * TABLE_PAGE_SIZE;
    return plans.slice(start, start + TABLE_PAGE_SIZE);
  }, [plans, plansPageSafe]);

  const saveEdit = async () => {
    if (!editing) return;
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
      toast.success('Plan guardado');
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al guardar');
    }
  };

  const createPlan = async () => {
    const name = window.prompt('Nombre del plan');
    if (!name) return;
    const slug = window.prompt('Slug (url, ej. premium)') || name.toLowerCase().replace(/\s+/g, '-');
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
      toast.success('Plan creado');
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error');
    }
  };

  const syncPaypal = async (id: number) => {
    setSyncingId(id);
    try {
      const r = await adminService.syncSubscriptionPlanPaypal(id);
      const parts: string[] = [];
      if (r.created.product) parts.push('producto');
      if (r.created.monthly) parts.push('plan mensual');
      if (r.created.yearly) parts.push('plan anual');
      toast.success(
        parts.length
          ? `PayPal: creado ${parts.join(', ')}`
          : 'Ya estaba sincronizado (sin cambios en PayPal)'
      );
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al sincronizar con PayPal');
    } finally {
      setSyncingId(null);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('¿Eliminar este plan?')) return;
    try {
      await adminService.deleteSubscriptionPlan(id);
      toast.success('Eliminado');
      load();
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'No se puede eliminar');
    }
  };

  useEscapeKey(!!editing, () => setEditing(null));
  useModalFocusTrap(editModalRef, !!editing);

  return (
    <div className="p-3 sm:p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <AdminBreadcrumbs />
      <div className="flex flex-col items-center text-center gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:text-left">
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
          <Layers className="w-8 h-8 text-primary-400 shrink-0" />
          <div>
            <h1 className="page-title">Planes de suscripción</h1>
            <p className="text-dark-400 text-sm">Precios, PayPal plan IDs y módulos por plan</p>
          </div>
        </div>
        <button type="button" onClick={createPlan} className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          Nuevo plan
        </button>
      </div>

      {loading ? (
        <p className="text-dark-500">Cargando…</p>
      ) : (
        <div className="space-y-4">
          {pagedPlans.map((p) => (
            <motion.div key={p.id} className="card flex flex-wrap justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">{p.name}</h3>
                <p className="text-dark-500 text-sm">{p.slug}</p>
                <p className="text-dark-400 text-sm mt-2">{p.description}</p>
                <p className="text-primary-300 mt-2">
                  {p.currency} {p.priceMonthly}/mes · {p.priceYearly}/año
                </p>
                <p className="text-xs text-dark-500 mt-1">
                  PayPal producto: {p.paypalProductId || '—'}
                </p>
                <p className="text-xs text-dark-500 mt-0.5">
                  Plan ID mensual: {p.paypalPlanIdMonthly || '—'} · anual: {p.paypalPlanIdYearly || '—'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary text-sm inline-flex items-center gap-1.5"
                  disabled={syncingId === p.id}
                  onClick={() => syncPaypal(p.id)}
                  title="Crear en PayPal el producto y los planes de facturación (mensual/anual) según los precios"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingId === p.id ? 'animate-spin' : ''}`} />
                  Sincronizar PayPal
                </button>
                <button type="button" className="btn-secondary text-sm" onClick={() => setEditing({ ...p })}>
                  Editar
                </button>
                <button type="button" className="text-red-400 p-2" onClick={() => remove(p.id)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
          <TablePagination
            currentPage={plansPageSafe}
            totalPages={plansTotalPages}
            totalItems={plans.length}
            itemsPerPage={TABLE_PAGE_SIZE}
            onPageChange={setPlansPage}
            itemLabel="planes"
            variant="card"
          />
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
              Editar plan
            </h3>
            <div className="space-y-3 text-sm">
              {['name', 'slug', 'description', 'currency', 'priceMonthly', 'priceYearly', 'sortOrder'].map(
                (field) => (
                  <div key={field}>
                    <label className="label capitalize">{field}</label>
                    <input
                      className="input w-full"
                      value={editing[field] ?? ''}
                      onChange={(e) => setEditing({ ...editing, [field]: e.target.value })}
                    />
                  </div>
                )
              )}
              <div>
                <label className="label">PayPal product ID (PROD-…)</label>
                <input
                  className="input w-full"
                  value={editing.paypalProductId ?? ''}
                  onChange={(e) => setEditing({ ...editing, paypalProductId: e.target.value })}
                  placeholder="Opcional si usas Sincronizar PayPal"
                />
              </div>
              <div>
                <label className="label">PayPal plan ID (mensual)</label>
                <input
                  className="input w-full"
                  value={editing.paypalPlanIdMonthly ?? ''}
                  onChange={(e) => setEditing({ ...editing, paypalPlanIdMonthly: e.target.value })}
                />
              </div>
              <div>
                <label className="label">PayPal plan ID (anual)</label>
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
                Activo
              </label>
              <div>
                <p className="label">Módulos incluidos</p>
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
                      {subscriptionModuleLabelEs(key)}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button type="button" className="btn-primary flex items-center gap-2" onClick={saveEdit}>
                <Save className="w-4 h-4" />
                Guardar
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSubscriptionPlans;
