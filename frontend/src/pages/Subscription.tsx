import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriptionClientService } from '../services/subscriptionClientService';
import { useSubscription } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { SUBSCRIPTION_MODULE_KEYS } from '../constants/subscriptionModules';
import { LIST_CARD_SHELL, listCardAccentNeutral } from '../utils/listCard';
import { useTranslation } from 'react-i18next';

const Subscription: React.FC = () => {
  const { t } = useTranslation();
  const moduleLabel = (key: string) => t(`pages.subscriptionModuleLabels.${key}`);
  const { user } = useAuth();
  const { formatDateTimeMedium } = useIntlFormatting();
  const { subscription, refetch } = useSubscription();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutPlan, setCheckoutPlan] = useState<number | null>(null);

  useEffect(() => {
    subscriptionClientService
      .getPlans()
      .then(setPlans)
      .catch(() => toast.error(t('toast.subscription.plansLoadError')))
      .finally(() => setLoading(false));
  }, [t]);

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
      toast.error(e.response?.data?.message || t('toast.subscription.paypalStartError'));
    } finally {
      setCheckoutPlan(null);
    }
  };

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('paypal') === 'return') {
      toast.success(t('toast.subscription.paypalReturnHint'));
      refetch();
      window.history.replaceState({}, '', '/subscription');
    }
    if (q.get('paypal') === 'cancel') {
      toast(t('toast.subscription.paypalCancelled'));
      window.history.replaceState({}, '', '/subscription');
    }
  }, [refetch, t]);

  const dash = t('common.emptyDash');
  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return dash;
    const s = formatDateTimeMedium(iso);
    return s || dash;
  };

  const showPeriodCard =
    !subscription?.isSuperAdmin &&
    subscription?.plan &&
    (subscription.currentPeriodStart != null ||
      subscription.currentPeriodEnd != null ||
      subscription.billingInterval != null);

  const nameSuffix = user?.firstName ? `, ${user.firstName}` : '';

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      <div className="text-center sm:text-left">
        <h1 className="page-title mb-2">{t('pages.subscription.title')}</h1>
        <p className="text-dark-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto sm:mx-0">
          {t('pages.subscription.greeting', { nameSuffix })}
          <span className="text-primary-400 font-medium">
            {' '}
            {subscription?.plan?.name || subscription?.status || dash}
          </span>
        </p>
        {showPeriodCard && (
          <div
            className="mt-4 rounded-2xl border border-dark-600/70 bg-dark-800/80 px-4 py-3 sm:px-5 sm:py-4 text-left shadow-lg shadow-black/20 max-w-2xl"
            role="region"
            aria-label={t('pages.subscription.periodRegionAria')}
          >
            <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-dark-500">
              {t('pages.subscription.periodLabel')}
            </p>
            {subscription.billingInterval && (
              <p className="mt-1.5 text-sm text-dark-200">
                <span className="text-dark-400">{t('pages.subscription.billing')} </span>
                {subscription.billingInterval === 'monthly'
                  ? t('pages.subscription.billingMonthly')
                  : subscription.billingInterval === 'yearly'
                    ? t('pages.subscription.billingYearly')
                    : dash}
              </p>
            )}
            <p className="mt-1.5 text-sm text-dark-200 sm:text-base">
              <span className="text-dark-400">{t('pages.subscription.from')} </span>
              {fmtDateTime(subscription.currentPeriodStart)}
            </p>
            <p className="mt-1 text-sm text-dark-200 sm:text-base">
              <span className="text-dark-400">{t('pages.subscription.to')} </span>
              {fmtDateTime(subscription.currentPeriodEnd)}
            </p>
            {subscription.currentPeriodEnd && (
              <p className="mt-2 text-xs text-dark-500">{t('pages.subscription.periodFootnote')}</p>
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
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[min(100%,12rem)] flex-1 space-y-2 pr-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                        <CreditCard className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                        {t('pages.subscription.planBadge')}
                      </span>
                      {isCurrent && (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400 ring-1 ring-emerald-500/30">
                          {t('pages.subscription.currentPlanBadge')}
                        </span>
                      )}
                    </div>
                    <h2 className="break-words text-xl font-bold leading-snug text-white sm:text-2xl">{p.name}</h2>
                    {p.description && <p className="text-sm text-dark-400">{p.description}</p>}
                  </div>
                  <CreditCard className="h-8 w-8 shrink-0 text-primary-500" aria-hidden />
                </div>

                <div className="mt-4 flex flex-col gap-4 border-t border-dark-700/80 pt-4">
                  <div className="metrics-cq">
                    <div className="metrics-row-2">
                      <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                          {t('pages.subscription.billingMonthly')}
                        </p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums text-white sm:text-xl">
                          {p.currency}{' '}
                          {Number(p.priceMonthly) > 0 ? (
                            <>
                              {p.priceMonthly}
                              <span className="text-sm font-normal text-dark-400">
                                {' '}
                                {t('pages.subscription.perMonthSuffix')}
                              </span>
                            </>
                          ) : (
                            <span className="text-base font-semibold">{t('pages.subscription.priceFree')}</span>
                          )}
                        </p>
                      </div>
                      {Number(p.priceYearly) > 0 && (
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                          <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                            {t('pages.subscription.billingYearly')}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-dark-200 sm:text-base">
                            {p.currency} {p.priceYearly}{' '}
                            <span className="text-xs font-normal text-dark-500">{t('pages.subscription.perYearSuffix')}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm text-dark-300">
                    {p.enabledModules &&
                      typeof p.enabledModules === 'object' &&
                      SUBSCRIPTION_MODULE_KEYS.filter((k) => !!p.enabledModules?.[k]).map((k) => (
                        <li key={k} className="flex items-center gap-2 min-w-0">
                          <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="min-w-0 break-words leading-snug">{moduleLabel(k)}</span>
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
                          {checkoutPlan === p.id ? t('pages.subscription.redirecting') : t('pages.subscription.subscribeMonthly')}
                        </button>
                      )}
                      {Number(p.priceYearly) > 0 && (
                        <button
                          type="button"
                          disabled={checkoutPlan === p.id}
                          onClick={() => startPaypal(p.id, 'yearly')}
                          className="btn-secondary text-sm"
                        >
                          {checkoutPlan === p.id ? t('pages.subscription.redirecting') : t('pages.subscription.subscribeYearly')}
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
          <p className="font-medium text-amber-200 mb-1">{t('pages.subscription.superAdminPaypalTitle')}</p>
          <p className="text-dark-300">{t('pages.subscription.superAdminPaypalBody')}</p>
        </div>
      )}
    </div>
  );
};

export default Subscription;
