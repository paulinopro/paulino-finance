import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, Loader2, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService, type AdminSubscriptionPlanSummary } from '../services/adminService';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';
import type { SubscriptionMe, SubscriptionPaymentItem } from '../services/subscriptionClientService';

const fmt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });
};

const intervalLabel = (b: SubscriptionMe['billingInterval']) =>
  b === 'monthly' ? 'Mensual' : b === 'yearly' ? 'Anual' : '—';

const AdminUserDetail: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const id = parseInt(String(userId), 10);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<{
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    createdAt: string;
    isActive: boolean;
    isSuperAdmin: boolean;
  } | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionMe | null>(null);
  const [payments, setPayments] = useState<SubscriptionPaymentItem[]>([]);
  const [plans, setPlans] = useState<AdminSubscriptionPlanSummary[]>([]);
  const [planSelect, setPlanSelect] = useState<string>('');
  const [billingSelect, setBillingSelect] = useState<'monthly' | 'yearly'>('monthly');
  const [savingPlan, setSavingPlan] = useState(false);

  const loadUserData = async () => {
    const [detail, pay] = await Promise.all([
      adminService.getUserById(id),
      adminService.getUserPayments(id),
    ]);
    return { detail, pay };
  };

  useEffect(() => {
    if (Number.isNaN(id)) {
      toast.error('ID inválido');
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [result, planList] = await Promise.all([
          loadUserData(),
          adminService.listSubscriptionPlans().then((d) => d.plans).catch(() => []),
        ]);
        if (cancelled) return;
        const { detail, pay } = result;
        setUser(detail.user);
        setSubscription(detail.subscription);
        setPayments(pay.payments);
        setPlans(planList);
        const currentPlanId = detail.subscription?.plan?.id;
        setPlanSelect(currentPlanId != null ? String(currentPlanId) : '');
        setBillingSelect(
          detail.subscription?.billingInterval === 'yearly' ? 'yearly' : 'monthly'
        );
      } catch (e: any) {
        if (!cancelled) toast.error(e.response?.data?.message || 'Error al cargar');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const applyPlanChange = async () => {
    if (user?.isSuperAdmin) return;
    if (planSelect === '') {
      toast.error('Elige un plan');
      return;
    }
    const newId = parseInt(planSelect, 10);
    if (Number.isNaN(newId)) {
      toast.error('Plan no válido');
      return;
    }
    if (newId === subscription?.plan?.id && billingSelect === (subscription?.billingInterval || 'monthly')) {
      toast('Sin cambios que aplicar');
      return;
    }
    setSavingPlan(true);
    try {
      await adminService.updateUser(id, { planId: newId, billingInterval: billingSelect });
      toast.success('Plan actualizado');
      const { detail, pay } = await loadUserData();
      setUser(detail.user);
      setSubscription(detail.subscription);
      setPayments(pay.payments);
      setPlanSelect(detail.subscription?.plan?.id != null ? String(detail.subscription.plan.id) : '');
      setBillingSelect(
        detail.subscription?.billingInterval === 'yearly' ? 'yearly' : 'monthly'
      );
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'Error al asignar plan');
    } finally {
      setSavingPlan(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-8">
        <AdminBreadcrumbs userLabel={null} />
        <div className="flex min-h-[32vh] items-center justify-center text-dark-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <AdminBreadcrumbs userLabel={user.email} />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="page-title">Cliente</h1>
        <p className="text-dark-400 mt-1 text-sm">
          {user.email}
          {user.firstName || user.lastName ? ` · ${[user.firstName, user.lastName].filter(Boolean).join(' ')}` : ''}
        </p>
        <p className="text-dark-500 mt-2 text-xs">
          Cuenta: <span className={user.isActive ? 'text-emerald-400' : 'text-red-400'}>{user.isActive ? 'Activa' : 'Deshabilitada'}</span>
          {user.isSuperAdmin && <span className="ml-2 text-amber-400">Super admin</span>}
        </p>
      </motion.div>

      {subscription && (
        <div className="card space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <CreditCard className="h-5 w-5 text-primary-400" />
            Suscripción
          </h2>
          {subscription.isSuperAdmin ? (
            <p className="text-dark-400 text-sm">Usuario con acceso completo (super admin); no aplica plan de pago.</p>
          ) : (
            <>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Plan</p>
                  <p className="text-dark-200">{subscription.plan?.name || subscription.status}</p>
                </div>
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Facturación</p>
                  <p className="text-dark-200">{intervalLabel(subscription.billingInterval)}</p>
                </div>
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Periodo desde</p>
                  <p className="text-dark-200">{fmt(subscription.currentPeriodStart as string | null)}</p>
                </div>
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Periodo hasta</p>
                  <p className="text-dark-200">{fmt(subscription.currentPeriodEnd as string | null)}</p>
                </div>
              </div>
              <p className="text-xs text-dark-500">Estado API: {subscription.status}</p>
            </>
          )}
        </div>
      )}

      {!user.isSuperAdmin && plans.length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-lg font-semibold text-white">Cambiar plan (manual)</h2>
          <p className="text-xs text-dark-500">
            Misma lógica que en la lista de administración. Los webhooks de PayPal pueden ajustar periodo
            e intervalo después.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 sm:flex-1">
              <span className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Plan</span>
              <select
                className="input mt-1 w-full max-w-sm"
                value={planSelect}
                onChange={(e) => setPlanSelect(e.target.value)}
                disabled={savingPlan}
                aria-label="Plan a asignar"
              >
                {subscription?.plan == null && <option value="">Seleccionar plan…</option>}
                {subscription?.plan && !plans.some((p) => p.id === subscription.plan?.id) && (
                  <option value={String(subscription.plan.id)}>
                    {subscription.plan.name} (actual)
                  </option>
                )}
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full min-w-0 sm:w-44">
              <span className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                Ciclo
              </span>
              <select
                className="input mt-1 w-full"
                value={billingSelect}
                onChange={(e) => setBillingSelect(e.target.value as 'monthly' | 'yearly')}
                disabled={savingPlan}
                aria-label="Ciclo de facturación al asignar"
              >
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void applyPlanChange()}
              disabled={savingPlan}
              className="btn-primary h-[42px] w-full sm:w-auto shrink-0"
            >
              {savingPlan ? 'Guardando…' : 'Aplicar'}
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0 sm:p-0">
        <div className="border-b border-dark-700 px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Receipt className="h-5 w-5 text-primary-400" />
            Historial de pagos
          </h2>
        </div>
        {payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-dark-500 sm:px-5">Sin pagos registrados.</p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-dark-600/80 bg-dark-900/50 text-[0.7rem] uppercase tracking-wider text-dark-500">
                <th className="px-4 py-2 font-medium sm:px-5">Fecha pago</th>
                <th className="px-2 py-2 font-medium">Plan</th>
                <th className="px-2 py-2 font-medium">Importe</th>
                <th className="px-2 py-2 font-medium">Periodo</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-dark-800/80 text-dark-200">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-dark-300 sm:px-5">{fmt(p.paidAt)}</td>
                  <td className="px-2 py-2.5">{p.planName || '—'}</td>
                  <td className="px-2 py-2.5 tabular-nums">
                    {new Intl.NumberFormat('es-DO', { style: 'currency', currency: p.currency || 'USD' }).format(
                      parseFloat(p.amount) || 0
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-xs text-dark-400">
                    {p.periodStart || p.periodEnd ? `${fmt(p.periodStart)} → ${fmt(p.periodEnd)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default AdminUserDetail;
