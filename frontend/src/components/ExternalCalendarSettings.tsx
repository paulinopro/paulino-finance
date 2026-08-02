import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Cloud,
  Loader2,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  Unplug,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

type Provider = 'GOOGLE_CALENDAR' | 'ICLOUD_CALDAV';

interface AgendaConnDto {
  id: number;
  provider: Provider | string;
  status: string;
  accountLabel?: string;
  lastError?: string;
  externalDefaultCalendarId?: string;
}

interface WritableCalendarDto {
  id: string;
  summary: string;
  primary: boolean;
}

interface ImportRangeState {
  mode: 'future' | 'defaultWindow' | 'custom';
  from: string;
  to: string;
}

const todayYmd = () => new Date().toISOString().slice(0, 10);

function addYearsYmd(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function getMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message;
  return msg || (err as { message?: string })?.message || fallback;
}

function providerConnection(connections: AgendaConnDto[], provider: Provider) {
  return connections.find((c) => c.provider === provider);
}

function isConnected(conn?: AgendaConnDto) {
  return conn?.status === 'CONNECTED';
}

const ExternalCalendarSettings: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [connections, setConnections] = useState<AgendaConnDto[]>([]);
  const [googleCalendars, setGoogleCalendars] = useState<WritableCalendarDto[]>([]);
  const [icloudCalendars, setIcloudCalendars] = useState<WritableCalendarDto[]>([]);
  const [googleSelected, setGoogleSelected] = useState('');
  const [icloudSelected, setIcloudSelected] = useState('');
  const [icloudAppleId, setIcloudAppleId] = useState('');
  const [icloudAppPassword, setIcloudAppPassword] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [range, setRange] = useState<ImportRangeState>({
    mode: 'future',
    from: todayYmd(),
    to: addYearsYmd(2),
  });

  const googleConn = useMemo(() => providerConnection(connections, 'GOOGLE_CALENDAR'), [connections]);
  const icloudConn = useMemo(() => providerConnection(connections, 'ICLOUD_CALDAV'), [connections]);
  const googleConnected = isConnected(googleConn);
  const icloudConnected = isConnected(icloudConn);

  const fetchConnections = useCallback(async () => {
    const res = await api.get('/agenda/connections');
    setConnections(res.data.connections || []);
  }, []);

  const loadCalendars = useCallback(
    async (provider: Provider) => {
      const path = provider === 'GOOGLE_CALENDAR' ? '/agenda/connect/google/calendars' : '/agenda/connect/icloud/calendars';
      const res = await api.get(path);
      const calendars: WritableCalendarDto[] = res.data.calendars || [];
      if (provider === 'GOOGLE_CALENDAR') {
        setGoogleCalendars(calendars);
        setGoogleSelected((prev) => prev || googleConn?.externalDefaultCalendarId || calendars[0]?.id || '');
      } else {
        setIcloudCalendars(calendars);
        setIcloudSelected((prev) => prev || icloudConn?.externalDefaultCalendarId || calendars[0]?.id || '');
      }
      return calendars;
    },
    [googleConn?.externalDefaultCalendarId, icloudConn?.externalDefaultCalendarId]
  );

  useEffect(() => {
    void fetchConnections();
  }, [fetchConnections]);

  useEffect(() => {
    const g = searchParams.get('google');
    if (!g) return;
    if (g === 'connected') toast.success('Google Calendar conectado correctamente.');
    else if (g === 'cancel') toast('La conexión con Google fue cancelada.');
    else if (g === 'not_configured') toast.error('Google Calendar no está configurado en el servidor.');
    else toast.error('No se pudo conectar Google Calendar.');
    navigate('/settings', { replace: true });
    void fetchConnections();
  }, [fetchConnections, navigate, searchParams]);

  useEffect(() => {
    if (googleConnected) void loadCalendars('GOOGLE_CALENDAR').catch(() => undefined);
    else {
      setGoogleCalendars([]);
      setGoogleSelected('');
    }
    if (icloudConnected) void loadCalendars('ICLOUD_CALDAV').catch(() => undefined);
    else {
      setIcloudCalendars([]);
      setIcloudSelected('');
    }
  }, [googleConnected, icloudConnected, loadCalendars]);

  const connectGoogle = async () => {
    setBusy('google-connect');
    try {
      const res = await api.get<{ authorizationUrl?: string }>('/agenda/connect/google/start');
      if (!res.data.authorizationUrl) throw new Error('No llegó la URL de autorización.');
      window.location.assign(res.data.authorizationUrl);
    } catch (err) {
      toast.error(getMessage(err, 'No se pudo iniciar Google OAuth.'));
      setBusy(null);
    }
  };

  const disconnectProvider = async (provider: Provider) => {
    const name = provider === 'GOOGLE_CALENDAR' ? 'Google Calendar' : 'iCloud Calendar';
    if (!globalThis.confirm(`¿Desconectar ${name}? Los eventos de Agenda guardados aquí no se borran.`)) return;
    setBusy(`${provider}-disconnect`);
    try {
      await api.delete(provider === 'GOOGLE_CALENDAR' ? '/agenda/connect/google' : '/agenda/connect/icloud');
      toast.success(`${name} desconectado.`);
      await fetchConnections();
    } catch (err) {
      toast.error(getMessage(err, `No se pudo desconectar ${name}.`));
    } finally {
      setBusy(null);
    }
  };

  const connectICloud = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('icloud-connect');
    try {
      await api.post('/agenda/connect/icloud', {
        appleId: icloudAppleId,
        appPassword: icloudAppPassword,
      });
      setIcloudAppPassword('');
      toast.success('iCloud Calendar conectado correctamente.');
      await fetchConnections();
    } catch (err) {
      toast.error(getMessage(err, 'No se pudo conectar iCloud Calendar.'));
    } finally {
      setBusy(null);
    }
  };

  const testProvider = async (provider: Provider) => {
    setBusy(`${provider}-test`);
    try {
      const calendars = await loadCalendars(provider);
      toast.success(`${provider === 'GOOGLE_CALENDAR' ? 'Google Calendar' : 'iCloud Calendar'} respondió con ${calendars.length} calendario(s).`);
    } catch (err) {
      toast.error(getMessage(err, 'No se pudo validar la conexión.'));
    } finally {
      setBusy(null);
    }
  };

  const saveDefaultCalendar = async (provider: Provider) => {
    const selected = provider === 'GOOGLE_CALENDAR' ? googleSelected : icloudSelected;
    if (!selected) {
      toast.error('Selecciona un calendario destino.');
      return;
    }
    setBusy(`${provider}-save`);
    try {
      await api.patch(provider === 'GOOGLE_CALENDAR' ? '/agenda/connect/google' : '/agenda/connect/icloud', {
        calendarId: selected,
      });
      toast.success('Calendario destino guardado.');
      await fetchConnections();
    } catch (err) {
      toast.error(getMessage(err, 'No se pudo guardar el calendario destino.'));
    } finally {
      setBusy(null);
    }
  };

  const importProviderRange = async (provider: Provider) => {
    const now = new Date();
    let from = now;
    let to = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());
    if (range.mode === 'defaultWindow') from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    if (range.mode === 'custom') {
      from = new Date(`${range.from}T00:00:00`);
      to = new Date(`${range.to}T23:59:59`);
    }
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      toast.error('El rango de importación no es válido.');
      return;
    }
    setBusy(`${provider}-import`);
    try {
      const res = await api.post('/agenda/sync/import-range', {
        provider,
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const r = res.data.result;
      toast.success(`Importación lista: ${r.imported} importados, ${r.updated} actualizados.`);
    } catch (err) {
      toast.error(getMessage(err, 'No se pudo importar el calendario.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card lg:col-span-3">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-6 w-6 shrink-0 text-primary-400" />
            <h2 className="text-xl font-semibold text-white">Calendarios externos</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dark-400">
            Conecta Google Calendar o iCloud Calendar desde aquí. El módulo de Agenda solo mostrará el estado y usará estas conexiones para sincronizar.
          </p>
        </div>
        <Link to="/agenda" className="btn-secondary w-full md:w-auto">
          Ver Agenda
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ProviderCard
          title="Google Calendar"
          provider="GOOGLE_CALENDAR"
          connection={googleConn}
          connected={googleConnected}
          calendars={googleCalendars}
          selected={googleSelected}
          busy={busy}
          onSelected={setGoogleSelected}
          onConnect={() => void connectGoogle()}
          onDisconnect={() => void disconnectProvider('GOOGLE_CALENDAR')}
          onTest={() => void testProvider('GOOGLE_CALENDAR')}
          onSave={() => void saveDefaultCalendar('GOOGLE_CALENDAR')}
          onImport={() => void importProviderRange('GOOGLE_CALENDAR')}
          range={range}
          onRange={setRange}
        />
        <ProviderCard
          title="iCloud Calendar"
          provider="ICLOUD_CALDAV"
          connection={icloudConn}
          connected={icloudConnected}
          calendars={icloudCalendars}
          selected={icloudSelected}
          busy={busy}
          onSelected={setIcloudSelected}
          onDisconnect={() => void disconnectProvider('ICLOUD_CALDAV')}
          onTest={() => void testProvider('ICLOUD_CALDAV')}
          onSave={() => void saveDefaultCalendar('ICLOUD_CALDAV')}
          onImport={() => void importProviderRange('ICLOUD_CALDAV')}
          range={range}
          onRange={setRange}
        >
          {!icloudConnected && (
            <form className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={connectICloud}>
              <label className="min-w-0">
                <span className="label">Apple ID</span>
                <input
                  type="email"
                  autoComplete="username"
                  value={icloudAppleId}
                  onChange={(e) => setIcloudAppleId(e.target.value)}
                  className="input"
                  placeholder="tu@icloud.com"
                />
              </label>
              <label className="min-w-0">
                <span className="label">Contraseña de app</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={icloudAppPassword}
                  onChange={(e) => setIcloudAppPassword(e.target.value)}
                  className="input"
                  placeholder="xxxx-xxxx-xxxx-xxxx"
                />
              </label>
              <button type="submit" disabled={busy === 'icloud-connect'} className="btn-primary self-end">
                {busy === 'icloud-connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                Conectar
              </button>
            </form>
          )}
        </ProviderCard>
      </div>
    </section>
  );
};

function ProviderCard(props: {
  title: string;
  provider: Provider;
  connection?: AgendaConnDto;
  connected: boolean;
  calendars: WritableCalendarDto[];
  selected: string;
  busy: string | null;
  onSelected: (id: string) => void;
  onConnect?: () => void;
  onDisconnect: () => void;
  onTest: () => void;
  onSave: () => void;
  onImport: () => void;
  range: ImportRangeState;
  onRange: (range: ImportRangeState) => void;
  children?: React.ReactNode;
}) {
  const {
    title,
    provider,
    connection,
    connected,
    calendars,
    selected,
    busy,
    onSelected,
    onConnect,
    onDisconnect,
    onTest,
    onSave,
    onImport,
    range,
    onRange,
    children,
  } = props;
  const providerBusy = busy?.startsWith(provider) || (provider === 'GOOGLE_CALENDAR' && busy === 'google-connect');
  const statusTone = connected ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-dark-600 bg-dark-900/70 text-dark-300';

  return (
    <div className="rounded-xl border border-dark-600/70 bg-dark-900/45 p-4 ring-1 ring-white/[0.03]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <span className={`inline-flex min-h-[28px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone}`}>
              {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
              {connected ? 'Conectado' : 'Sin conectar'}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-dark-400">
            {connection?.accountLabel || (connected ? 'Cuenta conectada' : 'Conecta esta cuenta para sincronización bidireccional.')}
          </p>
          {connection?.lastError && (
            <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm leading-5 text-red-200">
              {connection.lastError}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {connected ? (
            <button type="button" onClick={onDisconnect} disabled={providerBusy} className="btn-secondary min-w-[44px] px-3">
              <Unplug className="h-4 w-4" />
              Desconectar
            </button>
          ) : onConnect ? (
            <button type="button" onClick={onConnect} disabled={providerBusy} className="btn-primary min-w-[44px] px-3">
              {busy === 'google-connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
              Conectar
            </button>
          ) : null}
        </div>
      </div>

      {children}

      {connected && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="min-w-0">
              <span className="label">Calendario destino</span>
              <select value={selected} onChange={(e) => onSelected(e.target.value)} className="input">
                {calendars.length === 0 && <option value="">Cargando calendarios...</option>}
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.summary}
                    {cal.primary ? ' (principal)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={onTest} disabled={providerBusy} className="btn-secondary self-end">
              {busy === `${provider}-test` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Probar
            </button>
            <button type="button" onClick={onSave} disabled={providerBusy || !selected} className="btn-primary self-end">
              {busy === `${provider}-save` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar
            </button>
          </div>

          <div className="rounded-lg border border-dark-600/60 bg-dark-800/45 p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid flex-1 gap-3 sm:grid-cols-3">
                <label>
                  <span className="label">Importar</span>
                  <select value={range.mode} onChange={(e) => onRange({ ...range, mode: e.target.value as ImportRangeState['mode'] })} className="input">
                    <option value="future">Desde hoy</option>
                    <option value="defaultWindow">12m atrás / 24m adelante</option>
                    <option value="custom">Rango personalizado</option>
                  </select>
                </label>
                <label className={range.mode === 'custom' ? '' : 'opacity-55'}>
                  <span className="label">Desde</span>
                  <input
                    type="date"
                    value={range.from}
                    onChange={(e) => onRange({ ...range, from: e.target.value })}
                    disabled={range.mode !== 'custom'}
                    className="input"
                  />
                </label>
                <label className={range.mode === 'custom' ? '' : 'opacity-55'}>
                  <span className="label">Hasta</span>
                  <input
                    type="date"
                    value={range.to}
                    onChange={(e) => onRange({ ...range, to: e.target.value })}
                    disabled={range.mode !== 'custom'}
                    className="input"
                  />
                </label>
              </div>
              <button type="button" onClick={onImport} disabled={providerBusy} className="btn-secondary w-full lg:w-auto">
                {busy === `${provider}-import` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Importar
              </button>
            </div>
          </div>
        </div>
      )}

      {!connected && !children && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dark-600/60 bg-dark-800/45 px-3 py-2 text-sm text-dark-400">
          <Cloud className="h-4 w-4 shrink-0 text-dark-500" />
          Se activará cuando completes la autorización de este proveedor.
        </div>
      )}
    </div>
  );
}

export default ExternalCalendarSettings;
