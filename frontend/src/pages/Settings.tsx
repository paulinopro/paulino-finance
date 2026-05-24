import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { syncPushSubscriptionWithServer } from '../services/pushSubscription';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { User, Bell, DollarSign, Send, Globe, Smartphone } from 'lucide-react';
import {
  CALENDAR_CARD_PAYMENT_AMOUNT_BASIS_OPTIONS,
  DEFAULT_CALENDAR_CARD_PAYMENT_AMOUNT_BASIS,
  type CalendarCardPaymentAmountBasis,
} from '../constants/calendarUserPreferences';
import { SETTINGS_CURRENCY_OPTIONS, SETTINGS_LOCALE_OPTIONS } from '../constants/userPreferences';
import { defaultSecondaryForPrimary, useIntlFormatting } from '../context/IntlFormattingContext';
import { tzI18nKey, pushFailureI18nKey } from '../i18n/config';

const TIMEZONE_IDS = [
  'America/Santo_Domingo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Buenos_Aires',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Dubai',
  'UTC',
] as const;

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const { currencySymbol } = useIntlFormatting();
  const { user, updateUser } = useAuth();
  const [telegramChatId, setTelegramChatId] = useState('');
  const [timezone, setTimezone] = useState('America/Santo_Domingo');
  const [currencyPreference, setCurrencyPreference] = useState('DOP');
  const [secondaryCurrencyPreference, setSecondaryCurrencyPreference] = useState('USD');
  const [localePreference, setLocalePreference] = useState('es');
  const [calendarCardPaymentAmountBasis, setCalendarCardPaymentAmountBasis] =
    useState(DEFAULT_CALENDAR_CARD_PAYMENT_AMOUNT_BASIS);
  const [exchangeRateManualInput, setExchangeRateManualInput] = useState('');
  const [notificationSettings, setNotificationSettings] = useState<any>({});
  const [telegramSaving, setTelegramSaving] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [exchangeSaving, setExchangeSaving] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [pushSyncing, setPushSyncing] = useState(false);
  const [browserNotifPermission, setBrowserNotifPermission] = useState<
    NotificationPermission | 'unsupported'
  >('unsupported');

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setBrowserNotifPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setTelegramChatId(user.telegramChatId || '');
      setTimezone(user.timezone || 'America/Santo_Domingo');
      setCurrencyPreference(user.currencyPreference || 'DOP');
      setSecondaryCurrencyPreference(
        user.secondaryCurrencyPreference || defaultSecondaryForPrimary(user.currencyPreference || 'DOP')
      );
      setLocalePreference(user.localePreference || 'es');
      setCalendarCardPaymentAmountBasis(
        user.calendarCardPaymentAmountBasis ?? DEFAULT_CALENDAR_CARD_PAYMENT_AMOUNT_BASIS
      );
      const manual = user.exchangeRateManual;
      setExchangeRateManualInput(
        manual !== undefined && manual !== null && Number.isFinite(manual) ? String(manual) : ''
      );
    }
    fetchNotificationSettings();
  }, [user]);

  const fetchNotificationSettings = async () => {
    try {
      const response = await api.get('/notifications/settings');
      setNotificationSettings(response.data.settings || {});
    } catch (error: unknown) {
      console.error('Error fetching notification settings:', error);
    }
  };

  const handleSaveTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setTelegramSaving(true);
    try {
      const response = await api.put('/auth/me', {
        telegramChatId,
      });
      updateUser(response.data.user);
      toast.success(t('settings.toastTelegramUpdated'));
    } catch {
      toast.error(t('settings.toastTelegramError'));
    } finally {
      setTelegramSaving(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setPrefsSaving(true);
    try {
      const response = await api.put('/auth/me', {
        timezone,
        currencyPreference,
        secondaryCurrencyPreference,
        localePreference,
        calendarCardPaymentAmountBasis,
      });
      updateUser(response.data.user);
      toast.success(t('settings.toastPrefsSaved'));
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || t('settings.toastPrefsErrorFallback'));
    } finally {
      setPrefsSaving(false);
    }
  };

  const handleSaveExchangeRate = async (e?: React.MouseEvent | React.FormEvent) => {
    e?.preventDefault?.();
    setExchangeSaving(true);
    try {
      const parsed = parseFloat(exchangeRateManualInput);
      const response = await api.put('/auth/me', {
        exchangeRateManual:
          exchangeRateManualInput.trim() === ''
            ? null
            : Number.isFinite(parsed) && parsed > 0
              ? parsed
              : null,
      });
      updateUser(response.data.user);
      toast.success(t('settings.toastExchangeUpdated'));
    } catch {
      toast.error(t('settings.toastExchangeError'));
    } finally {
      setExchangeSaving(false);
    }
  };

  const handleTestNotification = async () => {
    if (!telegramChatId) {
      toast.error(t('settings.toastTelegramTestNeedChatId'));
      return;
    }
    setTestingNotification(true);
    try {
      await api.post('/notifications/test');
      toast.success(t('settings.toastTelegramTestSent'));
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(msg || t('settings.toastTelegramTestErrorFallback'));
    } finally {
      setTestingNotification(false);
    }
  };

  const handleTestPushNotification = async () => {
    if (browserNotifPermission !== 'granted') {
      toast.error(t(pushFailureI18nKey('no-permission')));
      return;
    }
    setTestingPush(true);
    try {
      const pre = await syncPushSubscriptionWithServer();
      if (!pre.ok) {
        toast.error(t(pushFailureI18nKey(pre.reason)));
        return;
      }
      const { data } = await api.post<{ success?: boolean; message?: string }>('/notifications/push/test');
      toast.success(data?.message || t('settings.pushTestFallbackSuccess'));
    } catch (error: unknown) {
      const err = error as {
        response?: { status?: number; data?: { message?: string } };
      };
      const msg = err.response?.data?.message;
      toast.error(msg || t('settings.toastPushTestErrorFallback'));
    } finally {
      setTestingPush(false);
    }
  };

  const handleNotificationSettingsUpdate = async (type: string, settings: any) => {
    try {
      await api.post('/notifications/settings', {
        notificationType: type,
        ...settings,
      });
      toast.success(t('settings.notifUpdatedToast'));
      fetchNotificationSettings();
    } catch {
      toast.error(t('settings.notifUpdatedError'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center sm:text-left">
        <h1 className="page-title mb-2">{t('settings.pageTitle')}</h1>
        <p className="text-dark-400 text-sm sm:text-base max-w-prose mx-auto sm:mx-0">
          {t('settings.introBefore')}
          <Link to="/profile" className="text-primary-400 hover:underline">
            {t('settings.profileAnchor')}
          </Link>
          {t('settings.introAfter')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
          <div className="flex items-center space-x-3 mb-6">
            <User className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-semibold text-white">{t('settings.telegramCardTitle')}</h2>
          </div>
          <form onSubmit={handleSaveTelegram} className="space-y-4">
            <div>
              <label className="label">{t('settings.telegramChatIdLabel')}</label>
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                className="input w-full"
                placeholder="123456789"
              />
              <p className="text-xs text-dark-400 mt-1">{t('settings.telegramHint')}</p>
            </div>
            <button type="submit" disabled={telegramSaving} className="btn-primary w-full">
              {telegramSaving ? t('settings.telegramSaving') : t('settings.telegramSaveIdle')}
            </button>
          </form>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card"
        >
          <div className="flex items-center space-x-3 mb-6">
            <Globe className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-semibold text-white">{t('settings.prefsCardTitle')}</h2>
          </div>
          <form onSubmit={handleSavePreferences} className="space-y-4">
            <div>
              <label className="label">{t('settings.timezoneLabel')}</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="input w-full"
              >
                {TIMEZONE_IDS.map((z) => (
                  <option key={z} value={z}>
                    {t(tzI18nKey(z))}
                  </option>
                ))}
              </select>
              <p className="text-xs text-dark-400 mt-1">{t('settings.timezoneHint')}</p>
            </div>
            <div>
              <label className="label">{t('settings.currencyLabel')}</label>
              <select
                value={currencyPreference}
                onChange={(e) => {
                  const v = e.target.value;
                  setCurrencyPreference(v);
                  setSecondaryCurrencyPreference((prev) =>
                    prev === v ? defaultSecondaryForPrimary(v) : prev
                  );
                }}
                className="input w-full"
              >
                {SETTINGS_CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {t(`currency.${c.code}.label`)} ({currencySymbol(c.code)}) — {t(`currency.${c.code}.hint`)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-dark-400 mt-1">{t('settings.currencyHint')}</p>
            </div>
            <div>
              <label className="label">{t('settings.secondaryCurrencyLabel')}</label>
              <select
                value={secondaryCurrencyPreference}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === currencyPreference) {
                    toast.error(t('settings.secondaryMustDiffer'));
                    return;
                  }
                  setSecondaryCurrencyPreference(v);
                }}
                className="input w-full"
              >
                {SETTINGS_CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {t(`currency.${c.code}.label`)} ({currencySymbol(c.code)}) — {t(`currency.${c.code}.hint`)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-dark-400 mt-1">{t('settings.secondaryCurrencyHint')}</p>
            </div>
            <div>
              <label className="label">{t('settings.localeLabel')}</label>
              <select
                value={localePreference}
                onChange={(e) => setLocalePreference(e.target.value)}
                className="input w-full"
              >
                {SETTINGS_LOCALE_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {t(`settings.localeName.${opt.code}` as const)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-dark-400 mt-1">{t('settings.localeHint')}</p>
            </div>
            <div>
              <label className="label">{t('settings.calendarCardPaymentLabel')}</label>
              <select
                value={calendarCardPaymentAmountBasis}
                onChange={(e) =>
                  setCalendarCardPaymentAmountBasis(e.target.value as CalendarCardPaymentAmountBasis)
                }
                className="input w-full"
              >
                {CALENDAR_CARD_PAYMENT_AMOUNT_BASIS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(`settings.calendarCardPayment.${opt.value}` as const)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-dark-400 mt-1">{t('settings.calendarCardPaymentHint')}</p>
            </div>
            <button type="submit" disabled={prefsSaving} className="btn-primary w-full">
              {prefsSaving ? t('settings.prefsSaving') : t('settings.prefsSaveIdle')}
            </button>
          </form>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card"
        >
          <div className="flex items-center space-x-3 mb-6">
            <DollarSign className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-semibold text-white">{t('settings.exchangeCardTitle')}</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="label">
                {t('settings.exchangeRateLabel', {
                  primary: currencyPreference,
                  secondary: secondaryCurrencyPreference,
                })}
              </label>
              <input
                type="number"
                step="0.01"
                value={exchangeRateManualInput}
                onChange={(e) => setExchangeRateManualInput(e.target.value)}
                className="input w-full"
                placeholder={t('settings.exchangeRatePlaceholder')}
              />
              <p className="text-xs text-dark-400 mt-1">
                {t('settings.exchangeRateHint', {
                  primary: currencyPreference,
                  secondary: secondaryCurrencyPreference,
                })}
              </p>
              {user?.exchangeRateEffective != null && (
                <p className="text-xs text-primary-300 mt-1">
                  {t('settings.exchangeRateEffectiveLine', { rate: user.exchangeRateEffective.toFixed(4) })}
                </p>
              )}
            </div>
            <button type="button" onClick={handleSaveExchangeRate} disabled={exchangeSaving} className="btn-primary w-full">
              {exchangeSaving ? t('settings.exchangeSaving') : t('settings.exchangeSaveIdle')}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="card lg:col-span-3"
        >
          <div className="flex items-center space-x-3 mb-6">
            <Bell className="w-6 h-6 text-primary-400" />
            <h2 className="text-xl font-semibold text-white">{t('settings.notificationsHeading')}</h2>
          </div>
          <div className="space-y-6">
            {['CARD_PAYMENT', 'LOAN_PAYMENT', 'RECURRING_EXPENSE'].map((type) => {
              const settings = notificationSettings[type] || {
                enabled: true,
                telegramEnabled: false,
                daysBefore: [3, 7],
              };
              return (
                <div key={type} className="bg-dark-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-white">
                      {type === 'CARD_PAYMENT' && t('settings.notifTypeCardPayments')}
                      {type === 'LOAN_PAYMENT' && t('settings.notifTypeLoanPayments')}
                      {type === 'RECURRING_EXPENSE' && t('settings.notifTypeRecurringExpense')}
                    </h3>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(e) =>
                          handleNotificationSettingsUpdate(type, { ...settings, enabled: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                    </label>
                  </div>
                  {settings.enabled && (
                    <div className="space-y-3">
                      <div>
                        <label className="label">{t('settings.telegramNotifToggleLabel')}</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.telegramEnabled}
                            onChange={(e) =>
                              handleNotificationSettingsUpdate(type, {
                                ...settings,
                                telegramEnabled: e.target.checked,
                              })
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-dark-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </label>
                      </div>
                      <div>
                        <label className="label">{t('settings.daysBeforeLabel')}</label>
                        <input
                          type="text"
                          value={settings.daysBefore?.join(', ') || '3, 7'}
                          onChange={(e) => {
                            const days = e.target.value
                              .split(',')
                              .map((d) => parseInt(d.trim(), 10))
                              .filter((d) => !isNaN(d));
                            handleNotificationSettingsUpdate(type, { ...settings, daysBefore: days });
                          }}
                          className="input w-full"
                          placeholder={t('settings.daysBeforePlaceholder')}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {browserNotifPermission !== 'unsupported' && (
              <div className="bg-dark-700 rounded-lg p-4">
                <h3 className="font-medium text-white mb-2">{t('settings.browserPushTitle')}</h3>
                <p className="text-dark-400 text-sm mb-3">{t('settings.browserPushDescription')}</p>
                <p className="text-xs text-dark-500 mb-3">
                  {t('settings.browserPushStatusLabel')}{' '}
                  {browserNotifPermission === 'granted'
                    ? t('settings.browserPushStatusGranted')
                    : browserNotifPermission === 'denied'
                      ? t('settings.browserPushStatusDenied')
                      : t('settings.browserPushStatusPending')}
                </p>
                {browserNotifPermission === 'default' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (typeof Notification === 'undefined') return;
                      const p = await Notification.requestPermission();
                      setBrowserNotifPermission(p);
                      if (p === 'granted') {
                        const syncResult = await syncPushSubscriptionWithServer();
                        if (syncResult.ok) {
                          toast.success(t('settings.browserPushSyncOkToast'));
                        } else {
                          toast(t(pushFailureI18nKey(syncResult.reason)), { duration: 7000 });
                        }
                      } else if (p === 'denied') toast.error(t('settings.browserPushDeniedToast'));
                    }}
                    className="btn-secondary w-full"
                  >
                    {t('settings.browserPushAllowBtn')}
                  </button>
                ) : browserNotifPermission === 'granted' ? (
                  <div className="space-y-2">
                    <p className="text-xs text-dark-400 leading-relaxed">{t('settings.browserPushSyncExplain')}</p>
                    <button
                      type="button"
                      onClick={async () => {
                        setPushSyncing(true);
                        try {
                          const syncResult = await syncPushSubscriptionWithServer();
                          if (syncResult.ok) {
                            toast.success(t('settings.browserPushSyncedToast'));
                          } else {
                            toast.error(t(pushFailureI18nKey(syncResult.reason)));
                          }
                        } finally {
                          setPushSyncing(false);
                        }
                      }}
                      disabled={pushSyncing}
                      className="btn-secondary w-full"
                    >
                      {pushSyncing ? t('settings.browserPushSyncSaving') : t('settings.browserPushSyncIdle')}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-dark-400">{t('settings.browserPushBlockedHelp')}</p>
                )}
              </div>
            )}
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4 gap-3">
                <h3 className="font-medium text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5 shrink-0 text-primary-400" aria-hidden />
                  {t('settings.pushTestTitle')}
                </h3>
              </div>
              <p className="text-dark-400 text-sm mb-4">{t('settings.pushTestDescription')}</p>
              <button
                type="button"
                onClick={handleTestPushNotification}
                disabled={testingPush}
                className="btn-secondary w-full flex items-center justify-center space-x-2"
              >
                {testingPush ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></span>
                    <span>{t('settings.pushTestSending')}</span>
                  </>
                ) : (
                  <>
                    <Smartphone size={20} />
                    <span>{t('settings.pushTestIdle')}</span>
                  </>
                )}
              </button>
            </div>

            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-white">{t('settings.telegramTestCardTitle')}</h3>
              </div>
              <p className="text-dark-400 text-sm mb-4">{t('settings.telegramTestDescription')}</p>
              <button
                type="button"
                onClick={handleTestNotification}
                disabled={testingNotification || !telegramChatId}
                className="btn-primary w-full flex items-center justify-center space-x-2"
              >
                {testingNotification ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></span>
                    <span>{t('settings.telegramTestSending')}</span>
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    <span>{t('settings.telegramTestIdle')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Settings;
