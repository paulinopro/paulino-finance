import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, Loader2, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService, type AdminSubscriptionPlanSummary } from '../services/adminService';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';
import type { SubscriptionMe, SubscriptionPaymentItem } from '../services/subscriptionClientService';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';

const AdminUserDetail: React.FC = () => {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const { formatDateTimeMedium, formatCurrency: fc, primaryCurrency } = useIntlFormatting();
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

  const fmt = (iso: string | null | undefined) => (!iso ? '—' : formatDateTimeMedium(iso) || '—');

  const billingIntervalLabel = (b: SubscriptionMe['billingInterval']) =>
    b === 'monthly' ? t('pages.adminUsers.monthly') : b === 'yearly' ? t('pages.adminUsers.yearly') : '—';

  const loadUserData = async () => {
    const [detail, pay] = await Promise.all([
      adminService.getUserById(id),
      adminService.getUserPayments(id),
    ]);
    return { detail, pay };
  };

  useEffect(() => {
    if (Number.isNaN(id)) {
      toast.error(t('toast.adminUserDetail.invalidId'));
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
        if (!cancelled) toast.error(e.response?.data?.message || t('toast.adminUserDetail.loadError'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, t]);

  const applyPlanChange = async () => {
    if (user?.isSuperAdmin) return;
    if (planSelect === '') {
      toast.error(t('toast.adminUserDetail.choosePlan'));
      return;
    }
    const newId = parseInt(planSelect, 10);
    if (Number.isNaN(newId)) {
      toast.error(t('toast.adminUserDetail.invalidPlan'));
      return;
    }
    if (newId === subscription?.plan?.id && billingSelect === (subscription?.billingInterval || 'monthly')) {
      toast(t('toast.adminUserDetail.noChangesToApply'));
      return;
    }
    setSavingPlan(true);
    try {
      await adminService.updateUser(id, { planId: newId, billingInterval: billingSelect });
      toast.success(t('toast.adminUserDetail.planUpdated'));
      const { detail, pay } = await loadUserData();
      setUser(detail.user);
      setSubscription(detail.subscription);
      setPayments(pay.payments);
      setPlanSelect(detail.subscription?.plan?.id != null ? String(detail.subscription.plan.id) : '');
      setBillingSelect(
        detail.subscription?.billingInterval === 'yearly' ? 'yearly' : 'monthly'
      );
    } catch (e: any) {
      toast.error(e.response?.data?.message || t('toast.adminUserDetail.planAssignError'));
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
        <h1 className="page-title">{t('pages.admin.userDetailTitle')}</h1>
        <p className="text-dark-400 mt-1 text-sm">
          {user.email}
          {user.firstName || user.lastName ? ` · ${[user.firstName, user.lastName].filter(Boolean).join(' ')}` : ''}
        </p>
        <p className="text-dark-500 mt-2 text-xs">
          {t('pages.adminUserDetail.accountLabel')}{' '}
          <span className={user.isActive ? 'text-emerald-400' : 'text-red-400'}>
            {user.isActive ? t('pages.adminUsers.accountActive') : t('pages.adminUsers.accountDisabled')}
          </span>
          {user.isSuperAdmin && (
            <span className="ml-2 text-amber-400">{t('pages.admin.kpiSuperAdmin')}</span>
          )}
        </p>
      </motion.div>

      {subscription && (
        <div className="card space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <CreditCard className="h-5 w-5 text-primary-400" />
            {t('pages.adminUserDetail.subscriptionHeading')}
          </h2>
          {subscription.isSuperAdmin ? (
            <p className="text-dark-400 text-sm">{t('pages.adminUserDetail.superAdminNoPlan')}</p>
          ) : (
            <>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                    {t('pages.adminUserDetail.colPlan')}
                  </p>
                  <p className="text-dark-200">{subscription.plan?.name || subscription.status}</p>
                </div>
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                    {t('pages.adminUserDetail.billing')}
                  </p>
                  <p className="text-dark-200">{billingIntervalLabel(subscription.billingInterval)}</p>
                </div>
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                    {t('pages.adminUserDetail.periodFrom')}
                  </p>
                  <p className="text-dark-200">{fmt(subscription.currentPeriodStart as string | null)}</p>
                </div>
                <div>
                  <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                    {t('pages.adminUserDetail.periodTo')}
                  </p>
                  <p className="text-dark-200">{fmt(subscription.currentPeriodEnd as string | null)}</p>
                </div>
              </div>
              <p className="text-xs text-dark-500">
                {t('pages.adminUserDetail.apiStatus')} {subscription.status}
              </p>
            </>
          )}
        </div>
      )}

      {!user.isSuperAdmin && plans.length > 0 && (
        <div className="card space-y-3">
          <h2 className="text-lg font-semibold text-white">{t('pages.adminUserDetail.changePlanHeading')}</h2>
          <p className="text-xs text-dark-500">{t('pages.adminUserDetail.changePlanHint')}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="min-w-0 sm:flex-1">
              <span className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                {t('pages.adminUserDetail.colPlan')}
              </span>
              <select
                className="input mt-1 w-full max-w-sm"
                value={planSelect}
                onChange={(e) => setPlanSelect(e.target.value)}
                disabled={savingPlan}
                aria-label={t('pages.adminUserDetail.assignPlanAria')}
              >
                {subscription?.plan == null && (
                  <option value="">{t('pages.adminUserDetail.selectPlanPlaceholder')}</option>
                )}
                {subscription?.plan && !plans.some((p) => p.id === subscription.plan?.id) && (
                  <option value={String(subscription.plan.id)}>
                    {subscription.plan.name} {t('pages.adminUserDetail.currentPlanSuffix')}
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
                {t('pages.adminUserDetail.billingCycle')}
              </span>
              <select
                className="input mt-1 w-full"
                value={billingSelect}
                onChange={(e) => setBillingSelect(e.target.value as 'monthly' | 'yearly')}
                disabled={savingPlan}
                aria-label={t('pages.adminUserDetail.billingCycleAssignAria')}
              >
                <option value="monthly">{t('pages.adminUsers.monthly')}</option>
                <option value="yearly">{t('pages.adminUsers.yearly')}</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => void applyPlanChange()}
              disabled={savingPlan}
              className="btn-primary h-[42px] w-full sm:w-auto shrink-0"
            >
              {savingPlan ? t('pages.adminUserDetail.saving') : t('pages.adminUserDetail.apply')}
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto p-0 sm:p-0">
        <div className="border-b border-dark-700 px-4 py-3 sm:px-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Receipt className="h-5 w-5 text-primary-400" />
            {t('pages.adminUserDetail.paymentsHeading')}
          </h2>
        </div>
        {payments.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-dark-500 sm:px-5">{t('pages.adminUserDetail.noPayments')}</p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-dark-600/80 bg-dark-900/50 text-[0.7rem] uppercase tracking-wider text-dark-500">
                <th className="px-4 py-2 font-medium sm:px-5">{t('pages.adminUserDetail.colPaidAt')}</th>
                <th className="px-2 py-2 font-medium">{t('pages.adminUserDetail.colPlan')}</th>
                <th className="px-2 py-2 font-medium">{t('pages.adminUserDetail.colAmount')}</th>
                <th className="px-2 py-2 font-medium">{t('pages.adminUserDetail.colPeriod')}</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-dark-800/80 text-dark-200">
                  <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-dark-300 sm:px-5">{fmt(p.paidAt)}</td>
                  <td className="px-2 py-2.5">{p.planName || '—'}</td>
                  <td className="px-2 py-2.5 tabular-nums">
                    {fc(parseFloat(p.amount) || 0, p.currency || primaryCurrency)}
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
