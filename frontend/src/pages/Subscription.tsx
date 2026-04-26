import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriptionClientService } from '../services/subscriptionClientService';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { SUBSCRIPTION_MODULE_KEYS, subscriptionModuleLabelEs } from '../constants/subscriptionModules';
import { LIST_CARD_SHELL, listCardAccentNeutral } from '../utils/listCard';

const Subscription: React.FC = () => {
  const { user } = useAuth();
  const { subscription, refetch } = useSubscription();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<number | null>(null);

  useEffect(() => {
    subscriptionClientService
      .getPlans()
      .then(setPlans)
      .catch(() => toast.error('No se pudieron cargar los planes'))
      .finally(() => setLoading(false));
  }, []);

  const startPaypal = async (planId: number, billingCycle: 'monthly' | 'yearly') => {
    const base = window.location.origin;
    setCheckoutPlan(planId);
    try {
      const data = await subscriptionClientService.startPaypal({
        planId,
        billingCycle,
        returnUrl: `${base}/subscription?paypal=return`,
        cancelUrl: `${base}/subscription?paypal=cancel`,
      });
      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'No se pudo iniciar PayPal');
    } finally {
      setCheckoutPlan(null);
    }
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('paypal') === 'return') {
      toast.success('Si completaste el pago en PayPal, tu plan se actualizará en breve.');
      refetch();
      window.history.replaceState({}, '', '/subscription');
    }
    if (q.get('paypal') === 'cancel') {
      toast('Pago cancelado');
      window.history.replaceState({}, '', '/subscription');
    }
  }, [refetch]);

  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const showPeriodCard =
    !subscription?.isSuperAdmin &&
    subscription?.plan &&
    (subscription.currentPeriodStart != null ||
      subscription.currentPeriodEnd != null ||
      subscription.billingInterval != null);

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      <div className="text-center sm:text-left">
        <h1 className="page-title mb-2">Planes y suscripción</h1>
        <p className="text-dark-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto sm:mx-0">
          Hola{user?.firstName ? `, ${user.firstName}` : ''}. Tu plan actual:{' '}
          <span className="text-primary-400 font-medium">
            {subscription?.plan?.name || subscription?.status || '—'}
          </span>
        </p>
        {showPeriodCard && (
          <div
            className="mt-4 rounded-2xl border border-dark-600/70 bg-dark-800/80 px-4 py-3 sm:px-5 sm:py-4 text-left shadow-lg shadow-black/20 max-w-2xl"
            role="region"
            aria-label="Período de suscripción activa"
          >
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500">Período de la suscripción activa</p>
            {subscription.billingInterval && (
              <p className="mt-1.5 text-sm text-dark-200">
                <span className="text-dark-400">Facturación: </span>
                {subscription.billingInterval === 'monthly' ? 'Mensual' : subscription.billingInterval === 'yearly' ? 'Anual' : '—'}
              </p>
            )}
            <p className="mt-1.5 text-sm text-dark-200 sm:text-base">
              <span className="text-dark-400">Desde: </span>
              {fmtDateTime(subscription.currentPeriodStart)}
            </p>
            <p className="mt-1 text-sm text-dark-200 sm:text-base">
              <span className="text-dark-400">Hasta: </span>
              {fmtDateTime(subscription.currentPeriodEnd)}
            </p>
            {subscription.currentPeriodEnd && (
              <p className="mt-2 text-xs text-dark-500">
                Próxima renovación o fin de ciclo según se indique arriba. Las fechas se sincronizan con PayPal cuando la suscripción está vinculada.
              </p>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-dark-400">
          <Loader2 className="animate-spin w-8 h-8" />
        </div>
      ) : (
        <div className="grid gap-4 sm:gap-5 md:grid-cols-2 xl:gap-6">
          {plans.map((p) => {
            const isCurrent = subscription?.plan?.id === p.id;
            return (
              <motion.article
                key={p.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className={[LIST_CARD_SHELL, isCurrent ? 'border-l-emerald-500' : listCardAccentNeutral()].join(' ')}
              >
                <div className="flex flex-row gap-3 justify-between items-start">
                  <div className="min-w-0 flex-1 space-y-2 pr-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                        <CreditCard className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                        Plan
                      </span>
                      {isCurrent && (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
                          Plan actual
                        </span>
                      )}
                    </div>
                    <h2 className="text-balance text-xl font-bold leading-snug text-white sm:text-2xl">{p.name}</h2>
                    {p.description && <p className="text-sm text-dark-400">{p.description}</p>}
                  </div>
                  <CreditCard className="h-8 w-8 shrink-0 text-primary-500" aria-hidden />
                </div>

                <div className="mt-4 flex flex-col gap-4 border-t border-dark-700/80 pt-4">
                  <div className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:gap-3">
                    <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Mensual</p>
                      <p className="mt-0.5 text-lg font-bold tabular-nums text-white sm:text-xl">
                        {p.currency}{' '}
                        {Number(p.priceMonthly) > 0 ? (
                          <>
                            {p.priceMonthly}
                            <span className="text-sm font-normal text-dark-400"> / mes</span>
                          </>
                        ) : (
                          <span className="text-base font-semibold">Gratis</span>
                        )}
                      </p>
                    </div>
                    {Number(p.priceYearly) > 0 && (
                      <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Anual</p>
                        <p className="mt-0.5 text-sm font-semibold text-dark-200 sm:text-base">
                          {p.currency} {p.priceYearly} <span className="text-xs font-normal text-dark-500">/ año</span>
                        </p>
                      </div>
                    )}
                  </div>

                  <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-dark-300">
                    {p.enabledModules &&
                      typeof p.enabledModules === 'object' &&
                      SUBSCRIPTION_MODULE_KEYS.filter((k) => !!p.enabledModules?.[k]).map((k) => (
                        <li key={k} className="flex items-center gap-2 min-w-0">
                          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="min-w-0 break-words leading-snug">{subscriptionModuleLabelEs(k)}</span>
                        </li>
                      ))}
                  </ul>

                  {p.slug !== 'free' && (Number(p.priceMonthly) > 0 || Number(p.priceYearly) > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {Number(p.priceMonthly) > 0 && (
                        <button
                          type="button"
                          disabled={checkoutPlan === p.id}
                          onClick={() => startPaypal(p.id, 'monthly')}
                          className="btn-primary text-sm"
                        >
                          {checkoutPlan === p.id ? 'Redirigiendo…' : 'Suscribirse (mensual)'}
                        </button>
                      )}
                      {Number(p.priceYearly) > 0 && (
                        <button
                          type="button"
                          disabled={checkoutPlan === p.id}
                          onClick={() => startPaypal(p.id, 'yearly')}
                          className="btn-secondary text-sm"
                        >
                          Anual
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.article>
            );
          })}
        </div>
      )}

      {user?.isSuperAdmin && (
        <div className="rounded-2xl border border-amber-800/40 bg-amber-900/20 p-4 sm:p-5 shadow-lg shadow-black/20 text-amber-100/90 text-sm">
          <p className="font-medium text-amber-200 mb-1">Configuración PayPal (solo administración)</p>
          <p className="text-dark-300">
            Los pagos se procesan con PayPal. Configura en el servidor las variables{' '}
            <code className="text-amber-100/90 bg-dark-800/80 px-1 rounded">PAYPAL_CLIENT_ID</code>,{' '}
            <code className="text-amber-100/90 bg-dark-800/80 px-1 rounded">PAYPAL_CLIENT_SECRET</code> y los
            IDs de plan de PayPal en cada plan (panel{' '}
            <span className="text-primary-400">Planes de suscripción</span>).
          </p>
        </div>
      )}
    </div>
  );
};

export default Subscription;
