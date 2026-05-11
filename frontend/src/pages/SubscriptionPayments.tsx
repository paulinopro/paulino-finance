import React, { useEffect, useState } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { subscriptionClientService, type SubscriptionPaymentItem } from '../services/subscriptionClientService';
import { useTranslation } from 'react-i18next';

const SubscriptionPayments: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { formatDateTimeMedium, formatCurrency: fc, primaryCurrency } = useIntlFormatting();
  const [payments, setPayments] = useState<SubscriptionPaymentItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.isSuperAdmin) {
      setPayments([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    subscriptionClientService
      .getPaymentHistory()
      .then((list) => {
        if (!cancelled) setPayments(list);
      })
      .catch(() => {
        if (!cancelled) setPayments([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.isSuperAdmin]);

  const dash = t('common.emptyDash');
  const fmtDateTime = (iso: string | null | undefined) => {
    if (!iso) return dash;
    return formatDateTimeMedium(iso) || dash;
  };

  const fmtCurrency = (amount: string, currency: string | null | undefined) =>
    fc(parseFloat(amount) || 0, currency || primaryCurrency);

  const paymentStatusLabel = (status: string | null | undefined) => {
    if (!status) return dash;
    const low = String(status).trim().toLowerCase();
    return t(`pages.subscriptionPayments.statusValues.${low}`, { defaultValue: status });
  };

  return (
    <div className="space-y-6 sm:space-y-8 max-w-5xl mx-auto">
      <div className="text-center sm:text-left">
        <h1 className="page-title mb-2">{t('pages.subscriptionPayments.title')}</h1>
        <p className="text-dark-400 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto sm:mx-0">
          {t('pages.subscriptionPayments.subtitle')}
        </p>
      </div>

      {user?.isSuperAdmin ? (
        <div className="rounded-2xl border border-amber-800/40 bg-amber-900/20 p-4 sm:p-5 shadow-lg shadow-black/20 text-amber-100/90 text-sm">
          {t('pages.subscriptionPayments.superAdminNotice')}
        </div>
      ) : (
        <section className="space-y-3" aria-labelledby="subscription-payments-heading">
          <h2 id="subscription-payments-heading" className="flex items-center gap-2 text-lg font-semibold text-white sm:text-xl">
            <Receipt className="h-5 w-5 text-primary-400 shrink-0" aria-hidden />
            {t('pages.subscriptionPayments.sectionTitle')}
          </h2>
          {loading ? (
            <div className="flex justify-center py-10 text-dark-400">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
          ) : payments.length === 0 ? (
            <div className="card-view text-center py-10 text-dark-400 text-sm">{t('pages.subscriptionPayments.emptyState')}</div>
          ) : (
            <div className="card-view overflow-x-auto p-0 sm:p-0">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-dark-600/80 bg-dark-900/50 text-[0.7rem] uppercase tracking-wider text-dark-500">
                    <th className="px-4 py-3 font-medium sm:px-5">{t('pages.subscriptionPayments.colPaidAt')}</th>
                    <th className="px-2 py-3 font-medium">{t('pages.subscriptionPayments.colPlan')}</th>
                    <th className="px-2 py-3 font-medium">{t('pages.subscriptionPayments.colAmount')}</th>
                    <th className="px-2 py-3 font-medium">{t('pages.subscriptionPayments.colBilledPeriod')}</th>
                    <th className="px-4 py-3 font-medium sm:pr-5 text-right">{t('pages.subscriptionPayments.colStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-dark-700/50 last:border-0 text-dark-200">
                      <td className="px-4 py-3 sm:px-5 whitespace-nowrap tabular-nums text-dark-300">
                        {fmtDateTime(payment.paidAt)}
                      </td>
                      <td className="px-2 py-3 text-dark-200">{payment.planName || dash}</td>
                      <td className="px-2 py-3 tabular-nums">{fmtCurrency(payment.amount, payment.currency)}</td>
                      <td className="px-2 py-3 text-xs sm:text-sm text-dark-300">
                        {payment.periodStart || payment.periodEnd ? (
                          <>
                            {fmtDateTime(payment.periodStart)}{' '}
                            <span className="text-dark-600" aria-hidden>
                              {t('pages.subscriptionPayments.periodSeparator')}{' '}
                            </span>
                            {fmtDateTime(payment.periodEnd)}
                          </>
                        ) : (
                          dash
                        )}
                      </td>
                      <td className="px-4 py-3 sm:pr-5 text-right text-xs capitalize text-dark-400">
                        {paymentStatusLabel(payment.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default SubscriptionPayments;
