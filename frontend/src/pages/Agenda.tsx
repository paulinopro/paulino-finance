import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AlertCircle, CalendarRange, Check, Link2, Loader2, Plug, Plus, Trash2, Calendar as CalendarGlyph } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import PageHeader from '../components/PageHeader';

type AgendaKind = 'EVENT' | 'TASK' | 'REMINDER' | 'APPOINTMENT' | 'NOTE';

interface AgendaConnDto {
  id: number;
  provider: string;
  status: string;
  accountLabel?: string;
  lastError?: string;
  externalDefaultCalendarId?: string;
}

function syncEngineAvailable(
  syncEngines: { provider?: string; available?: boolean }[] | undefined,
  provider: string
): boolean {
  if (!Array.isArray(syncEngines)) return false;
  return Boolean(syncEngines.find((x) => x.provider === provider)?.available);
}

function pickGoogleAvailability(syncEngines?: { provider?: string; available?: boolean }[]): boolean {
  return syncEngineAvailable(syncEngines, 'GOOGLE_CALENDAR');
}

function pickICloudAvailability(syncEngines?: { provider?: string; available?: boolean }[]): boolean {
  return syncEngineAvailable(syncEngines, 'ICLOUD_CALDAV');
}

type OutboundPushHint = 'none' | 'ok' | 'err';

interface AgendaOutboundSyncHintsDto {
  google: OutboundPushHint;
  icloud: OutboundPushHint;
}

interface AgendaItemDto {
  id: number;
  kind: AgendaKind;
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  status: string;
  syncToExternal: boolean;
  outboundSync?: AgendaOutboundSyncHintsDto;
}

function startOfMonthIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).toISOString();
}

function endOfMonthIso(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
}

/** Value for input[type=datetime-local] in local time (no TZ suffix). */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Build ISO from datetime-local assuming local interpretation. */
function fromDatetimeLocalValue(v: string): string {
  return new Date(v).toISOString();
}

interface GoogleWritableCalDto {
  id: string;
  summary: string;
  primary: boolean;
}

function AgendaOutboundSyncRowChips(props: {
  t: (key: string) => string;
  syncToExternal: boolean;
  googleOnline: boolean;
  icloudOnline: boolean;
  outbound?: AgendaOutboundSyncHintsDto;
}) {
  const { t, syncToExternal, googleOnline, icloudOnline, outbound } = props;

  if (!syncToExternal) {
    return (
      <span className="inline-flex rounded-md bg-dark-800/55 px-1.5 py-0.5 text-[10px] font-medium text-dark-500 ring-1 ring-white/[0.04]">
        {t('pages.agenda.syncLocalOnlyBadge')}
      </span>
    );
  }

  const anyProv = googleOnline || icloudOnline;
  if (!anyProv) {
    return (
      <span className="inline-flex rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200/95 ring-1 ring-amber-500/25">
        {t('pages.agenda.syncOutboundNoProviders')}
      </span>
    );
  }

  const rows: React.ReactNode[] = [];

  const renderOne = (
    providerKey: 'google' | 'icloud',
    label: string,
    online: boolean,
    hintRaw: OutboundPushHint | undefined,
    labels: { ok: string; err: string; pending: string }
  ) => {
    if (!online) return;
    const hint = hintRaw ?? 'none';
    const palette =
      hint === 'ok'
        ? 'bg-emerald-500/14 text-emerald-200 ring-emerald-500/25'
        : hint === 'err'
          ? 'bg-red-500/14 text-red-200 ring-red-500/26'
          : 'bg-dark-900/90 text-dark-300 ring-dark-600/45';
    const aria =
      hint === 'ok' ? labels.ok : hint === 'err' ? labels.err : labels.pending;
    const Ico =
      hint === 'ok'
        ? Check
        : hint === 'err'
          ? AlertCircle
          : Loader2;

    rows.push(
      <span
        key={`sync-${providerKey}`}
        role="status"
        className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${palette}`}
        title={aria}
        aria-label={aria}
      >
        <Ico className={`h-3 w-3 shrink-0 opacity-95 ${hint === 'none' ? 'animate-spin' : ''}`} aria-hidden />
        <span>{label}</span>
      </span>
    );
  };

  renderOne(
    'google',
    'Google',
    googleOnline,
    outbound?.google,
    {
      ok: t('pages.agenda.syncOutboundGoogleAriaOk'),
      err: t('pages.agenda.syncOutboundGoogleAriaErr'),
      pending: t('pages.agenda.syncOutboundGoogleAriaPending'),
    }
  );
  renderOne(
    'icloud',
    'iCloud',
    icloudOnline,
    outbound?.icloud,
    {
      ok: t('pages.agenda.syncOutboundICloudAriaOk'),
      err: t('pages.agenda.syncOutboundICloudAriaErr'),
      pending: t('pages.agenda.syncOutboundICloudAriaPending'),
    }
  );

  return <div className="mt-1 flex flex-wrap items-center gap-1">{rows}</div>;
}

const Agenda: React.FC = () => {
  const { t } = useTranslation();
  const anchor = useMemo(() => new Date(), []);
  const range = useMemo(
    () => ({ from: startOfMonthIso(anchor), to: endOfMonthIso(anchor) }),
    [anchor]
  );

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [items, setItems] = useState<AgendaItemDto[]>([]);
  const [connections, setConnections] = useState<AgendaConnDto[]>([]);
  const [googleAvailable, setGoogleAvailable] = useState(false);
  const [googleAuthBusy, setGoogleAuthBusy] = useState(false);
  const [googleWritableCals, setGoogleWritableCals] = useState<GoogleWritableCalDto[]>([]);
  const [googleCalLoading, setGoogleCalLoading] = useState(false);
  const [googleCalSaving, setGoogleCalSaving] = useState(false);
  const [googleCalSel, setGoogleCalSel] = useState('primary');
  const [icloudAvailable, setIcloudAvailable] = useState(false);
  const [icloudBusy, setIcloudBusy] = useState(false);
  const [icloudWritableCals, setIcloudWritableCals] = useState<GoogleWritableCalDto[]>([]);
  const [icloudCalLoading, setIcloudCalLoading] = useState(false);
  const [icloudCalSaving, setIcloudCalSaving] = useState(false);
  const [icloudCalSel, setIcloudCalSel] = useState('');
  const [icloudAppleId, setIcloudAppleId] = useState('');
  const [icloudAppPassword, setIcloudAppPassword] = useState('');
  const [icloudShowCredentialForm, setIcloudShowCredentialForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const kindOptions = useMemo(() => ['EVENT', 'TASK', 'REMINDER', 'APPOINTMENT', 'NOTE'] as AgendaKind[], []);

  const googleConn = useMemo(
    () => connections.find((c) => c.provider === 'GOOGLE_CALENDAR'),
    [connections]
  );

  const icloudConn = useMemo(
    () => connections.find((c) => c.provider === 'ICLOUD_CALDAV'),
    [connections]
  );

  const [formKind, setFormKind] = useState<AgendaKind>('EVENT');
  const [formTitle, setFormTitle] = useState('');
  const [formStarts, setFormStarts] = useState(() => toDatetimeLocalValue(new Date().toISOString()));

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, connRes] = await Promise.all([
        api.get('/agenda/items', {
          params: { from: range.from, to: range.to },
        }),
        api.get('/agenda/connections'),
      ]);
      setItems(itemsRes.data.items || []);
      const conns = (connRes.data.connections || []) as AgendaConnDto[];
      setConnections(conns);
      setGoogleAvailable(pickGoogleAvailability(connRes.data.syncEngines));
      setIcloudAvailable(pickICloudAvailability(connRes.data.syncEngines));
    } catch (e: unknown) {
      toast.error(t('pages.agenda.toast.loadError'));
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, t]);

  useEffect(() => {
    const g = searchParams.get('google');
    if (!g) return;
    const msgs: Record<string, string> = {
      connected: t('pages.agenda.oauth.toast.connected'),
      cancel: t('pages.agenda.oauth.toast.cancel'),
      state_invalid: t('pages.agenda.oauth.toast.stateInvalid'),
      not_configured: t('pages.agenda.oauth.toast.notConfigured'),
      error: t('pages.agenda.oauth.toast.error'),
    };
    if (g === 'connected') toast.success(msgs.connected);
    else if (msgs[g]) toast.error(msgs[g]);
    navigate('/agenda', { replace: true });
  }, [navigate, searchParams, t]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleConnectGoogle = async () => {
    if (!googleAvailable) return;
    setGoogleAuthBusy(true);
    try {
      const res = await api.get<{ authorizationUrl?: string }>('/agenda/connect/google/start');
      const url = res.data?.authorizationUrl;
      if (typeof url !== 'string' || !url) {
        toast.error(t('pages.agenda.oauth.toast.badStart'));
        return;
      }
      window.location.assign(url);
    } catch {
      toast.error(t('pages.agenda.oauth.toast.startDenied'));
    } finally {
      setGoogleAuthBusy(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!googleConn) return;
    if (!globalThis.confirm(t('pages.agenda.oauth.confirmDisconnectGoogle'))) return;
    setGoogleAuthBusy(true);
    try {
      await api.delete('/agenda/connect/google');
      toast.success(t('pages.agenda.oauth.toast.disconnected'));
      await fetchAll();
    } catch {
      toast.error(t('pages.agenda.oauth.toast.disconnectFail'));
    } finally {
      setGoogleAuthBusy(false);
    }
  };

  const calendarPickOptions = useMemo(() => {
    const primaryRow = googleWritableCals.find((c) => c.primary);
    const nonPrimary = googleWritableCals.filter((c) => !c.primary);
    const opts: GoogleWritableCalDto[] = [
      {
        id: 'primary',
        summary: primaryRow?.summary ?? 'primary',
        primary: true,
      },
      ...nonPrimary,
    ];
    if (googleCalSel && googleCalSel !== 'primary' && !opts.some((o) => o.id === googleCalSel)) {
      opts.push({ id: googleCalSel, summary: googleCalSel, primary: false });
    }
    return opts;
  }, [googleWritableCals, googleCalSel]);

  useEffect(() => {
    if (!googleConn || googleConn.status !== 'CONNECTED') {
      setGoogleWritableCals([]);
      setGoogleCalSel('primary');
      return;
    }

    const rawStored = googleConn.externalDefaultCalendarId?.trim() || 'primary';

    let cancelled = false;
    const run = async () => {
      setGoogleCalLoading(true);
      try {
        const res = await api.get<{ calendars?: GoogleWritableCalDto[] }>('/agenda/connect/google/calendars');
        if (cancelled) return;
        const calendars = res.data.calendars ?? [];
        setGoogleWritableCals(calendars);

        const primaryId = calendars.find((c) => c.primary)?.id;
        let normalized = rawStored === '' ? 'primary' : rawStored;
        if (normalized !== 'primary' && primaryId && normalized === primaryId) normalized = 'primary';
        setGoogleCalSel(normalized);
      } catch {
        if (!cancelled) {
          setGoogleWritableCals([]);
          toast.error(t('pages.agenda.oauth.toast.calendarListFail'));
          setGoogleCalSel(rawStored === '' ? 'primary' : rawStored);
        }
      } finally {
        if (!cancelled) setGoogleCalLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [googleConn?.id, googleConn?.status, googleConn?.externalDefaultCalendarId, t]);

  const googleStoredCalId = googleConn?.externalDefaultCalendarId?.trim() || 'primary';
  const normalizedGoogleStored = useMemo(() => {
    const raw = googleStoredCalId.trim() === '' ? 'primary' : googleStoredCalId.trim();
    const primaryId = googleWritableCals.find((c) => c.primary)?.id;
    if (raw !== 'primary' && primaryId && raw === primaryId) return 'primary';
    return raw;
  }, [googleStoredCalId, googleWritableCals]);

  const googleCalDirty =
    !!googleConn &&
    googleConn.status === 'CONNECTED' &&
    googleCalSel !== normalizedGoogleStored;

  const handleSaveGoogleCalendarTarget = async () => {
    if (!googleConn || googleConn.status !== 'CONNECTED' || googleCalSaving) return;
    setGoogleCalSaving(true);
    try {
      await api.patch('/agenda/connect/google', { calendarId: googleCalSel });
      toast.success(t('pages.agenda.oauth.toast.calendarSaved'));
      await fetchAll();
    } catch {
      toast.error(t('pages.agenda.oauth.toast.calendarSaveFail'));
    } finally {
      setGoogleCalSaving(false);
    }
  };

  const icloudPickOptions = useMemo(() => {
    const opts = [...icloudWritableCals];
    if (icloudCalSel && !opts.some((o) => o.id === icloudCalSel)) {
      opts.push({
        id: icloudCalSel,
        summary: icloudCalSel.slice(0, 80),
        primary: false,
      });
    }
    return opts;
  }, [icloudWritableCals, icloudCalSel]);

  useEffect(() => {
    if (!icloudConn || icloudConn.status !== 'CONNECTED') {
      setIcloudWritableCals([]);
      setIcloudCalSel('');
      return;
    }

    const rawStored = icloudConn.externalDefaultCalendarId?.trim() || '';

    let cancelled = false;
    const run = async () => {
      setIcloudCalLoading(true);
      try {
        const res = await api.get<{ calendars?: GoogleWritableCalDto[] }>(
          '/agenda/connect/icloud/calendars'
        );
        if (cancelled) return;
        const calendars = res.data.calendars ?? [];
        setIcloudWritableCals(calendars);
        const pick =
          (rawStored ? calendars.find((c) => c.id === rawStored) : undefined) ??
          calendars.find((c) => c.primary) ??
          calendars[0];
        setIcloudCalSel(pick ? pick.id : rawStored);
      } catch {
        if (!cancelled) {
          setIcloudWritableCals([]);
          toast.error(t('pages.agenda.icloud.toast.calendarListFail'));
          setIcloudCalSel(rawStored);
        }
      } finally {
        if (!cancelled) setIcloudCalLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    icloudConn?.id,
    icloudConn?.status,
    icloudConn?.externalDefaultCalendarId,
    t,
  ]);

  const icloudStoredTarget = icloudConn?.externalDefaultCalendarId?.trim() || '';
  const icloudCalDirty =
    !!icloudConn && icloudConn.status === 'CONNECTED' && icloudCalSel !== icloudStoredTarget;

  const handleDisconnectICloud = async () => {
    if (!icloudConn) return;
    if (!globalThis.confirm(t('pages.agenda.icloud.confirmDisconnect'))) return;
    setIcloudBusy(true);
    try {
      await api.delete('/agenda/connect/icloud');
      toast.success(t('pages.agenda.icloud.toast.disconnected'));
      setIcloudAppleId('');
      setIcloudAppPassword('');
      setIcloudShowCredentialForm(false);
      await fetchAll();
    } catch {
      toast.error(t('pages.agenda.icloud.toast.disconnectFail'));
    } finally {
      setIcloudBusy(false);
    }
  };

  const icloudCredentialOpen =
    icloudAvailable &&
    (!icloudConn ||
      icloudConn.status === 'ERROR' ||
      (icloudConn.status === 'CONNECTED' && icloudShowCredentialForm));

  const handleSubmitICloud = async () => {
    const emailFinal =
      icloudConn?.status === 'ERROR'
        ? icloudConn.accountLabel?.trim() || icloudAppleId.trim()
        : icloudAppleId.trim();
    const pw = icloudAppPassword.trim();
    if (!icloudAvailable || !emailFinal || !pw) {
      toast.error(t('pages.agenda.icloud.toast.needAppleIdPassword'));
      return;
    }
    setIcloudBusy(true);
    try {
      await api.post('/agenda/connect/icloud', {
        appleId: emailFinal,
        appPassword: pw,
      });
      toast.success(t('pages.agenda.icloud.toast.connected'));
      setIcloudAppPassword('');
      setIcloudShowCredentialForm(false);
      await fetchAll();
    } catch {
      toast.error(t('pages.agenda.icloud.toast.connectFail'));
      await fetchAll();
    } finally {
      setIcloudBusy(false);
    }
  };

  const handleSaveICloudCalendarTarget = async () => {
    if (!icloudConn || icloudConn.status !== 'CONNECTED' || icloudCalSaving) return;
    setIcloudCalSaving(true);
    try {
      await api.patch('/agenda/connect/icloud', { calendarId: icloudCalSel });
      toast.success(t('pages.agenda.icloud.toast.calendarSaved'));
      await fetchAll();
    } catch {
      toast.error(t('pages.agenda.icloud.toast.calendarSaveFail'));
    } finally {
      setIcloudCalSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error(t('pages.agenda.toast.titleRequired'));
      return;
    }
    setCreating(true);
    try {
      await api.post('/agenda/items', {
        kind: formKind,
        title: formTitle.trim(),
        startsAt: fromDatetimeLocalValue(formStarts),
        allDay: false,
        syncToExternal: true,
      });
      toast.success(t('pages.agenda.toast.created'));
      setFormTitle('');
      await fetchAll();
    } catch (err: unknown) {
      toast.error(t('pages.agenda.toast.createError'));
      console.error(err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!globalThis.confirm(t('pages.agenda.confirmDelete'))) return;
    try {
      await api.delete(`/agenda/items/${id}`);
      toast.success(t('pages.agenda.toast.deleted'));
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (err: unknown) {
      toast.error(t('pages.agenda.toast.deleteError'));
      console.error(err);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="max-w-[1200px] mx-auto space-y-8 px-1 sm:px-0 pb-28 md:pb-10">
        <PageHeader
          title={t('pages.agenda.title')}
          subtitle={t('pages.agenda.subtitle')}
          actions={
            <Link
              to="/calendar"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-dark-600 bg-dark-800/60 px-4 py-2 text-sm font-medium text-dark-100 ring-1 ring-white/[0.04] hover:bg-dark-700/80 transition-colors"
            >
              <CalendarGlyph className="h-4 w-4 shrink-0 text-primary-400" aria-hidden />
              {t('pages.agenda.linkFinancialCalendar')}
            </Link>
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <section
            className="rounded-xl border border-dark-600/50 bg-dark-800/40 p-4 sm:p-5 ring-1 ring-white/[0.04] space-y-4"
            aria-labelledby="agenda-sync-heading"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-500/15 text-primary-300">
                <Link2 className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 space-y-1">
                <h2 id="agenda-sync-heading" className="text-base font-semibold text-dark-100">
                  {t('pages.agenda.syncCardTitle')}
                </h2>
                <p className="text-sm text-dark-400 leading-relaxed">{t('pages.agenda.syncCardBody')}</p>
              </div>
            </div>
            <ul className="space-y-2 text-sm">
              <li className="rounded-lg border border-dark-600/40 bg-dark-900/35 px-3 py-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-dark-200">{t('pages.agenda.providers.googleCalendar')}</p>
                    {!googleConn && googleAvailable && (
                      <p className="text-[11px] text-dark-500 mt-1">{t('pages.agenda.googlePushHint')}</p>
                    )}
                    {googleConn?.accountLabel && (
                      <p className="text-xs text-dark-400 truncate mt-0.5">{googleConn.accountLabel}</p>
                    )}
                    {googleConn?.lastError && (
                      <p className="text-[11px] text-red-400/90 mt-1 break-words">{googleConn.lastError}</p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                    {!googleAvailable ? (
                      <span className="rounded-md bg-dark-700/90 px-2 py-0.5 text-[11px] uppercase tracking-wide text-dark-400">
                        {t('pages.agenda.badgeSoon')}
                      </span>
                    ) : googleConn?.status === 'CONNECTED' ? (
                      <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                        {t('pages.agenda.oauth.statusConnected')}
                      </span>
                    ) : googleConn ? (
                      <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                        {googleConn.status}
                      </span>
                    ) : null}
                  </div>
                </div>
                {googleAvailable && (
                  <div className="w-full space-y-3 pt-1">
                    <div className="flex flex-wrap gap-2">
                      {(!googleConn || googleConn.status !== 'CONNECTED') && (
                        <button
                          type="button"
                          onClick={() => void handleConnectGoogle()}
                          disabled={googleAuthBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                        >
                          <Plug className="h-3.5 w-3.5" aria-hidden />
                          {t('pages.agenda.oauth.connect')}
                        </button>
                      )}
                      {googleConn && (
                        <button
                          type="button"
                          onClick={() => void handleDisconnectGoogle()}
                          disabled={googleAuthBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dark-600 bg-dark-800/70 hover:bg-dark-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-dark-200 transition-colors"
                        >
                          {t('pages.agenda.oauth.disconnect')}
                        </button>
                      )}
                    </div>
                    {googleConn?.status === 'CONNECTED' && (
                      <div className="space-y-2 rounded-lg border border-dark-600/35 bg-dark-950/45 px-3 py-2.5">
                        <label className="block text-xs font-semibold uppercase tracking-wide text-dark-400" htmlFor="agenda-google-calendar-target">
                          {t('pages.agenda.oauth.calendarTarget')}
                        </label>
                        <p className="text-[11px] leading-relaxed text-dark-500">{t('pages.agenda.oauth.calendarHint')}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          {googleCalLoading ? (
                            <span className="text-[11px] text-dark-500">{t('pages.agenda.oauth.loadingCalendars')}</span>
                          ) : null}
                          <select
                            id="agenda-google-calendar-target"
                            className="max-w-[min(100%,20rem)] flex-1 rounded-md border border-dark-600 bg-dark-900 px-2 py-1.5 text-xs text-dark-100 outline-none focus:border-emerald-500/60 disabled:opacity-55"
                            value={googleCalSel}
                            onChange={(e) => setGoogleCalSel(e.target.value)}
                            disabled={googleCalLoading || googleCalSaving || googleAuthBusy}
                            aria-busy={googleCalLoading}
                          >
                            {calendarPickOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.summary}
                                {c.primary ? ` (${t('pages.agenda.oauth.primaryCalendarTag')})` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void handleSaveGoogleCalendarTarget()}
                            disabled={
                              !googleCalDirty || googleCalLoading || googleCalSaving || googleAuthBusy
                            }
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                          >
                            {googleCalSaving ? t('pages.agenda.oauth.savingCalendar') : t('pages.agenda.oauth.saveCalendar')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
              <li className="rounded-lg border border-dark-600/40 bg-dark-900/35 px-3 py-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-dark-200">{t('pages.agenda.providers.icloudCalendar')}</p>
                    {icloudAvailable && (!icloudConn || icloudConn.status === 'ERROR') ? (
                      <p className="text-[11px] text-dark-500 mt-1">{t('pages.agenda.icloudConnectHint')}</p>
                    ) : null}
                    {icloudConn?.accountLabel && (
                      <p className="text-xs text-dark-400 truncate mt-0.5">{icloudConn.accountLabel}</p>
                    )}
                    {icloudConn?.lastError && (
                      <p className="text-[11px] text-red-400/90 mt-1 break-words">{icloudConn.lastError}</p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
                    {!icloudAvailable ? (
                      <span className="rounded-md bg-dark-700/90 px-2 py-0.5 text-[11px] uppercase tracking-wide text-dark-400">
                        {t('pages.agenda.badgeSoon')}
                      </span>
                    ) : icloudConn?.status === 'CONNECTED' ? (
                      <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                        {t('pages.agenda.icloud.statusConnected')}
                      </span>
                    ) : icloudConn ? (
                      <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
                        {icloudConn.status}
                      </span>
                    ) : null}
                  </div>
                </div>

                {icloudAvailable && (
                  <div className="w-full space-y-3 pt-1">
                    {icloudCredentialOpen && (
                      <form
                        className="space-y-2 rounded-lg border border-dark-600/35 bg-dark-950/45 px-3 py-2.5"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleSubmitICloud();
                        }}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-dark-400">
                          {t('pages.agenda.icloud.credentialPanelTitle')}
                        </p>
                        {icloudConn?.status !== 'ERROR' ? (
                          <label className="block space-y-1">
                            <span className="text-[11px] text-dark-500">{t('pages.agenda.icloud.appleId')}</span>
                            <input
                              type="email"
                              autoComplete="username"
                              value={icloudAppleId}
                              onChange={(e) => setIcloudAppleId(e.target.value)}
                              placeholder={t('pages.agenda.icloud.appleIdPlaceholder')}
                              disabled={icloudBusy}
                              required
                              className="w-full rounded-md border border-dark-600 bg-dark-900 px-2 py-1.5 text-xs text-dark-100 outline-none focus:border-emerald-500/60 disabled:opacity-55"
                            />
                          </label>
                        ) : (
                          icloudConn.accountLabel ? (
                            <p className="rounded-md bg-dark-800/60 px-2 py-1.5 text-[11px] text-dark-300">
                              Apple ID:&nbsp;<span className="font-mono">{icloudConn.accountLabel}</span>
                            </p>
                          ) : null
                        )}
                        <label className="block space-y-1">
                          <span className="text-[11px] text-dark-500">{t('pages.agenda.icloud.appPassword')}</span>
                          <input
                            type="password"
                            autoComplete="current-password"
                            value={icloudAppPassword}
                            onChange={(e) => setIcloudAppPassword(e.target.value)}
                            placeholder={t('pages.agenda.icloud.appPasswordPlaceholder')}
                            disabled={icloudBusy}
                            required
                            className="w-full rounded-md border border-dark-600 bg-dark-900 px-2 py-1.5 text-xs text-dark-100 outline-none focus:border-emerald-500/60 disabled:opacity-55"
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={icloudBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                        >
                          <Plug className="h-3.5 w-3.5" aria-hidden />
                          {t('pages.agenda.icloud.connect')}
                        </button>
                      </form>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {icloudConn?.status === 'CONNECTED' && icloudCredentialOpen && (
                        <button
                          type="button"
                          onClick={() => setIcloudShowCredentialForm(false)}
                          disabled={icloudBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dark-600 bg-dark-800/70 hover:bg-dark-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-dark-200 transition-colors"
                        >
                          {t('pages.agenda.icloud.hideCredentialPanel')}
                        </button>
                      )}
                      {icloudConn?.status === 'CONNECTED' && !icloudCredentialOpen ? (
                        <button
                          type="button"
                          onClick={() => setIcloudShowCredentialForm(true)}
                          disabled={icloudBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dark-600 bg-dark-800/70 hover:bg-dark-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-dark-200 transition-colors"
                        >
                          {t('pages.agenda.icloud.showCredentialPanel')}
                        </button>
                      ) : null}
                      {icloudConn && (
                        <button
                          type="button"
                          onClick={() => void handleDisconnectICloud()}
                          disabled={icloudBusy}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-dark-600 bg-dark-800/70 hover:bg-dark-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-dark-200 transition-colors"
                        >
                          {t('pages.agenda.icloud.disconnect')}
                        </button>
                      )}
                    </div>

                    {icloudConn?.status === 'CONNECTED' && (
                      <div className="space-y-2 rounded-lg border border-dark-600/35 bg-dark-950/45 px-3 py-2.5">
                        <label
                          className="block text-xs font-semibold uppercase tracking-wide text-dark-400"
                          htmlFor="agenda-icloud-calendar-target"
                        >
                          {t('pages.agenda.icloud.calendarTarget')}
                        </label>
                        <p className="text-[11px] leading-relaxed text-dark-500">
                          {t('pages.agenda.icloud.calendarHint')}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          {icloudCalLoading ? (
                            <span className="text-[11px] text-dark-500">
                              {t('pages.agenda.icloud.loadingCalendars')}
                            </span>
                          ) : null}
                          <select
                            id="agenda-icloud-calendar-target"
                            className="max-w-[min(100%,24rem)] flex-1 rounded-md border border-dark-600 bg-dark-900 px-2 py-1.5 text-xs text-dark-100 outline-none focus:border-emerald-500/60 disabled:opacity-55"
                            value={icloudCalSel}
                            onChange={(e) => setIcloudCalSel(e.target.value)}
                            disabled={
                              icloudCalLoading || icloudCalSaving || icloudBusy || icloudPickOptions.length === 0
                            }
                            aria-busy={icloudCalLoading}
                          >
                            {icloudPickOptions.length === 0 ? (
                              <option value="">—</option>
                            ) : (
                              icloudPickOptions.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.summary}
                                  {c.primary ? ` (${t('pages.agenda.icloud.primaryCalendarTag')})` : ''}
                                </option>
                              ))
                            )}
                          </select>
                          <button
                            type="button"
                            onClick={() => void handleSaveICloudCalendarTarget()}
                            disabled={
                              !icloudCalDirty ||
                              icloudCalLoading ||
                              icloudCalSaving ||
                              icloudBusy ||
                              icloudCalSel.trim() === '' ||
                              icloudPickOptions.length === 0
                            }
                            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                          >
                            {icloudCalSaving
                              ? t('pages.agenda.icloud.savingCalendar')
                              : t('pages.agenda.icloud.saveCalendar')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </li>
            </ul>
            <p className="text-xs text-dark-400">{t('pages.agenda.connectionsHint')}</p>
          </section>

          <section
            className="rounded-xl border border-dark-600/50 bg-dark-800/40 p-4 sm:p-5 ring-1 ring-white/[0.04]"
            aria-labelledby="agenda-new-heading"
          >
            <div className="flex items-start gap-3 mb-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-300">
                <CalendarRange className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 id="agenda-new-heading" className="text-base font-semibold text-dark-100">
                  {t('pages.agenda.newItemTitle')}
                </h2>
                <p className="text-sm text-dark-400">{t('pages.agenda.rangeHint')}</p>
              </div>
            </div>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-sm">
                  <span className="text-dark-400">{t('pages.agenda.fieldKind')}</span>
                  <select
                    value={formKind}
                    onChange={(e) => setFormKind(e.target.value as AgendaKind)}
                    className="w-full rounded-lg border border-dark-600 bg-dark-900 px-3 py-2 text-dark-100"
                  >
                    {kindOptions.map((k) => (
                      <option key={k} value={k}>
                        {t(`pages.agenda.kindLabels.${k}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-dark-400">{t('pages.agenda.fieldStarts')}</span>
                  <input
                    type="datetime-local"
                    required
                    value={formStarts}
                    onChange={(e) => setFormStarts(e.target.value)}
                    className="w-full rounded-lg border border-dark-600 bg-dark-900 px-3 py-2 text-dark-100"
                  />
                </label>
              </div>
              <label className="block space-y-1 text-sm">
                <span className="text-dark-400">{t('pages.agenda.fieldTitle')}</span>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-lg border border-dark-600 bg-dark-900 px-3 py-2 text-dark-100"
                  placeholder={t('pages.agenda.fieldTitlePlaceholder')}
                  maxLength={512}
                />
              </label>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
              >
                <Plus className="h-4 w-4" aria-hidden />
                {t('pages.agenda.create')}
              </button>
            </form>
          </section>
        </div>

        <section aria-labelledby="agenda-list-heading" className="space-y-3">
          <h2 id="agenda-list-heading" className="text-lg font-semibold text-dark-100">
            {t('pages.agenda.thisMonth')} ({anchor.toLocaleString(undefined, { month: 'long', year: 'numeric' })})
          </h2>
          {loading ? (
            <p className="text-sm text-dark-500">{t('pages.agenda.loading')}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-dark-500">{t('pages.agenda.empty')}</p>
          ) : (
            <ul className="space-y-2">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dark-600/40 bg-dark-800/30 px-4 py-3 ring-1 ring-white/[0.03]"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-dark-100 truncate">{it.title}</p>
                    <p className="text-xs text-dark-500">
                      {t(`pages.agenda.kindLabels.${it.kind}`)} ·{' '}
                      {new Date(it.startsAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: it.allDay ? undefined : 'short',
                      })}
                    </p>
                    <AgendaOutboundSyncRowChips
                      t={t}
                      syncToExternal={it.syncToExternal}
                      googleOnline={
                        !!(googleConn?.status === 'CONNECTED' && googleAvailable)
                      }
                      icloudOnline={
                        !!(icloudConn?.status === 'CONNECTED' && icloudAvailable)
                      }
                      outbound={it.outboundSync}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDelete(it.id)}
                    className={[
                      'inline-flex items-center gap-1 rounded-lg border border-red-500/35 bg-red-500/10',
                      'px-2.5 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition-colors',
                    ].join(' ')}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {t('pages.agenda.delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </motion.div>
  );
};

export default Agenda;
