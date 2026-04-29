import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import type { LocaleInput } from '@fullcalendar/core';
import {
  Calendar as CalendarIcon,
  Filter,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Clock,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { dateToYmdLocal, formatCalendarDateLongEs } from '../utils/dateUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { CalendarEvent, FinancialSummary } from '../types';

/** Intl en es-DO devuelve días en minúscula; capitalizamos solo la primera letra del texto. */
function capitalizeEs(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type VerboseDateArg = { date: { year: number; month: number; day: number } };

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Título del toolbar: primera letra en mayúscula (es-DO).
 * FullCalendar usa `end` exclusivo en el rango visible; lo convertimos al último día inclusivo.
 */
function formatCalendarToolbarTitle(arg: {
  start: { year: number; month: number; day: number };
  end?: { year: number; month: number; day: number };
}): string {
  const s = new Date(arg.start.year, arg.start.month, arg.start.day);
  let endInclusive: Date;
  if (!arg.end) {
    endInclusive = s;
  } else {
    const endExclusive = new Date(arg.end.year, arg.end.month, arg.end.day);
    endInclusive = new Date(endExclusive);
    endInclusive.setDate(endInclusive.getDate() - 1);
  }

  const sameDay =
    s.getFullYear() === endInclusive.getFullYear() &&
    s.getMonth() === endInclusive.getMonth() &&
    s.getDate() === endInclusive.getDate();

  if (sameDay) {
    return capitalizeEs(
      s.toLocaleDateString('es-DO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    );
  }

  const sameMonth =
    s.getFullYear() === endInclusive.getFullYear() && s.getMonth() === endInclusive.getMonth();

  const spansFullMonth =
    sameMonth &&
    s.getDate() === 1 &&
    endInclusive.getDate() === lastDayOfMonth(endInclusive.getFullYear(), endInclusive.getMonth());

  if (spansFullMonth) {
    return capitalizeEs(s.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' }));
  }

  if (sameMonth) {
    return capitalizeEs(
      `${s.getDate()} – ${endInclusive.getDate()} de ${s.toLocaleDateString('es-DO', { month: 'long' })} de ${s.getFullYear()}`
    );
  }

  const fmt = new Intl.DateTimeFormat('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
  return capitalizeEs(`${fmt.format(s)} – ${fmt.format(endInclusive)}`);
}

function formatVerboseToEsDate(verboseArg: VerboseDateArg, options: Intl.DateTimeFormatOptions): string {
  const { year, month, day } = verboseArg.date;
  const d = new Date(year, month, day);
  return capitalizeEs(d.toLocaleDateString('es-DO', options));
}

const CALENDAR_STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  PAID: '#10b981',
  RECEIVED: '#10b981',
  OVERDUE: '#ef4444',
  CANCELLED: '#6b7280',
};

const Calendar: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<CalendarEvent[]>([]);
  const [filters, setFilters] = useState({
    eventTypes: [] as string[],
    status: [] as string[],
    showPaid: true,
  });
  const calendarRef = useRef<FullCalendar>(null);
  const eventDetailModalRef = useRef<HTMLDivElement>(null);
  const isMobileCalendar = useMediaQuery('(max-width: 767px)');

  const [showSummaryWidgets, setShowSummaryWidgets] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('pf:calendar:showSummary') !== 'false';
    } catch {
      return true;
    }
  });

  const toggleSummaryWidgets = () => {
    setShowSummaryWidgets((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('pf:calendar:showSummary', next ? 'true' : 'false');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  /**
   * Las vistas list usan `buttonTextKey: 'list'`. El locale `es` define `list: 'Agenda'`, que gana
   * sobre `listMonth`/`listWeek`/`listDay` y dejaba los tres botones como "Agenda". Omitimos `list`
   * y fijamos etiquetas por nombre de vista; en escritorio el cuarto botón (listWeek) sigue siendo "Agenda".
   */
  const calendarLocale = useMemo<LocaleInput>(() => {
    const esButtons = { ...(esLocale.buttonText ?? {}) } as Record<string, string>;
    delete esButtons.list;
    return {
      ...esLocale,
      buttonText: {
        ...esButtons,
        prev: 'Anterior',
        next: 'Siguiente',
        ...(isMobileCalendar
          ? { listMonth: 'Mes', listWeek: 'Semana', listDay: 'Día' }
          : { listWeek: 'Agenda' }),
      },
    };
  }, [isMobileCalendar]);

  const eventTypeLabels: { [key: string]: string } = {
    CARD_PAYMENT: 'Pago de Tarjeta',
    LOAN_PAYMENT: 'Pago de Préstamo',
    INCOME: 'Ingreso',
    EXPENSE: 'Gasto',
    RECURRING_EXPENSE: 'Gasto Recurrente',
  };

  const statusLabels: { [key: string]: string } = {
    PENDING: 'Pendiente',
    PAID: 'Pagado',
    RECEIVED: 'Recibido',
    OVERDUE: 'Vencido',
    CANCELLED: 'Cancelado',
  };

  const fetchEvents = useCallback(async () => {
    try {
      const calendarApi = calendarRef.current?.getApi();
      if (!calendarApi) return;

      const view = calendarApi.view;
      const start = dateToYmdLocal(view.activeStart);
      const end = dateToYmdLocal(view.activeEnd);

      const params = new URLSearchParams({
        start,
        end,
        showPaid: filters.showPaid.toString(),
      });
      if (filters.eventTypes.length > 0) {
        filters.eventTypes.forEach((type) => params.append('eventTypes', type));
      }
      if (filters.status.length > 0) {
        filters.status.forEach((status) => params.append('status', status));
      }

      const eventsResponse = await api.get(`/calendar/events?${params.toString()}`);
      const formattedEvents = eventsResponse.data.events.map((event: CalendarEvent) => ({
        id: event.id.toString(),
        title: event.title,
        start: event.eventDate,
        backgroundColor: CALENDAR_STATUS_COLORS[event.status] || event.color,
        borderColor: CALENDAR_STATUS_COLORS[event.status] || event.color,
        textColor: '#ffffff',
        extendedProps: {
          ...event,
        },
      }));
      setEvents(formattedEvents);

      const summaryResponse = await api.get(`/calendar/summary?start=${start}&end=${end}`);
      setSummary(summaryResponse.data.summary);

      if (showHistoryPanel) {
        try {
          const historyResponse = await api.get(`/calendar/history?start=${start}&end=${end}`);
          setHistoryEvents(historyResponse.data.events ?? []);
        } catch {
          setHistoryEvents([]);
        }
      } else {
        setHistoryEvents([]);
      }
    } catch (error: any) {
      console.error('Error fetching calendar events:', error);
      toast.error('Error al cargar eventos del calendario');
    }
  }, [filters, showHistoryPanel]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const target = isMobileCalendar ? 'listWeek' : 'dayGridMonth';
    if (api.view.type !== target) {
      api.changeView(target);
    }
  }, [isMobileCalendar]);

  const handleDateClick = (arg: any) => {
    const dayEvents = events.filter(
      (e) => e.start === arg.dateStr || e.start.split('T')[0] === arg.dateStr
    );
    if (dayEvents.length > 0) {
      // Show first event or create a summary view
      const firstEvent = dayEvents[0].extendedProps as CalendarEvent;
      setSelectedEvent(firstEvent);
    }
  };

  const handleEventClick = (arg: any) => {
    const event = arg.event.extendedProps as CalendarEvent;
    setSelectedEvent(event);
  };

  const handleViewChange = () => {
    fetchEvents();
  };

  const handleEventStatusUpdate = async (status: 'PAID' | 'RECEIVED' | 'PENDING') => {
    if (!selectedEvent) return;

    try {
      await api.put(`/calendar/events/${selectedEvent.id}/status`, { status });
      toast.success('Estado actualizado exitosamente');
      setSelectedEvent(null);
      fetchEvents();
    } catch (error: any) {
      console.error('Error updating event status:', error);
      toast.error('Error al actualizar estado');
    }
  };

  const handleRefresh = async () => {
    try {
      const calendarApi = calendarRef.current?.getApi();
      if (!calendarApi) return;

      const view = calendarApi.view;
      const start = dateToYmdLocal(view.activeStart);
      const end = dateToYmdLocal(view.activeEnd);

      const res = await api.post(`/calendar/refresh?start=${start}&end=${end}`);
      const n = Number(res.data?.orphansHidden ?? res.data?.orphansPurged ?? 0);
      if (n > 0) {
        toast.success(
          `Eventos actualizados. ${n} evento(s) sin origen activo ya no se muestran en el calendario (siguen en Historial).`
        );
      } else {
        toast.success('Eventos actualizados');
      }
      fetchEvents();
    } catch (error: any) {
      console.error('Error refreshing events:', error);
      toast.error('Error al actualizar eventos');
    }
  };

  const formatCurrency = (amount: number, currency: string = 'DOP') => {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PAID':
      case 'RECEIVED':
        return <CheckCircle className="text-green-400" size={20} />;
      case 'OVERDUE':
        return <AlertCircle className="text-red-400" size={20} />;
      case 'PENDING':
        return <Clock className="text-yellow-400" size={20} />;
      default:
        return null;
    }
  };

  useEscapeKey(!!selectedEvent, () => setSelectedEvent(null));
  useModalFocusTrap(eventDetailModalRef, !!selectedEvent);

  return (
    <div className="w-full max-w-7xl mx-auto py-2 sm:py-4">
      <div className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center justify-center gap-2 sm:justify-start sm:space-x-3 min-w-0 text-center sm:text-left">
            <CalendarIcon className="w-7 h-7 sm:w-8 sm:h-8 text-primary-400 shrink-0" />
            <h1 className="page-title truncate">Calendario Financiero</h1>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={toggleSummaryWidgets}
              className="btn-secondary flex items-center justify-center gap-2 flex-1 sm:flex-initial min-w-0"
              aria-pressed={showSummaryWidgets}
              title={showSummaryWidgets ? 'Ocultar tarjetas de resumen' : 'Mostrar tarjetas de resumen'}
            >
              {showSummaryWidgets ? <EyeOff size={18} /> : <Eye size={18} />}
              <span className="hidden xs:inline">{showSummaryWidgets ? 'Ocultar resumen' : 'Mostrar resumen'}</span>
              <span className="xs:hidden">Resumen</span>
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="btn-secondary flex items-center justify-center gap-2 flex-1 sm:flex-initial min-w-0"
            >
              <Filter size={18} />
              <span>Filtros</span>
            </button>
            <button
              type="button"
              onClick={() => setShowHistoryPanel((v) => !v)}
              className="btn-secondary flex items-center justify-center gap-2 flex-1 sm:flex-initial min-w-0"
              aria-pressed={showHistoryPanel}
              title={
                showHistoryPanel
                  ? 'Ocultar panel de historial archivado'
                  : 'Mostrar historial de eventos archivados (sin origen activo)'
              }
            >
              <History size={18} />
              <span className="hidden xs:inline">{showHistoryPanel ? 'Ocultar historial' : 'Historial'}</span>
              <span className="xs:hidden">Hist.</span>
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="btn-secondary flex items-center justify-center gap-2 flex-1 sm:flex-initial min-w-0"
            >
              <RefreshCw size={18} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* Financial Summary — eventos del rango visible; ingresos solo «Recibido», gastos solo «Pagado» */}
        {showSummaryWidgets && summary && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 space-y-2"
          >
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <TrendingUp className="text-green-400" size={20} />
                  <span className="text-dark-400 text-sm">Ingresos recibidos</span>
                </div>
                <p className="text-white font-semibold text-lg">
                  {formatCurrency(summary.totalIncome, summary.displayCurrency ?? 'DOP')}
                </p>
              </div>
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <TrendingDown className="text-red-400" size={20} />
                  <span className="text-dark-400 text-sm">Gastos pagados</span>
                </div>
                <p className="text-white font-semibold text-lg">
                  {formatCurrency(summary.totalExpenses, summary.displayCurrency ?? 'DOP')}
                </p>
              </div>
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <DollarSign className={summary.balance >= 0 ? 'text-green-400' : 'text-red-400'} size={20} />
                  <span className="text-dark-400 text-sm">Balance</span>
                </div>
                <p className={`font-semibold text-lg ${summary.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(summary.balance, summary.displayCurrency ?? 'DOP')}
                </p>
              </div>
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Clock className="text-yellow-400" size={20} />
                  <span className="text-dark-400 text-sm">Pendientes</span>
                </div>
                <p className="text-white font-semibold text-lg">
                  {formatCurrency(summary.pendingPayments, summary.displayCurrency ?? 'DOP')}
                </p>
                <p className="text-dark-500 text-xs mt-1">Pagos futuros en el período (hoy o después).</p>
              </div>
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertCircle className="text-red-400" size={20} />
                  <span className="text-dark-400 text-sm">Vencidos</span>
                </div>
                <p className="text-red-400 font-semibold text-lg">
                  {formatCurrency(summary.overduePayments, summary.displayCurrency ?? 'DOP')}
                </p>
                <p className="text-dark-500 text-xs mt-1">Estado vencido o pendiente con fecha pasada.</p>
              </div>
            </div>
            <p className="text-dark-500 text-xs px-0.5">
              Suma de eventos del calendario en el rango visible. Montos en DOP; USD se convierte con tu tasa en
              ajustes. No incluye ingresos pendientes de recibir ni gastos aún no pagados en los totales de arriba.
            </p>
          </motion.div>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-dark-700 rounded-lg p-4 mb-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label mb-2">Tipos de Evento</label>
                <div className="space-y-2">
                  {Object.entries(eventTypeLabels).map(([key, label]) => (
                    <label key={key} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.eventTypes.includes(key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFilters({ ...filters, eventTypes: [...filters.eventTypes, key] });
                          } else {
                            setFilters({
                              ...filters,
                              eventTypes: filters.eventTypes.filter((t) => t !== key),
                            });
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-white text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label mb-2">Estados</label>
                <div className="space-y-2">
                  {Object.entries(statusLabels).map(([key, label]) => (
                    <label key={key} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.status.includes(key)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFilters({ ...filters, status: [...filters.status, key] });
                          } else {
                            setFilters({
                              ...filters,
                              status: filters.status.filter((s) => s !== key),
                            });
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-white text-sm">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label mb-2">Opciones</label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showPaid}
                      onChange={(e) => setFilters({ ...filters, showPaid: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-white text-sm">Mostrar pagados/recibidos</span>
                  </label>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {showHistoryPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-dark-750/80 rounded-lg border border-dark-600/60 p-4 mb-6 ring-1 ring-white/[0.04]"
          >
            <h2 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <History className="h-4 w-4 text-dark-400 shrink-0" aria-hidden />
              Historial del calendario (archivados)
            </h2>
            <p className="text-dark-500 text-xs mb-3 leading-relaxed">
              Aquí ves copias de eventos que ya no se muestran en la vista principal porque el ingreso, gasto,
              préstamo o tarjeta de origen se eliminó del sistema, o porque se archivaron al borrar ese origen. Las
              cifras y fechas se conservan solo como referencia.
            </p>
            {historyEvents.length === 0 ? (
              <p className="text-dark-500 text-sm">No hay eventos archivados en el período visible.</p>
            ) : (
              <ul className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {historyEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-col gap-1 rounded-lg border border-dark-600/40 bg-dark-800/60 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-white truncate">{ev.title}</p>
                      <p className="text-dark-500 text-xs">
                        {eventTypeLabels[ev.eventType] ?? ev.eventType} ·{' '}
                        {formatCalendarDateLongEs(ev.eventDate)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:text-right">
                      <span className="text-white tabular-nums">{formatCurrency(ev.amount, ev.currency)}</span>
                      <span className="text-dark-500 text-xs">{statusLabels[ev.status] ?? ev.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </div>

      {/* Calendar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-dark-800 rounded-lg p-4"
      >
        <div className="calendar-container">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={isMobileCalendar ? 'listMonth' : 'dayGridMonth'}
            headerToolbar={
              isMobileCalendar
                ? {
                    left: 'prev,next',
                    center: 'title',
                    right: 'today,listMonth,listWeek,listDay',
                  }
                : {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
                  }
            }
            events={events}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            viewDidMount={handleViewChange}
            datesSet={fetchEvents}
            locale={calendarLocale}
            firstDay={1}
            titleFormat={(arg) => formatCalendarToolbarTitle(arg)}
            dayHeaderFormat={(arg) => formatVerboseToEsDate(arg as VerboseDateArg, { weekday: 'short' })}
            slotLabelFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }}
            eventTimeFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }}
            views={{
              listWeek: {
                listDayFormat: (arg) => formatVerboseToEsDate(arg as VerboseDateArg, { weekday: 'long' }),
                listDaySideFormat: (arg) =>
                  formatVerboseToEsDate(arg as VerboseDateArg, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  }),
              },
              listMonth: {
                listDayFormat: (arg) => formatVerboseToEsDate(arg as VerboseDateArg, { weekday: 'long' }),
                listDaySideFormat: (arg) =>
                  formatVerboseToEsDate(arg as VerboseDateArg, {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  }),
              },
              listDay: {
                listDayFormat: (arg) =>
                  formatVerboseToEsDate(arg as VerboseDateArg, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  }),
                listDaySideFormat: false,
              },
            }}
            height="auto"
            eventDisplay="block"
            dayMaxEvents={3}
            moreLinkClick="popover"
            eventTextColor="#ffffff"
            eventBorderColor="transparent"
          />
        </div>
      </motion.div>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="modal-overlay" onClick={() => setSelectedEvent(null)} role="presentation">
          <motion.div
            ref={eventDetailModalRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 id="calendar-event-title" className="text-xl font-semibold text-white">
                Detalle del Evento
              </h3>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-dark-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-dark-400 text-sm">Título</label>
                <p className="text-white font-medium">{selectedEvent.title}</p>
              </div>
              <div>
                <label className="text-dark-400 text-sm">Tipo</label>
                <p className="text-white">{eventTypeLabels[selectedEvent.eventType]}</p>
              </div>
              <div>
                <label className="text-dark-400 text-sm">Fecha</label>
                <p className="text-white">{formatCalendarDateLongEs(selectedEvent.eventDate)}</p>
              </div>
              <div>
                <label className="text-dark-400 text-sm">Monto</label>
                <p className="text-white font-semibold text-lg">
                  {formatCurrency(selectedEvent.amount, selectedEvent.currency)}
                </p>
              </div>
              <div>
                <label className="text-dark-400 text-sm">Estado</label>
                <div className="flex items-center space-x-2 mt-1">
                  {getStatusIcon(selectedEvent.status)}
                  <span className="text-white">{statusLabels[selectedEvent.status]}</span>
                </div>
              </div>
              {selectedEvent.notes && (
                <div>
                  <label className="text-dark-400 text-sm">Notas</label>
                  <p className="text-white">{selectedEvent.notes}</p>
                </div>
              )}

              <div className="flex space-x-2 pt-4 border-t border-dark-700">
                {selectedEvent.status === 'PENDING' && selectedEvent.eventType !== 'INCOME' && (
                  <button
                    onClick={() => handleEventStatusUpdate('PAID')}
                    className="btn-primary flex-1"
                  >
                    Marcar como Pagado
                  </button>
                )}
                {selectedEvent.status === 'PENDING' && selectedEvent.eventType === 'INCOME' && (
                  <button
                    onClick={() => handleEventStatusUpdate('RECEIVED')}
                    className="btn-primary flex-1"
                  >
                    Marcar como Recibido
                  </button>
                )}
                {(selectedEvent.status === 'PAID' || selectedEvent.status === 'RECEIVED') && (
                  <button
                    onClick={() => handleEventStatusUpdate('PENDING')}
                    className="btn-secondary flex-1"
                  >
                    Marcar como Pendiente
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
