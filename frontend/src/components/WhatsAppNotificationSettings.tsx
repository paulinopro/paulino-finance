import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, MessageCircle, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import api from '../services/api';
import type { WhatsAppNotificationConfiguration } from '../types';

type Props = {
  onVerificationChange?: (verified: boolean) => void;
  onConfigurationChange?: (configuration: WhatsAppNotificationConfiguration) => void;
};

const EMPTY_CONFIGURATION: WhatsAppNotificationConfiguration = {
  phone: null, consented: false, verified: false, consentedAt: null, verifiedAt: null,
};

const getRequestErrorMessage = (error: unknown, fallback: string) => {
  const message = (error as any)?.response?.data?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
};

const WhatsAppNotificationSettings: React.FC<Props> = ({ onVerificationChange, onConfigurationChange }) => {
  const { t } = useTranslation();
  const [configuration, setConfiguration] = useState<WhatsAppNotificationConfiguration>(EMPTY_CONFIGURATION);
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const configurationRequestRef = useRef(0);

  const applyConfiguration = useCallback((next: WhatsAppNotificationConfiguration) => {
    setConfiguration(next);
    setPhone(next.phone || '');
    setConsent(next.consented);
    onVerificationChange?.(next.verified);
    onConfigurationChange?.(next);
  }, [onConfigurationChange, onVerificationChange]);

  const invalidateConfigurationRequests = useCallback(() => {
    configurationRequestRef.current += 1;
    setLoading(false);
  }, []);

  const loadConfiguration = useCallback(async (showError = true) => {
    const requestId = ++configurationRequestRef.current;
    setLoading(true);
    try {
      const { data } = await api.get<{ whatsapp: WhatsAppNotificationConfiguration }>('/notifications/whatsapp');
      if (requestId !== configurationRequestRef.current) return false;
      applyConfiguration(data.whatsapp);
      return true;
    } catch {
      if (requestId !== configurationRequestRef.current) return false;
      if (showError) toast.error(t('settings.whatsappLoadError'));
      return false;
    } finally {
      if (requestId === configurationRequestRef.current) setLoading(false);
    }
  }, [applyConfiguration, t]);

  useEffect(() => { void loadConfiguration(); }, [loadConfiguration]);

  const save = async () => {
    invalidateConfigurationRequests();
    setSaving(true);
    try {
      const { data } = await api.put<{ whatsapp: WhatsAppNotificationConfiguration }>(
        '/notifications/whatsapp', { phone: phone.trim(), consent: true }
      );
      applyConfiguration(data.whatsapp);
      toast.success(t('settings.whatsappSaveSuccess'));
    } catch (error) {
      toast.error(getRequestErrorMessage(error, t('settings.whatsappSaveError')));
    } finally { setSaving(false); }
  };

  const testDestination = async () => {
    invalidateConfigurationRequests();
    setTesting(true);
    try {
      await api.post('/notifications/test/whatsapp');
      const refreshed = await loadConfiguration(false);
      if (refreshed) toast.success(t('settings.whatsappTestSuccess'));
      else toast.error(t('settings.whatsappRefreshError'));
    } catch (error) {
      toast.error(getRequestErrorMessage(error, t('settings.whatsappTestError')));
    } finally { setTesting(false); }
  };

  const withdraw = async () => {
    if (!window.confirm(t('settings.whatsappWithdrawConfirm'))) return;
    invalidateConfigurationRequests();
    setSaving(true);
    try {
      const { data } = await api.put<{ whatsapp: WhatsAppNotificationConfiguration }>(
        '/notifications/whatsapp', { phone: null, consent: false }
      );
      applyConfiguration(data.whatsapp);
      toast.success(t('settings.whatsappWithdrawSuccess'));
    } catch {
      toast.error(t('settings.whatsappWithdrawError'));
    } finally { setSaving(false); }
  };

  const status = configuration.verified ? 'verified' : configuration.phone && configuration.consented ? 'pending' : 'unconfigured';
  const phoneChanged = configuration.phone !== null && phone.trim() !== configuration.phone;
  const mutating = saving || testing;
  const canSave = phone.trim().length > 0 && consent && !mutating;
  const canTest = !!configuration.phone && configuration.consented && !phoneChanged && !mutating;

  return (
    <section className="bg-dark-700 rounded-lg p-4 sm:p-5" aria-labelledby="whatsapp-settings-title">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <span className="rounded-full bg-primary-500/10 p-2 text-primary-400" aria-hidden>
            <MessageCircle className="h-5 w-5" />
          </span>
          <div>
            <h3 id="whatsapp-settings-title" className="font-medium text-white">{t('settings.whatsappTitle')}</h3>
            <p className="text-sm text-dark-400 mt-1">{t('settings.whatsappDescription')}</p>
          </div>
        </div>
        <button type="button" onClick={() => void loadConfiguration()} disabled={loading || mutating}
          className="text-dark-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md p-2 disabled:opacity-50"
          aria-label={t('settings.whatsappRefresh')} title={t('settings.whatsappRefresh')}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
        </button>
      </div>

      <div role="status" className={`mb-5 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
        status === 'verified' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' :
          status === 'pending' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' :
            'border-dark-600 bg-dark-800/40 text-dark-300'}`}>
        {status === 'verified' ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> :
          status === 'pending' ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> :
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />}
        <span>{status === 'verified' ? t('settings.whatsappStateVerified') :
          status === 'pending' ? t('settings.whatsappStatePending') : t('settings.whatsappStateUnconfigured')}</span>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="whatsapp-phone" className="label">{t('settings.whatsappPhoneLabel')}</label>
          <input id="whatsapp-phone" type="tel" inputMode="numeric" autoComplete="tel" value={phone}
            onChange={(event) => setPhone(event.target.value)} disabled={mutating} className="input w-full"
            placeholder={t('settings.whatsappPhonePlaceholder')} aria-describedby="whatsapp-phone-hint" />
          <p id="whatsapp-phone-hint" className="text-xs text-dark-400 mt-1.5">{t('settings.whatsappPhoneHint')}</p>
        </div>

        <label className="flex items-start gap-3 text-sm text-dark-300 cursor-pointer">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)}
            disabled={mutating}
            className="mt-0.5 h-4 w-4 rounded border-dark-500 bg-dark-800 text-primary-600 focus:ring-primary-500" />
          <span>{t('settings.whatsappConsent')}</span>
        </label>

        {phoneChanged && configuration.verified && <p className="text-xs text-amber-300">{t('settings.whatsappPhoneChangedHint')}</p>}

        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={save} disabled={!canSave} className="btn-primary flex-1">
            {saving ? t('settings.whatsappSaving') : t('settings.whatsappSaveIdle')}
          </button>
          {configuration.consented && (
            <button type="button" onClick={testDestination} disabled={!canTest} className="btn-secondary flex-1">
              {testing ? t('settings.whatsappTesting') : t('settings.whatsappTestIdle')}
            </button>
          )}
        </div>

        {configuration.consented && (
          <button type="button" onClick={withdraw} disabled={mutating}
            className="text-sm text-red-300 hover:text-red-200 underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded-sm disabled:opacity-50">
            {t('settings.whatsappWithdraw')}
          </button>
        )}
      </div>
    </section>
  );
};

export default WhatsAppNotificationSettings;
