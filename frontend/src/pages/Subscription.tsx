import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriptionClientService } from '../services/subscriptionClientService';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { SUBSCRIPTION_MODULE_KEYS, subscriptionModuleLabelEs } from '../constants/subscriptionModules';

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

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="page-title mb-2">Planes y suscripción</h1>
        <p className="text-dark-400 text-sm sm:text-base leading-relaxed">
          Hola{user?.firstName ? `, ${user.firstName}` : ''}. Tu plan actual:{' '}
          <span className="text-primary-400 font-medium">
            {subscription?.plan?.name || subscription?.status || '—'}
          </span>
          {subscription?.currentPeriodEnd && (
            <span className="text-dark-500 text-sm ml-2">
              (renovación / vigencia: {new Date(subscription.currentPeriodEnd).toLocaleDateString('es-DO')})
            </span>
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-dark-400">
          <Loader2 className="animate-spin w-8 h-8" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {plans.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="card border border-dark-600"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-white">{p.name}</h2>
                  <p className="text-dark-400 text-sm mt-1">{p.description}</p>
                </div>
                <CreditCard className="w-8 h-8 text-primary-500 shrink-0" />
              </div>
              <div className="text-2xl font-bold text-white mb-4">
                {p.currency}{' '}
                {Number(p.priceMonthly) > 0 ? (
                  <>
                    {p.priceMonthly}
                    <span className="text-sm font-normal text-dark-400">/mes</span>
                  </>
                ) : (
                  <span className="text-lg">Gratis</span>
                )}
              </div>
              {Number(p.priceYearly) > 0 && (
                <p className="text-dark-500 text-sm mb-4">
                  Anual: {p.currency} {p.priceYearly} / año
                </p>
              )}
              <ul className="space-y-2 mb-6 text-sm text-dark-300">
                {p.enabledModules &&
                  typeof p.enabledModules === 'object' &&
                  SUBSCRIPTION_MODULE_KEYS.filter((k) => !!p.enabledModules?.[k]).map((k) => (
                    <li key={k} className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      {subscriptionModuleLabelEs(k)}
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
              {subscription?.plan?.id === p.id && (
                <p className="text-emerald-400 text-sm mt-4">Plan actual</p>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {user?.isSuperAdmin && (
        <div className="card bg-amber-900/20 border border-amber-800/40 text-amber-100/90 text-sm">
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
