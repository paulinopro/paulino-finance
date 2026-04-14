import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
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
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { CalendarEvent, FinancialSummary } from '../types';

const Calendar: React.FC = () => {
  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    eventTypes: [] as string[],
    status: [] as string[],
    showPaid: true,
  });
  const calendarRef = useRef<FullCalendar>(null);
  const eventDetailModalRef = useRef<HTMLDivElement>(null);
  const isMobileCalendar = useMediaQuery('(max-width: 767px)');

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

  const statusColors: { [key: string]: string } = {
    PENDING: '#f59e0b', // Amarillo
    PAID: '#10b981', // Verde
    RECEIVED: '#10b981', // Verde
    OVERDUE: '#ef4444', // Rojo
    CANCELLED: '#6b7280', // Gris
  };

  useEffect(() => {
    fetchEvents();
  }, [filters]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;
    const target = isMobileCalendar ? 'listWeek' : 'dayGridMonth';
    if (api.view.type !== target) {
      api.changeView(target);
    }
  }, [isMobileCalendar]);

  const fetchEvents = async () => {
    try {
      const calendarApi = calendarRef.current?.getApi();
      if (!calendarApi) return;

      const view = calendarApi.view;
      const start = view.activeStart.toISOString().split('T')[0];
      const end = view.activeEnd.toISOString().split('T')[0];

      // Fetch events
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
        backgroundColor: statusColors[event.status] || event.color,
        borderColor: statusColors[event.status] || event.color,
        textColor: '#ffffff',
        extendedProps: {
          ...event,
        },
      }));
      setEvents(formattedEvents);

      // Fetch summary
      const summaryResponse = await api.get(`/calendar/summary?start=${start}&end=${end}`);
      setSummary(summaryResponse.data.summary);
    } catch (error: any) {
      console.error('Error fetching calendar events:', error);
      toast.error('Error al cargar eventos del calendario');
    }
  };

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
      const start = view.activeStart.toISOString().split('T')[0];
      const end = view.activeEnd.toISOString().split('T')[0];

      await api.post(`/calendar/refresh?start=${start}&end=${end}`);
      toast.success('Eventos actualizados');
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
          <div className="flex items-center gap-2 sm:space-x-3 min-w-0">
            <CalendarIcon className="w-7 h-7 sm:w-8 sm:h-8 text-primary-400 shrink-0" />
            <h1 className="page-title truncate">Calendario Financiero</h1>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
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
              onClick={handleRefresh}
              className="btn-secondary flex items-center justify-center gap-2 flex-1 sm:flex-initial min-w-0"
            >
              <RefreshCw size={18} />
              <span>Actualizar</span>
            </button>
          </div>
        </div>

        {/* Financial Summary */}
        {summary && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6"
          >
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="text-green-400" size={20} />
                <span className="text-dark-400 text-sm">Ingresos</span>
              </div>
              <p className="text-white font-semibold text-lg">
                {formatCurrency(summary.totalIncome)}
              </p>
            </div>
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingDown className="text-red-400" size={20} />
                <span className="text-dark-400 text-sm">Gastos</span>
              </div>
              <p className="text-white font-semibold text-lg">
                {formatCurrency(summary.totalExpenses)}
              </p>
            </div>
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <DollarSign className={summary.balance >= 0 ? 'text-green-400' : 'text-red-400'} size={20} />
                <span className="text-dark-400 text-sm">Balance</span>
              </div>
              <p className={`font-semibold text-lg ${summary.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {formatCurrency(summary.balance)}
              </p>
            </div>
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Clock className="text-yellow-400" size={20} />
                <span className="text-dark-400 text-sm">Pendientes</span>
              </div>
              <p className="text-white font-semibold text-lg">
                {formatCurrency(summary.pendingPayments)}
              </p>
            </div>
            <div className="bg-dark-700 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <AlertCircle className="text-red-400" size={20} />
                <span className="text-dark-400 text-sm">Vencidos</span>
              </div>
              <p className="text-red-400 font-semibold text-lg">
                {formatCurrency(summary.overduePayments)}
              </p>
            </div>
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
            initialView={isMobileCalendar ? 'listWeek' : 'dayGridMonth'}
            headerToolbar={
              isMobileCalendar
                ? {
                    left: 'prev,next',
                    center: 'title',
                    right: 'today,dayGridMonth,listWeek',
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
            locale="es"
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
                <p className="text-white">
                  {new Date(selectedEvent.eventDate).toLocaleDateString('es-DO', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
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
