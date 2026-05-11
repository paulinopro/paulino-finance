import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Stethoscope, Database, Clock, Server, ListTree, AlertTriangle, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  adminService,
  type AdminHealth,
  type AdminDataQuality,
  type AdminNotificationScheduler,
} from '../services/adminService';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';
import { useTranslation } from 'react-i18next';

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24);
  return `~${d} d`;
}

const AdminStatus: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<AdminHealth | null>(null);
  const [dq, setDq] = useState<AdminDataQuality | null>(null);
  const [sched, setSched] = useState<AdminNotificationScheduler | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setDq(null);
    setSched(null);
    const results = await Promise.allSettled([
      adminService.getHealth(),
      adminService.getSubscriptionDataQuality(),
      adminService.getNotificationScheduler(),
    ]);
    const hRes = results[0] as PromiseSettledResult<AdminHealth>;
    const qRes = results[1] as PromiseSettledResult<AdminDataQuality>;
    if (hRes.status === 'fulfilled') {
      setData(hRes.value);
    } else {
      const e = hRes.reason as { response?: { data?: AdminHealth; status?: number } };
      if (e.response?.status === 503) {
        const d = (e.response?.data || {}) as Partial<AdminHealth>;
        setData({
          ok: false,
          database: 'down',
          serverTime: d.serverTime ?? new Date().toISOString(),
          uptimeSec: d.uptimeSec ?? 0,
          checkLatencyMs: d.checkLatencyMs,
          nodeVersion: d.nodeVersion,
          memoryRssMb: d.memoryRssMb,
          nodeEnv: d.nodeEnv,
          deployRef: d.deployRef,
        });
      } else {
        toast.error(t('toast.adminStatus.healthError'));
        setData(null);
      }
    }
    if (qRes.status === 'fulfilled') {
      setDq(qRes.value);
    } else {
      setDq(null);
      toast.error(t('toast.adminStatus.countsError'));
    }
    const sRes = results[2] as PromiseSettledResult<AdminNotificationScheduler>;
    if (sRes.status === 'fulfilled') {
      setSched(sRes.value);
    } else {
      setSched(null);
      toast.error(t('toast.adminStatus.schedulerError'));
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <AdminBreadcrumbs />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-primary-600/20 text-primary-400">
              <Stethoscope className="w-8 h-8" />
            </div>
            <div>
              <h1 className="page-title">{t('pages.adminStatus.title')}</h1>
              <p className="text-dark-400 text-sm">{t('pages.adminStatus.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('pages.adminStatus.refresh')}
          </button>
        </div>

        <div className="card p-6 space-y-4">
          {loading ? (
            <p className="text-dark-500">{t('common.actions.loading')}</p>
          ) : !data ? (
            <p className="text-dark-500">{t('pages.adminStatus.noHealthData')}</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-sky-400 shrink-0" />
                <div>
                  <p className="text-dark-500 text-sm">{t('pages.adminStatus.database')}</p>
                  <p
                    className={`font-medium ${
                      data.database === 'up' && data.ok ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {data.database === 'up' && data.ok ? t('pages.adminStatus.dbUp') : t('pages.adminStatus.dbDown')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-dark-400 shrink-0" />
                <div>
                  <p className="text-dark-500 text-sm">{t('pages.adminStatus.serverTime')}</p>
                  <p className="text-white font-mono text-sm break-all">{data.serverTime}</p>
                </div>
              </div>
              <div>
                <p className="text-dark-500 text-sm">{t('pages.adminStatus.apiUptime')}</p>
                <p className="text-white">{formatUptime(data.uptimeSec)}</p>
              </div>
              {data.checkLatencyMs != null && (
                <p className="text-dark-500 text-xs">
                  {t('pages.adminStatus.dbLatency', { ms: data.checkLatencyMs })}
                </p>
              )}
              {(data.nodeVersion != null || data.memoryRssMb != null || data.nodeEnv != null) && (
                <div className="flex items-start gap-3 pt-2 border-t border-dark-700">
                  <Server className="w-5 h-5 text-violet-400/90 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-sm">
                    <p className="text-dark-500">{t('pages.adminStatus.nodeProcess')}</p>
                    {data.nodeVersion != null && (
                      <p className="text-dark-200">
                        <span className="text-dark-500">{t('pages.adminStatus.runtime')}</span> {data.nodeVersion}
                      </p>
                    )}
                    {data.nodeEnv != null && (
                      <p className="text-dark-200">
                        <span className="text-dark-500">{t('pages.adminStatus.nodeEnv')}</span>{' '}
                        <span className="font-mono text-xs">{data.nodeEnv}</span>
                      </p>
                    )}
                    {data.memoryRssMb != null && (
                      <p className="text-dark-200">
                        <span className="text-dark-500">{t('pages.adminStatus.memoryRss')}</span> {data.memoryRssMb}{' '}
                        MB
                      </p>
                    )}
                    {data.deployRef != null && data.deployRef !== '' && (
                      <p className="text-dark-200">
                        <span className="text-dark-500">{t('pages.adminStatus.deploy')}</span>{' '}
                        <span className="font-mono text-xs">{data.deployRef}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {sched != null && (
          <div className="card p-6 space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <Bell className="w-5 h-5 text-sky-400/90 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-medium text-white">{t('pages.adminStatus.notificationScheduler')}</h2>
                <p className="text-dark-500 text-sm mt-0.5">{t('pages.adminStatus.schedulerIntro')}</p>
              </div>
            </div>

            {!sched.dailyJobActive && (
              <div className="flex items-start gap-2 rounded-lg bg-red-900/25 border border-red-800/40 px-3 py-2 text-red-100/90 text-sm">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {!sched.expressionValid
                    ? t('pages.adminStatus.cronInvalid')
                    : !sched.schedulerRegistered
                      ? t('pages.adminStatus.schedulerMissing')
                      : t('pages.adminStatus.cronIncomplete')}
                </span>
              </div>
            )}

            <ul className="text-sm text-dark-200 space-y-2 font-mono">
              <li>
                <span className="text-dark-500">{t('pages.adminStatus.expression')}</span>{' '}
                <span className="text-emerald-300/90">{sched.cronExpression}</span>{' '}
                <span
                  className={
                    sched.expressionValid
                      ? 'text-emerald-400 text-xs uppercase'
                      : 'text-red-400 text-xs uppercase'
                  }
                >
                  (
                  {sched.expressionValid ? t('pages.adminStatus.valid') : t('pages.adminStatus.invalid')})
                </span>
              </li>
              <li>
                <span className="text-dark-500">{t('pages.adminStatus.jobRegistered')}</span>{' '}
                {sched.schedulerRegistered ? (
                  <span className="text-emerald-400">{t('pages.adminStatus.yes')}</span>
                ) : (
                  <span className="text-red-400">{t('pages.adminStatus.no')}</span>
                )}
              </li>
              {sched.schedulerConfiguredAt != null && (
                <li>
                  <span className="text-dark-500">{t('pages.adminStatus.configuredIso')}</span>{' '}
                  {sched.schedulerConfiguredAt}
                </li>
              )}
              <li>
                <span className="text-dark-500">{t('pages.adminStatus.tzProcess')}</span>{' '}
                {sched.timezone != null ? (
                  <span>{sched.timezone}</span>
                ) : (
                  <span className="text-dark-400">{t('pages.adminStatus.noTzHint')}</span>
                )}
              </li>
              <li className="text-dark-400 text-xs font-sans whitespace-normal">{sched.cronTimeNoteEs}</li>
              {sched.lastSweep != null && (
                <li className="pt-1 border-t border-dark-700 space-y-1">
                  <p className="text-dark-500 font-sans font-normal">{t('pages.adminStatus.lastSweepTitle')}</p>
                  <span className="text-dark-500">{t('pages.adminStatus.from')}</span> {sched.lastSweep.startedAt}
                  <br />
                  <span className="text-dark-500">{t('pages.adminStatus.to')}</span> {sched.lastSweep.finishedAt}
                  <br />
                  <span className="text-dark-500">{t('pages.adminStatus.result')}</span>{' '}
                  {sched.lastSweep.ok ? (
                    <span className="text-emerald-400">{t('pages.adminStatus.ok')}</span>
                  ) : (
                    <span className="text-red-400 font-sans whitespace-normal">
                      {t('pages.adminStatus.errorPrefix')}
                      {sched.lastSweep.errorMessage ? `: ${sched.lastSweep.errorMessage}` : ''}
                    </span>
                  )}
                </li>
              )}
            </ul>

            <p className="text-xs text-dark-500 font-sans">{t('pages.adminStatus.deploySweepNote')}</p>
          </div>
        )}

        {dq && (
          <div className="card p-6 space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <ListTree className="w-5 h-5 text-amber-400/90 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 className="text-base font-medium text-white">{t('pages.adminStatus.dataQuality')}</h2>
                <p className="text-dark-500 text-sm mt-0.5">
                  {t('pages.adminStatus.dataQualityIntro')}{' '}
                  <code className="text-dark-300 text-xs">docs/scripts/backfill_subscription_payment_periods.sql</code>
                </p>
              </div>
            </div>
            {dq.totalPayments > 0 &&
              (dq.paymentsBothPeriodNull > 0 ||
                dq.paymentsNullPeriodStart > 0 ||
                dq.paymentsNullPeriodEnd > 0 ||
                dq.activeSubscriptionsIncompleteWindow > 0) && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-900/20 border border-amber-800/40 px-3 py-2 text-amber-100/90 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{t('pages.adminStatus.periodFieldsWarning')}</span>
                </div>
              )}
            <ul className="text-sm text-dark-200 space-y-1.5 font-mono">
              <li>
                <span className="text-dark-500">{t('pages.adminStatus.totalCharges')}</span> {dq.totalPayments}
              </li>
              <li>
                <span className="text-dark-500">{t('pages.adminStatus.periodStartNull')}</span>{' '}
                {dq.paymentsNullPeriodStart}
              </li>
              <li>
                <span className="text-dark-500">{t('pages.adminStatus.periodEndNull')}</span>{' '}
                {dq.paymentsNullPeriodEnd}
              </li>
              <li>
                <span className="text-dark-500">{t('pages.adminStatus.bothNull')}</span> {dq.paymentsBothPeriodNull}
              </li>
              <li>
                <span className="text-dark-500">{t('pages.adminStatus.activeTrialIncompleteWindow')}</span>{' '}
                {dq.activeSubscriptionsIncompleteWindow}
              </li>
            </ul>
          </div>
        )}

        <p className="text-dark-500 text-xs mt-4">{t('pages.adminStatus.footerNotApm')}</p>
      </motion.div>
    </div>
  );
};

export default AdminStatus;
