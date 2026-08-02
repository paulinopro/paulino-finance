import React, { useCallback, useEffect, useMemo, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import listPlugin from '@fullcalendar/list';
import { DateSelectArg, EventClickArg, EventDropArg, EventInput } from '@fullcalendar/core';
import { EventResizeDoneArg } from '@fullcalendar/interaction';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Cloud,
  Loader2,
  MapPin,
  RefreshCw,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import PageHeader from '../components/PageHeader';

type AgendaKind = 'EVENT' | 'TASK' | 'REMINDER' | 'APPOINTMENT' | 'NOTE';

interface AgendaOutboundSyncHintsDto {
  google: 'none' | 'ok' | 'err';
  icloud: 'none' | 'ok' | 'err';
}

interface AgendaItemDto {
  id: number;
  kind: AgendaKind;
  title: string;
  description?: string;
  location?: string;
  startsAt: string;
  endsAt?: string;
  allDay: boolean;
  status: string;
  syncToExternal: boolean;
  syncStatus?: string;
  recurrenceRule?: string;
  outboundSync?: AgendaOutboundSyncHintsDto;
}

interface AgendaConnDto {
  id: number;
  provider: 'GOOGLE_CALENDAR' | 'ICLOUD_CALDAV' | string;
  status: string;
  accountLabel?: string;
  lastError?: string;
}

interface AgendaDraft {
  id?: number;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  syncToExternal: boolean;
}

const blankDraft = (): AgendaDraft => ({
  title: '',
  description: '',
  location: '',
  startsAt: toDatetimeLocalValue(new Date()),
  endsAt: toDatetimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)),
  allDay: false,
  syncToExternal: true,
});

function toDatetimeLocalValue(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromLocal(value: string): string {
  return new Date(value).toISOString();
}

function providerConnection(connections: AgendaConnDto[], provider: string) {
  return connections.find((c) => c.provider === provider);
}

function providerOnline(connections: AgendaConnDto[], provider: string): boolean {
  return providerConnection(connections, provider)?.status === 'CONNECTED';
}

const Agenda: React.FC = () => {
  const { t } = useTranslation();
  const label = useCallback((key: string, fallback: string) => t(key, { defaultValue: fallback }), [t]);

  const [items, setItems] = useState<AgendaItemDto[]>([]);
  const [connections, setConnections] = useState<AgendaConnDto[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(() => {
    const now = new Date();
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      to: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    };
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<AgendaDraft>(() => blankDraft());

  const googleConn = providerConnection(connections, 'GOOGLE_CALENDAR');
  const icloudConn = providerConnection(connections, 'ICLOUD_CALDAV');
  const googleConnected = providerOnline(connections, 'GOOGLE_CALENDAR');
  const icloudConnected = providerOnline(connections, 'ICLOUD_CALDAV');

  const fetchConnections = useCallback(async () => {
    const res = await api.get('/agenda/connections');
    setConnections(res.data.connections || []);
  }, []);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/agenda/items', { params: range });
      setItems(res.data.items || []);
    } catch (e) {
      console.error(e);
      toast.error(label('pages.agenda.toast.loadError', 'No se pudo cargar la Agenda.'));
    } finally {
      setLoading(false);
    }
  }, [label, range]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchItems(), fetchConnections()]);
  }, [fetchConnections, fetchItems]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const calendarEvents: EventInput[] = useMemo(
    () =>
      items.map((it) => ({
        id: `${it.id}-${it.startsAt}`,
        title: it.title,
        start: it.startsAt,
        end: it.endsAt,
        allDay: it.allDay,
        editable: !it.recurrenceRule,
        durationEditable: !it.recurrenceRule,
        startEditable: !it.recurrenceRule,
        classNames: [
          it.syncStatus === 'PENDING' ? 'pf-agenda-event-pending' : '',
          it.outboundSync?.google === 'err' || it.outboundSync?.icloud === 'err' ? 'pf-agenda-event-error' : '',
        ].filter(Boolean),
        extendedProps: it,
      })),
    [items]
  );

  const openNew = (seed?: Partial<AgendaDraft>) => {
    setDraft({ ...blankDraft(), ...seed });
    setModalOpen(true);
  };

  const openExisting = (item: AgendaItemDto) => {
    setDraft({
      id: item.id,
      title: item.title,
      description: item.description || '',
      location: item.location || '',
      startsAt: toDatetimeLocalValue(item.startsAt),
      endsAt: item.endsAt ? toDatetimeLocalValue(item.endsAt) : toDatetimeLocalValue(new Date(new Date(item.startsAt).getTime() + 60 * 60 * 1000)),
      allDay: item.allDay,
      syncToExternal: item.syncToExternal,
    });
    setModalOpen(true);
  };

  const handleDatesSet = (arg: { start: Date; end: Date }) => {
    const next = { from: arg.start.toISOString(), to: arg.end.toISOString() };
    setRange((prev) => (prev.from === next.from && prev.to === next.to ? prev : next));
  };

  const handleSelect = (arg: DateSelectArg) => {
    openNew({
      startsAt: toDatetimeLocalValue(arg.start),
      endsAt: toDatetimeLocalValue(arg.end),
      allDay: arg.allDay,
    });
  };

  const patchEventTime = async (id: string, startsAt: Date, endsAt: Date | null, allDay: boolean) => {
    await api.patch(`/agenda/items/${id}`, {
      startsAt: startsAt.toISOString(),
      endsAt: endsAt ? endsAt.toISOString() : null,
      allDay,
      syncStatus: 'PENDING',
      lastChangeOrigin: 'LOCAL',
    });
    await fetchItems();
  };

  const handleEventDrop = async (arg: EventDropArg) => {
    const it = arg.event.extendedProps as AgendaItemDto;
    if (it.recurrenceRule) {
      arg.revert();
      toast.error('Los eventos recurrentes se editan desde la serie completa.');
      return;
    }
    try {
      await patchEventTime(String(it.id), arg.event.start!, arg.event.end, arg.event.allDay);
      toast.success(label('pages.agenda.toast.updated', 'Evento actualizado.'));
    } catch (e) {
      arg.revert();
      console.error(e);
      toast.error(label('pages.agenda.toast.updateError', 'No se pudo actualizar el evento.'));
    }
  };

  const handleEventResize = async (arg: EventResizeDoneArg) => {
    const it = arg.event.extendedProps as AgendaItemDto;
    if (it.recurrenceRule) {
      arg.revert();
      toast.error('Los eventos recurrentes se editan desde la serie completa.');
      return;
    }
    try {
      await patchEventTime(String(it.id), arg.event.start!, arg.event.end, arg.event.allDay);
      toast.success(label('pages.agenda.toast.updated', 'Evento actualizado.'));
    } catch (e) {
      arg.revert();
      console.error(e);
      toast.error(label('pages.agenda.toast.updateError', 'No se pudo actualizar el evento.'));
    }
  };

  const saveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      toast.error(label('pages.agenda.toast.titleRequired', 'El título es obligatorio.'));
      return;
    }
    const payload = {
      kind: 'EVENT',
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      location: draft.location.trim() || null,
      startsAt: toIsoFromLocal(draft.startsAt),
      endsAt: draft.endsAt ? toIsoFromLocal(draft.endsAt) : null,
      allDay: draft.allDay,
      syncToExternal: draft.syncToExternal,
      syncStatus: 'PENDING',
      lastChangeOrigin: 'LOCAL',
    };
    try {
      if (draft.id) await api.patch(`/agenda/items/${draft.id}`, payload);
      else await api.post('/agenda/items', payload);
      toast.success(label('pages.agenda.toast.saved', 'Evento guardado.'));
      setModalOpen(false);
      await fetchItems();
    } catch (err) {
      console.error(err);
      toast.error(label('pages.agenda.toast.saveError', 'No se pudo guardar el evento.'));
    }
  };

  const deleteDraft = async () => {
    if (!draft.id) return;
    if (!globalThis.confirm(label('pages.agenda.confirmDelete', '¿Eliminar este evento?'))) return;
    try {
      await api.delete(`/agenda/items/${draft.id}`);
      toast.success(label('pages.agenda.toast.deleted', 'Evento eliminado.'));
      setModalOpen(false);
      await fetchItems();
    } catch (e) {
      console.error(e);
      toast.error(label('pages.agenda.toast.deleteError', 'No se pudo eliminar el evento.'));
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await api.post('/agenda/sync');
      const r = res.data.result;
      toast.success(`Sincronización lista: ${r.imported} importados, ${r.updated} actualizados, ${r.pushed} enviados.`);
      await fetchAll();
    } catch (e) {
      console.error(e);
      toast.error(label('pages.agenda.toast.syncError', 'No se pudo sincronizar la Agenda.'));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="mx-auto max-w-[1440px] space-y-5 px-1 pb-28 md:pb-10">
        <PageHeader
          title={label('pages.agenda.title', 'Agenda')}
          subtitle={label('pages.agenda.subtitle', 'Eventos personales sincronizados con Google Calendar e iCloud Calendar.')}
          actions={
            <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
              <button type="button" onClick={() => openNew()} className="btn-primary">
                <CalendarDays className="h-4 w-4" aria-hidden />
                {label('pages.agenda.newEvent', 'Nuevo evento')}
              </button>
              <button type="button" onClick={() => void syncNow()} disabled={syncing} className="btn-secondary">
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {label('pages.agenda.syncNow', 'Sincronizar')}
              </button>
              <Link to="/settings" className="btn-secondary">
                <Settings className="h-4 w-4" />
                Configuración
              </Link>
            </div>
          }
        />

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="calendar-container min-h-[620px] rounded-xl border border-dark-600/50 bg-dark-900/70 p-2 ring-1 ring-white/[0.04] sm:p-3">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
              }}
              buttonText={{
                today: label('pages.agenda.today', 'Hoy'),
                month: label('pages.agenda.month', 'Mes'),
                week: label('pages.agenda.week', 'Semana'),
                day: label('pages.agenda.day', 'Día'),
                list: label('pages.agenda.list', 'Lista'),
              }}
              height="auto"
              selectable
              editable
              nowIndicator
              eventResizableFromStart
              events={calendarEvents}
              datesSet={handleDatesSet}
              select={handleSelect}
              eventClick={(arg: EventClickArg) => openExisting(arg.event.extendedProps as AgendaItemDto)}
              eventDrop={handleEventDrop}
              eventResize={handleEventResize}
              eventContent={(arg) => {
                const it = arg.event.extendedProps as AgendaItemDto;
                const hasError = it.outboundSync?.google === 'err' || it.outboundSync?.icloud === 'err';
                return (
                  <div className="min-w-0 px-1 py-0.5">
                    <div className="truncate text-[12px] font-semibold">{arg.event.title}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[10px] opacity-80">
                      {hasError ? <AlertCircle className="h-3 w-3" /> : it.syncStatus === 'PENDING' ? <Cloud className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                      <span>{it.syncStatus === 'PENDING' ? label('pages.agenda.pending', 'Pendiente') : label('pages.agenda.synced', 'Sync')}</span>
                    </div>
                  </div>
                );
              }}
            />
            {loading && <p className="mt-3 text-sm text-dark-400">{label('pages.agenda.loading', 'Cargando...')}</p>}
          </div>

          <aside className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 xl:content-start">
            <ConnectionStatus title="Google Calendar" connected={googleConnected} account={googleConn?.accountLabel} error={googleConn?.lastError} />
            <ConnectionStatus title="iCloud Calendar" connected={icloudConnected} account={icloudConn?.accountLabel} error={icloudConn?.lastError} />
            <div className="rounded-xl border border-dark-600/50 bg-dark-800/35 p-4 text-sm leading-6 text-dark-300 sm:col-span-2 xl:col-span-1">
              <p className="font-semibold text-dark-100">Estado de sincronización</p>
              <p className="mt-2">
                {googleConnected || icloudConnected
                  ? 'Los eventos se sincronizan con los proveedores conectados. Para cambiar cuentas o calendarios, entra a Configuración.'
                  : 'Puedes crear eventos ahora. Quedarán pendientes hasta conectar Google o iCloud desde Configuración.'}
              </p>
            </div>
          </aside>
        </section>
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <form onSubmit={saveDraft} className="modal-sheet card max-w-2xl">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-dark-100">
                {draft.id ? label('pages.agenda.editEvent', 'Editar evento') : label('pages.agenda.createEvent', 'Nuevo evento')}
              </h2>
              <button type="button" aria-label="Cerrar" onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-dark-400 hover:bg-dark-700 hover:text-dark-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label>
                <span className="label">Título</span>
                <input value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} className="input" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="label">{label('pages.agenda.fieldStarts', 'Inicio')}</span>
                  <input type="datetime-local" value={draft.startsAt} onChange={(e) => setDraft((p) => ({ ...p, startsAt: e.target.value }))} className="input" />
                </label>
                <label>
                  <span className="label">{label('pages.agenda.fieldEnds', 'Fin')}</span>
                  <input type="datetime-local" value={draft.endsAt} onChange={(e) => setDraft((p) => ({ ...p, endsAt: e.target.value }))} className="input" />
                </label>
              </div>
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-dark-300">
                <input type="checkbox" checked={draft.allDay} onChange={(e) => setDraft((p) => ({ ...p, allDay: e.target.checked }))} className="h-4 w-4 rounded border-dark-600 bg-dark-900" />
                {label('pages.agenda.allDay', 'Todo el día')}
              </label>
              <label>
                <span className="label">{label('pages.agenda.location', 'Ubicación')}</span>
                <div className="flex min-h-[44px] items-center gap-2 rounded-lg border border-dark-700 bg-dark-800 px-4 py-2 focus-within:ring-2 focus-within:ring-primary-500">
                  <MapPin className="h-4 w-4 shrink-0 text-dark-500" />
                  <input value={draft.location} onChange={(e) => setDraft((p) => ({ ...p, location: e.target.value }))} className="min-w-0 flex-1 bg-transparent text-base text-white outline-none sm:text-sm" />
                </div>
              </label>
              <label>
                <span className="label">{label('pages.agenda.description', 'Descripción')}</span>
                <textarea value={draft.description} onChange={(e) => setDraft((p) => ({ ...p, description: e.target.value }))} rows={4} className="input min-h-[112px]" />
              </label>
              <label className="flex min-h-[44px] items-center gap-2 text-sm text-dark-300">
                <input type="checkbox" checked={draft.syncToExternal} onChange={(e) => setDraft((p) => ({ ...p, syncToExternal: e.target.checked }))} className="h-4 w-4 rounded border-dark-600 bg-dark-900" />
                {label('pages.agenda.syncToExternal', 'Sincronizar con calendarios conectados')}
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              {draft.id ? (
                <button type="button" onClick={() => void deleteDraft()} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20">
                  <Trash2 className="h-4 w-4" />
                  {label('pages.agenda.delete', 'Eliminar')}
                </button>
              ) : (
                <span />
              )}
              <div className="grid gap-2 sm:flex">
                <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">
                  {label('common.cancel', 'Cancelar')}
                </button>
                <button type="submit" className="btn-primary">
                  {label('common.save', 'Guardar')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </motion.div>
  );
};

function ConnectionStatus(props: { title: string; connected: boolean; account?: string; error?: string }) {
  const { title, connected, account, error } = props;
  return (
    <div className="rounded-xl border border-dark-600/50 bg-dark-800/50 p-4 ring-1 ring-white/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-dark-100">{title}</p>
          <p className="mt-1 truncate text-sm text-dark-400">{account || (connected ? 'Cuenta conectada' : 'Configurar en Ajustes')}</p>
        </div>
        <span className={`inline-flex min-h-[28px] shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${connected ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200' : 'border-dark-600 bg-dark-900 text-dark-300'}`}>
          {connected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {connected ? 'Conectado' : 'Sin conectar'}
        </span>
      </div>
      {error && <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-200">{error}</p>}
    </div>
  );
}

export default Agenda;
