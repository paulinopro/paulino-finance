import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import enLocale from '@fullcalendar/core/locales/en-gb';
import deLocale from '@fullcalendar/core/locales/de';
import type { LocaleInput } from '@fullcalendar/core';
import {
  Calendar as CalendarIcon,
  CalendarRange,
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
import {
  dateToYmdLocal,
  formatCalendarDateLongEs,
  formatDateForInput,
  getCalendarMonthBoundsYmd,
  inclusiveCalendarDaysBetween,
  todayYmdLocal,
  calendarDateToSortableMs,
} from '../utils/dateUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';
import { CalendarEvent, FinancialSummary } from '../types';
import CalendarPeriodDetailTable from '../components/CalendarPeriodDetailTable';
import {
  CALENDAR_DETAIL_EXPENSE_TYPES,
  PERIOD_ROW_BORDER_COLOR,
  compareCalendarEventsForPeriod,
} from '../utils/calendarPeriodEffective';

function capitalizeUi(s: string, localeTag: string): string {
  if (!s) return s;
  return s.charAt(0).toLocaleUpperCase(localeTag) + s.slice(1);
}

function isMonthlyFrequencyTag(f?: string | null): boolean {
  if (!f) return false;
  return String(f).trim().toLowerCase() === 'monthly';
}

/** Variable + recurrente mensual: mismo criterio que Gastos/Ingresos al marcar pagado/cobrado. */
function calendarNeedsVariablePeriodAmount(ev: CalendarEvent, nextStatus: 'PAID' | 'RECEIVED'): boolean {
  if (
    ev.sourceNature !== 'variable' ||
    ev.sourceRecurrenceType !== 'recurrent' ||
    !isMonthlyFrequencyTag(ev.sourceFrequency)
  ) {
    return false;
  }
  if (nextStatus === 'PAID' && ev.eventType === 'RECURRING_EXPENSE') return true;
  if (nextStatus === 'RECEIVED' && ev.eventType === 'INCOME' && ev.isRecurring) return true;
  return false;
}

type VerboseDateArg = { date: { year: number; month: number; day: number } };

function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/**
 * Título del toolbar: primera letra en mayúscula (es-DO).
 * FullCalendar usa `end` exclusivo en el rango visible; lo convertimos al último día inclusivo.
 */
function formatCalendarToolbarTitle(
  arg: {
    start: { year: number; month: number; day: number };
    end?: { year: number; month: number; day: number };
  },
  localeTag: string
): string {
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
    return capitalizeUi(
      s.toLocaleDateString(localeTag, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      localeTag
    );
  }

  const sameMonth =
    s.getFullYear() === endInclusive.getFullYear() && s.getMonth() === endInclusive.getMonth();

  const spansFullMonth =
    sameMonth &&
    s.getDate() === 1 &&
    endInclusive.getDate() === lastDayOfMonth(endInclusive.getFullYear(), endInclusive.getMonth());

  if (spansFullMonth) {
    return capitalizeUi(s.toLocaleDateString(localeTag, { month: 'long', year: 'numeric' }), localeTag);
  }

  if (sameMonth) {
    const mid = localeTag.startsWith('es')
      ? `${s.getDate()} – ${endInclusive.getDate()} de ${s.toLocaleDateString(localeTag, { month: 'long' })} de ${s.getFullYear()}`
      : `${s.toLocaleDateString(localeTag, { day: 'numeric', month: 'long' })} – ${endInclusive.toLocaleDateString(localeTag, {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}`;
    return capitalizeUi(mid, localeTag);
  }

  const fmt = new Intl.DateTimeFormat(localeTag, { day: 'numeric', month: 'long', year: 'numeric' });
  return capitalizeUi(`${fmt.format(s)} – ${fmt.format(endInclusive)}`, localeTag);
}

function formatVerboseUiDate(verboseArg: VerboseDateArg, options: Intl.DateTimeFormatOptions, localeTag: string): string {
  const { year, month, day } = verboseArg.date;
  const d = new Date(year, month, day);
  return capitalizeUi(d.toLocaleDateString(localeTag, options), localeTag);
}

const CALENDAR_STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  PAID: '#10b981',
  RECEIVED: '#10b981',
  OVERDUE: '#ef4444',
  CANCELLED: '#6b7280',
};

const MAX_CUSTOM_PERIOD_DAYS = 731;

type CalendarPeriodPreset = 'month' | 'week' | 'day' | 'custom';

type PresentationMode = 'calendar' | 'agenda';

/** Rango lógico del FullCalendar (`current*`); `currentEnd` es exclusivo → último día inclusivo para API. */
function fullCalendarLogicRangeToInclusiveYmd(view: { currentStart: Date; currentEnd: Date }) {
  const startYmd = dateToYmdLocal(view.currentStart);
  const endExclusiveCopy = new Date(view.currentEnd);
  endExclusiveCopy.setDate(endExclusiveCopy.getDate() - 1);
  const endYmd = dateToYmdLocal(endExclusiveCopy);
  return { startYmd, endYmd };
}

function presetToFcViewName(
  preset: Exclude<CalendarPeriodPreset, 'custom'>,
  presentation: PresentationMode
): string {
  if (presentation === 'calendar') {
    if (preset === 'month') return 'dayGridMonth';
    if (preset === 'week') return 'timeGridWeek';
    return 'timeGridDay';
  }
  if (preset === 'month') return 'listMonth';
  if (preset === 'week') return 'listWeek';
  return 'listDay';
}

const CALENDAR_PERIOD_PRESETS: CalendarPeriodPreset[] = ['month', 'week', 'day', 'custom'];
const PERIOD_PRESETS_NO_CUSTOM: Exclude<CalendarPeriodPreset, 'custom'>[] = ['month', 'week', 'day'];

const Calendar: React.FC = () => {
  const { t } = useTranslation();
  const { formatCurrency: fc, localeTag, primaryCurrency } = useIntlFormatting();
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
  const periodAmountModalRef = useRef<HTMLDivElement>(null);
  const [periodAmountModal, setPeriodAmountModal] = useState<{
    ev: CalendarEvent;
    targetStatus: 'PAID' | 'RECEIVED';
  } | null>(null);
  const [periodAmountInput, setPeriodAmountInput] = useState('');
  const isMobileCalendar = useMediaQuery('(max-width: 767px)');
  const [periodPreset, setPeriodPreset] = useState<CalendarPeriodPreset>('month');
  const [customApplied, setCustomApplied] = useState<{ startYmd: string; endYmd: string } | null>(null);
  const [customDraftStart, setCustomDraftStart] = useState('');
  const [customDraftEnd, setCustomDraftEnd] = useState('');
  const [presentationMode, setPresentationMode] = useState<PresentationMode>('calendar');

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

  const [showPeriodDetailTables, setShowPeriodDetailTables] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('pf:calendar:showPeriodDetail') !== 'false';
    } catch {
      return true;
    }
  });

  const togglePeriodDetailTables = () => {
    setShowPeriodDetailTables((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('pf:calendar:showPeriodDetail', next ? 'true' : 'false');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const eventTypeLabels = useMemo(
    () => ({
      CARD_PAYMENT: t('pages.calendarEventTypes.CARD_PAYMENT'),
      LOAN_PAYMENT: t('pages.calendarEventTypes.LOAN_PAYMENT'),
      INCOME: t('pages.calendarEventTypes.INCOME'),
      EXPENSE: t('pages.calendarEventTypes.EXPENSE'),
      RECURRING_EXPENSE: t('pages.calendarEventTypes.RECURRING_EXPENSE'),
    }),
    [t]
  );

  const statusLabels = useMemo(
    () => ({
      PENDING: t('pages.calendarStatuses.PENDING'),
      PAID: t('pages.calendarStatuses.PAID'),
      RECEIVED: t('pages.calendarStatuses.RECEIVED'),
      OVERDUE: t('pages.calendarStatuses.OVERDUE'),
      CANCELLED: t('pages.calendarStatuses.CANCELLED'),
    }),
    [t]
  );

  const periodTableToday = dateToYmdLocal(new Date());
  const { periodIncomeSorted, periodExpenseSorted } = useMemo(() => {
    const parsed = events.map((e) => e.extendedProps as CalendarEvent).filter(Boolean);
    const income = parsed.filter((ev) => ev.eventType === 'INCOME').sort(compareCalendarEventsForPeriod);
    const expense = parsed
      .filter((ev) => CALENDAR_DETAIL_EXPENSE_TYPES.has(ev.eventType))
      .sort(compareCalendarEventsForPeriod);
    return { periodIncomeSorted: income, periodExpenseSorted: expense };
  }, [events]);

  /** Locale FC: navegación + etiquetas de vista según Calendario (rejilla/tiempo) o Agenda (lista). */
  const calendarLocale = useMemo<LocaleInput>(() => {
    const fcToday = t('pages.calendar.fcToday');
    const prev = t('pages.calendar.fcPrev');
    const next = t('pages.calendar.fcNext');
    const lbl = (presetK: Exclude<CalendarPeriodPreset, 'custom'>) =>
      t(`pages.calendar.periodPreset.${presetK}` as const);

    const stripListAndPatch = (base: LocaleInput) => {
      const bt = { ...(base.buttonText ?? {}) } as Record<string, string>;
      delete bt.list;
      return {
        ...base,
        buttonText: {
          ...bt,
          prev,
          next,
          today: fcToday,
          ...(presentationMode === 'calendar'
            ? {
                dayGridMonth: lbl('month'),
                timeGridWeek: lbl('week'),
                timeGridDay: lbl('day'),
              }
            : {
                listMonth: t('pages.calendar.fcListMonth'),
                listWeek: t('pages.calendar.fcListWeek'),
                listDay: t('pages.calendar.fcListDay'),
              }),
        },
      };
    };
    if (localeTag.startsWith('de')) return stripListAndPatch(deLocale);
    if (localeTag.startsWith('en')) return stripListAndPatch(enLocale);
    return stripListAndPatch(esLocale);
  }, [localeTag, presentationMode, t]);

  const fcViews = useMemo(() => {
    const formatListWeekDay = (arg: VerboseDateArg) =>
      formatVerboseUiDate(arg, { weekday: 'long' }, localeTag);
    const formatListSideFull = (arg: VerboseDateArg) =>
      formatVerboseUiDate(
        arg,
        {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        },
        localeTag
      );
    const formatListDayHeader = (arg: VerboseDateArg) =>
      formatVerboseUiDate(
        arg,
        {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        },
        localeTag
      );

    const base = {
      listWeek: {
        listDayFormat: formatListWeekDay,
        listDaySideFormat: formatListSideFull,
      },
      listMonth: {
        listDayFormat: formatListWeekDay,
        listDaySideFormat: formatListSideFull,
      },
      listDay: {
        listDayFormat: formatListDayHeader,
        listDaySideFormat: undefined,
      },
    };

    const hasCustomAgendaRange =
      presentationMode === 'agenda' &&
      periodPreset === 'custom' &&
      customApplied &&
      inclusiveCalendarDaysBetween(customApplied.startYmd, customApplied.endYmd) >= 1;

    if (!hasCustomAgendaRange) return base;

    const spanDays = Math.min(
      MAX_CUSTOM_PERIOD_DAYS,
      inclusiveCalendarDaysBetween(customApplied!.startYmd, customApplied!.endYmd)
    );

    return {
      ...base,
      customAgendaRange: {
        type: 'list' as const,
        duration: { days: spanDays },
        listDayFormat: formatListWeekDay,
        listDaySideFormat: formatListSideFull,
      },
    };
  }, [customApplied, localeTag, periodPreset, presentationMode]);

  const fetchEvents = useCallback(async () => {
    try {
      const calendarApi = calendarRef.current?.getApi();
      if (!calendarApi) return;

      const view = calendarApi.view;
      const { startYmd: start, endYmd: end } = fullCalendarLogicRangeToInclusiveYmd(view);

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
      toast.error(t('toast.calendar.loadEventsError'));
    }
  }, [filters, showHistoryPanel, t]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (!api) return;

    if (presentationMode === 'agenda' && periodPreset === 'custom' && customApplied) {
      if (api.view.type !== 'customAgendaRange') {
        api.changeView('customAgendaRange', customApplied.startYmd);
      }
      return;
    }

    if (periodPreset === 'custom') return;

    const want = presetToFcViewName(periodPreset, presentationMode);
    if (api.view.type !== want) api.changeView(want);
  }, [presentationMode, periodPreset, customApplied]);

  const handlePresentationSelect = (mode: PresentationMode) => {
    setPresentationMode(mode);
    if (mode === 'calendar' && periodPreset === 'custom') {
      setPeriodPreset('month');
      setCustomApplied(null);
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

  const submitCalendarStatusUpdate = async (
    ev: CalendarEvent,
    status: 'PAID' | 'RECEIVED' | 'PENDING',
    actualAmount?: number
  ) => {
    try {
      const body: { status: string; actualAmount?: number } = { status };
      if (actualAmount != null && (status === 'PAID' || status === 'RECEIVED')) {
        body.actualAmount = actualAmount;
      }
      await api.put(`/calendar/events/${ev.id}/status`, body);
      toast.success(t('toast.calendar.statusUpdated'));
      setSelectedEvent(null);
      setPeriodAmountModal(null);
      fetchEvents();
    } catch (error: any) {
      console.error('Error updating event status:', error);
      const msg = error.response?.data?.message;
      toast.error(msg || t('toast.calendar.statusUpdateError'));
    }
  };

  const handleEventStatusUpdate = async (status: 'PAID' | 'RECEIVED' | 'PENDING') => {
    if (!selectedEvent) return;

    if (status === 'PAID' && calendarNeedsVariablePeriodAmount(selectedEvent, 'PAID')) {
      setPeriodAmountModal({ ev: selectedEvent, targetStatus: 'PAID' });
      setPeriodAmountInput(String(selectedEvent.amount));
      return;
    }
    if (status === 'RECEIVED' && calendarNeedsVariablePeriodAmount(selectedEvent, 'RECEIVED')) {
      setPeriodAmountModal({ ev: selectedEvent, targetStatus: 'RECEIVED' });
      setPeriodAmountInput(String(selectedEvent.amount));
      return;
    }

    await submitCalendarStatusUpdate(selectedEvent, status);
  };

  const seedCustomRangeFromAnchor = useCallback((): { startYmd: string; endYmd: string } => {
    const api = calendarRef.current?.getApi();
    return api != null
      ? fullCalendarLogicRangeToInclusiveYmd(api.view)
      : getCalendarMonthBoundsYmd(todayYmdLocal());
  }, []);

  /** Agenda + período libre sin depender del estado asíncrono de `presentationMode`. */
  const openAgendaCustomPeriod = useCallback(() => {
    const seed = seedCustomRangeFromAnchor();
    setPresentationMode('agenda');
    setPeriodPreset('custom');
    setCustomDraftStart(seed.startYmd);
    setCustomDraftEnd(seed.endYmd);
    setCustomApplied(seed);
  }, [seedCustomRangeFromAnchor]);

  const handleRefresh = async () => {
    try {
      const calendarApi = calendarRef.current?.getApi();
      if (!calendarApi) return;

      const view = calendarApi.view;
      const { startYmd: start, endYmd: end } = fullCalendarLogicRangeToInclusiveYmd(view);

      const res = await api.post(`/calendar/refresh?start=${start}&end=${end}`);
      const n = Number(res.data?.orphansHidden ?? res.data?.orphansPurged ?? 0);
      if (n > 0) {
        toast.success(t('toast.calendar.eventsUpdatedWithHidden', { count: n }));
      } else {
        toast.success(t('toast.calendar.eventsUpdated'));
      }
      fetchEvents();
    } catch (error: any) {
      console.error('Error refreshing events:', error);
      toast.error(t('toast.calendar.refreshError'));
    }
  };

  const handlePresetSelect = (preset: CalendarPeriodPreset) => {
    if (preset === 'custom') {
      if (presentationMode !== 'agenda') return;
      setPeriodPreset('custom');
      const seed = seedCustomRangeFromAnchor();
      setCustomDraftStart(seed.startYmd);
      setCustomDraftEnd(seed.endYmd);
      setCustomApplied(seed);
      return;
    }
    setPeriodPreset(preset);
    setCustomApplied(null);
  };

  const handleApplyCustomRange = () => {
    if (presentationMode !== 'agenda') return;
    const s = formatDateForInput(customDraftStart);
    const e = formatDateForInput(customDraftEnd);
    if (!s || !e) {
      toast.error(t('toast.calendar.customRangeInvalid'));
      return;
    }
    if (calendarDateToSortableMs(e) < calendarDateToSortableMs(s)) {
      toast.error(t('toast.calendar.customRangeInvalid'));
      return;
    }
    const days = inclusiveCalendarDaysBetween(s, e);
    if (days <= 0) {
      toast.error(t('toast.calendar.customRangeInvalid'));
      return;
    }
    if (days > MAX_CUSTOM_PERIOD_DAYS) {
      toast.error(t('toast.calendar.customRangeTooLong', { max: MAX_CUSTOM_PERIOD_DAYS }));
      return;
    }
    setCustomApplied({ startYmd: s, endYmd: e });
    setPeriodPreset('custom');
  };

  const fcMountKey =
    presentationMode === 'agenda' && periodPreset === 'custom' && customApplied
      ? `ca:${customApplied.startYmd}:${customApplied.endYmd}`
      : `p:${presentationMode}:${periodPreset}`;

  const initialFcViewName = (() => {
    if (presentationMode === 'agenda' && periodPreset === 'custom' && customApplied) {
      return 'customAgendaRange';
    }
    const p =
      periodPreset === 'month'
        ? 'month'
        : periodPreset === 'week'
          ? 'week'
          : periodPreset === 'day'
            ? 'day'
            : 'month';
    return presetToFcViewName(p, presentationMode);
  })();

  const headerToolbarRight =
    presentationMode === 'calendar'
      ? 'dayGridMonth,timeGridWeek,timeGridDay'
      : periodPreset === 'custom' && customApplied
        ? ''
        : 'listMonth,listWeek,listDay';

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

  useEscapeKey(!!periodAmountModal, () => setPeriodAmountModal(null));
  useEscapeKey(!!selectedEvent && !periodAmountModal, () => setSelectedEvent(null));
  useModalFocusTrap(eventDetailModalRef, !!selectedEvent && !periodAmountModal);
  useModalFocusTrap(periodAmountModalRef, !!periodAmountModal);

  return (
    <div className="w-full max-w-7xl mx-auto py-2 sm:py-4">
      <div className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="flex items-center justify-center gap-2 sm:justify-start sm:space-x-3 min-w-0 text-center sm:text-left">
            <CalendarIcon className="w-7 h-7 sm:w-8 sm:h-8 text-primary-400 shrink-0" />
            <h1 className="page-title truncate">{t('pages.calendar.title')}</h1>
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={toggleSummaryWidgets}
              className="btn-secondary flex items-center justify-center gap-0 md:gap-2 max-md:px-3 flex-1 sm:flex-initial min-w-0"
              aria-pressed={showSummaryWidgets}
              aria-label={
                showSummaryWidgets ? t('pages.calendar.hideSummaryCards') : t('pages.calendar.showSummaryCards')
              }
              title={
                showSummaryWidgets ? t('pages.calendar.hideSummaryCards') : t('pages.calendar.showSummaryCards')
              }
            >
              {showSummaryWidgets ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              <span className="hidden md:inline">
                {showSummaryWidgets ? t('pages.calendar.hideSummaryShort') : t('pages.calendar.showSummaryShort')}
              </span>
            </button>
            <button
              type="button"
              onClick={togglePeriodDetailTables}
              className="btn-secondary flex items-center justify-center gap-0 md:gap-2 max-md:px-3 flex-1 sm:flex-initial min-w-0"
              aria-pressed={showPeriodDetailTables}
              aria-label={
                showPeriodDetailTables
                  ? t('pages.calendar.hidePeriodDetailCards')
                  : t('pages.calendar.showPeriodDetailCards')
              }
              title={
                showPeriodDetailTables
                  ? t('pages.calendar.hidePeriodDetailCards')
                  : t('pages.calendar.showPeriodDetailCards')
              }
            >
              {showPeriodDetailTables ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              <span className="hidden md:inline">
                {showPeriodDetailTables
                  ? t('pages.calendar.hidePeriodDetailShort')
                  : t('pages.calendar.showPeriodDetailShort')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="btn-secondary flex items-center justify-center gap-0 md:gap-2 max-md:px-3 flex-1 sm:flex-initial min-w-0"
              aria-expanded={showFilters}
              aria-label={t('pages.calendar.filters')}
              title={t('pages.calendar.filters')}
            >
              <Filter size={18} aria-hidden />
              <span className="hidden md:inline">{t('pages.calendar.filters')}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowHistoryPanel((v) => !v)}
              className="btn-secondary flex items-center justify-center gap-0 md:gap-2 max-md:px-3 flex-1 sm:flex-initial min-w-0"
              aria-pressed={showHistoryPanel}
              aria-label={
                showHistoryPanel ? t('pages.calendar.hideHistoryPanel') : t('pages.calendar.showHistoryPanel')
              }
              title={
                showHistoryPanel ? t('pages.calendar.hideHistoryPanel') : t('pages.calendar.showHistoryPanel')
              }
            >
              <History size={18} aria-hidden />
              <span className="hidden md:inline">
                {showHistoryPanel ? t('pages.calendar.hideHistoryShort') : t('pages.calendar.historyShort')}
              </span>
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="btn-secondary flex items-center justify-center gap-0 md:gap-2 max-md:px-3 flex-1 sm:flex-initial min-w-0"
              aria-label={t('pages.calendar.refresh')}
              title={t('pages.calendar.refresh')}
            >
              <RefreshCw size={18} aria-hidden />
              <span className="hidden md:inline">{t('pages.calendar.refresh')}</span>
            </button>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-dark-700/80 bg-dark-750/80 p-4 sm:p-5 mb-6 ring-1 ring-white/[0.06] shadow-sm flex flex-col gap-5"
        >
          <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-center md:gap-x-5 lg:gap-x-7 xl:gap-x-10">
            <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-dark-400 text-sm font-medium whitespace-nowrap shrink-0">
                {t('pages.calendar.presentationLabel')}
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('pages.calendar.presentationLabel')}>
                <button
                  type="button"
                  onClick={() => handlePresentationSelect('calendar')}
                  aria-pressed={presentationMode === 'calendar'}
                  className={`btn-secondary text-sm px-3 py-2 ${
                    presentationMode === 'calendar'
                      ? 'ring-2 ring-primary-400 ring-offset-2 ring-offset-transparent'
                      : ''
                  }`}
                >
                  {t('pages.calendar.presentationCalendar')}
                </button>
                <button
                  type="button"
                  onClick={() => handlePresentationSelect('agenda')}
                  aria-pressed={presentationMode === 'agenda'}
                  className={`btn-secondary text-sm px-3 py-2 ${
                    presentationMode === 'agenda'
                      ? 'ring-2 ring-primary-400 ring-offset-2 ring-offset-transparent'
                      : ''
                  }`}
                >
                  {t('pages.calendar.presentationAgenda')}
                </button>
              </div>
            </div>

            <div
              className="hidden md:block w-px min-h-[2.25rem] shrink-0 self-center bg-dark-600/60"
              aria-hidden
            />

            <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-2 md:flex-1 md:min-w-[14rem]">
              <span className="text-dark-400 text-sm font-medium whitespace-nowrap shrink-0">
                {t('pages.calendar.periodModeLabel')}
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('pages.calendar.periodModeLabel')}>
                {(presentationMode === 'agenda'
                  ? CALENDAR_PERIOD_PRESETS
                  : (PERIOD_PRESETS_NO_CUSTOM as readonly CalendarPeriodPreset[])
                ).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePresetSelect(p)}
                    aria-pressed={periodPreset === p}
                    className={`btn-secondary text-sm px-3 py-2 inline-flex items-center gap-2 ${
                      periodPreset === p ? 'ring-2 ring-primary-400 ring-offset-2 ring-offset-transparent' : ''
                    }`}
                  >
                    {p === 'custom' ? (
                      <>
                        <CalendarRange className="w-4 h-4 shrink-0 text-primary-400" aria-hidden />
                        <span>{t('pages.calendar.periodPreset.custom')}</span>
                      </>
                    ) : (
                      t(`pages.calendar.periodPreset.${p}`)
                    )}
                  </button>
                ))}
              </div>
            </div>

            {presentationMode === 'calendar' && (
              <>
                <div
                  className="hidden md:block w-px min-h-[2.25rem] shrink-0 self-center bg-dark-600/60"
                  aria-hidden
                />
                <div className="hidden md:flex flex-row flex-wrap items-center gap-3 flex-1 min-w-[min(100%,22rem)] max-w-xl">
                  <CalendarRange className="w-4 h-4 text-dark-500 shrink-0 mt-0.5" aria-hidden />
                  <p className="text-dark-400 text-xs sm:text-sm leading-snug flex-1 min-w-[12rem]">
                    {t('pages.calendar.customOnlyInAgendaLead')}
                  </p>
                  <button
                    type="button"
                    className="btn-secondary text-xs sm:text-sm px-3 py-2 shrink-0 whitespace-nowrap"
                    onClick={openAgendaCustomPeriod}
                  >
                    {t('pages.calendar.switchToAgendaCustom')}
                  </button>
                </div>
              </>
            )}
          </div>

          {presentationMode === 'agenda' && (
            <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-start md:gap-x-10">
              <p className="text-dark-500 text-xs leading-relaxed max-w-prose md:max-w-md">
                {t('pages.calendar.periodAgendaSubtitle')}
              </p>
              {periodPreset !== 'custom' && (
                <p className="text-dark-500 text-xs leading-relaxed max-w-prose md:max-w-sm">
                  {t('pages.calendar.customChipHint')}
                </p>
              )}
            </div>
          )}

          {presentationMode === 'agenda' && periodPreset === 'custom' && (
            <motion.div
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.2 }}
              className="rounded-lg border border-dark-600/55 bg-dark-800/60 p-4 sm:p-4 ring-1 ring-white/[0.04]"
            >
              <div className="flex items-start gap-3 mb-4">
                <CalendarRange className="w-5 h-5 text-primary-400 shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{t('pages.calendar.customRangeSectionTitle')}</p>
                  <p className="text-dark-500 text-xs mt-1 leading-relaxed">{t('pages.calendar.customRangePanelLead', { max: MAX_CUSTOM_PERIOD_DAYS })}</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:items-end">
                <div className="min-w-[10rem] flex-1 sm:flex-initial sm:max-w-[12rem]">
                  <label className="label mb-2" htmlFor="pf-cal-custom-start">
                    {t('pages.calendar.customRangeStart')}
                  </label>
                  <input
                    id="pf-cal-custom-start"
                    type="date"
                    value={customDraftStart}
                    onChange={(e) => setCustomDraftStart(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <div className="min-w-[10rem] flex-1 sm:flex-initial sm:max-w-[12rem]">
                  <label className="label mb-2" htmlFor="pf-cal-custom-end">
                    {t('pages.calendar.customRangeEnd')}
                  </label>
                  <input
                    id="pf-cal-custom-end"
                    type="date"
                    value={customDraftEnd}
                    onChange={(e) => setCustomDraftEnd(e.target.value)}
                    className="input w-full"
                  />
                </div>
                <button type="button" className="btn-primary w-full sm:w-auto shrink-0" onClick={handleApplyCustomRange}>
                  {t('pages.calendar.customRangeApply')}
                </button>
              </div>
              <p className="text-dark-500 text-xs mt-4 leading-relaxed border-t border-dark-600/50 pt-3">
                {t('pages.calendar.customRangeHint', { max: MAX_CUSTOM_PERIOD_DAYS })}
              </p>
            </motion.div>
          )}

          {presentationMode === 'calendar' && (
            <div className="md:hidden flex gap-3 items-start rounded-lg border border-dark-600/45 bg-dark-800/35 p-3 sm:p-4 ring-1 ring-white/[0.03]">
              <CalendarRange className="w-5 h-5 text-dark-500 shrink-0 mt-1" aria-hidden />
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-dark-400 text-sm leading-relaxed">{t('pages.calendar.customOnlyInAgendaLead')}</p>
                <button type="button" className="btn-secondary text-sm inline-flex items-center gap-2 px-3 py-2" onClick={openAgendaCustomPeriod}>
                  <CalendarRange className="w-4 h-4 text-primary-400 shrink-0" aria-hidden />
                  {t('pages.calendar.switchToAgendaCustom')}
                </button>
              </div>
            </div>
          )}
        </motion.div>

        {/* Financial Summary — período seleccionado; ingresos solo «Recibido», gastos solo «Pagado» */}
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
                  <span className="text-dark-400 text-sm">{t('pages.calendar.summaryIncome')}</span>
                </div>
                <p className="text-white font-semibold text-lg">
                  {fc(summary.totalIncome, summary.displayCurrency ?? primaryCurrency)}
                </p>
              </div>
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <TrendingDown className="text-red-400" size={20} />
                  <span className="text-dark-400 text-sm">{t('pages.calendar.summaryExpenses')}</span>
                </div>
                <p className="text-white font-semibold text-lg">
                  {fc(summary.totalExpenses, summary.displayCurrency ?? primaryCurrency)}
                </p>
              </div>
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <DollarSign className={summary.balance >= 0 ? 'text-green-400' : 'text-red-400'} size={20} />
                  <span className="text-dark-400 text-sm">{t('pages.calendar.summaryBalance')}</span>
                </div>
                <p className={`font-semibold text-lg ${summary.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {fc(summary.balance, summary.displayCurrency ?? primaryCurrency)}
                </p>
              </div>
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <Clock className="text-yellow-400" size={20} />
                  <span className="text-dark-400 text-sm">{t('pages.calendar.summaryPending')}</span>
                </div>
                <p className="text-white font-semibold text-lg">
                  {fc(summary.pendingPayments, summary.displayCurrency ?? primaryCurrency)}
                </p>
                <p className="text-dark-500 text-xs mt-1">{t('pages.calendar.summaryPendingHint')}</p>
              </div>
              <div className="bg-dark-700 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-2">
                  <AlertCircle className="text-red-400" size={20} />
                  <span className="text-dark-400 text-sm">{t('pages.calendar.summaryOverdue')}</span>
                </div>
                <p className="text-red-400 font-semibold text-lg">
                  {fc(summary.overduePayments, summary.displayCurrency ?? primaryCurrency)}
                </p>
                <p className="text-dark-500 text-xs mt-1">{t('pages.calendar.summaryOverdueHint')}</p>
              </div>
            </div>
            <p className="text-dark-500 text-xs px-0.5">{t('pages.calendar.summaryFootnote')}</p>
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
                <label className="label mb-2">{t('pages.calendar.filtersEventTypes')}</label>
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
                <label className="label mb-2">{t('pages.calendar.filtersStatuses')}</label>
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
                <label className="label mb-2">{t('pages.calendar.filtersOptions')}</label>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.showPaid}
                      onChange={(e) => setFilters({ ...filters, showPaid: e.target.checked })}
                      className="rounded"
                    />
                    <span className="text-white text-sm">{t('pages.calendar.showPaidReceived')}</span>
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
              {t('pages.calendar.historyHeading')}
            </h2>
            <p className="text-dark-500 text-xs mb-3 leading-relaxed">{t('pages.calendar.historyIntro')}</p>
            {historyEvents.length === 0 ? (
              <p className="text-dark-500 text-sm">{t('pages.calendar.historyEmpty')}</p>
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
                        {formatCalendarDateLongEs(ev.eventDate, localeTag)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 sm:text-right">
                      <span className="text-white tabular-nums">{fc(ev.amount, ev.currency)}</span>
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
            key={fcMountKey}
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView={initialFcViewName}
            {...(presentationMode === 'agenda' && periodPreset === 'custom' && customApplied
              ? { initialDate: customApplied.startYmd }
              : {})}
            headerToolbar={{
              left: isMobileCalendar ? 'prev,next' : 'prev,next today',
              center: 'title',
              right: headerToolbarRight,
            }}
            events={events}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            viewDidMount={handleViewChange}
            datesSet={fetchEvents}
            locale={calendarLocale}
            views={fcViews}
            firstDay={1}
            titleFormat={(arg) => formatCalendarToolbarTitle(arg, localeTag)}
            dayHeaderFormat={(arg) => formatVerboseUiDate(arg as VerboseDateArg, { weekday: 'short' }, localeTag)}
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
            height="auto"
            eventDisplay="block"
            dayMaxEvents={3}
            moreLinkClick="popover"
            eventTextColor="#ffffff"
            eventBorderColor="transparent"
          />
        </div>
      </motion.div>

      {showPeriodDetailTables && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 space-y-4 w-full"
        >
          <p className="text-dark-500 text-xs px-0.5">{t('pages.calendar.periodDetailHint')}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-dark-600 bg-dark-800/60 px-3 py-2.5">
            <span className="text-xs font-medium text-dark-300">{t('pages.calendar.periodDetailLegendTitle')}</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-dark-400">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: PERIOD_ROW_BORDER_COLOR.paid }} aria-hidden />
              {t('pages.calendar.periodDetailLegendSettled')}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-dark-400">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: PERIOD_ROW_BORDER_COLOR.overdue }} aria-hidden />
              {t('pages.calendar.periodDetailLegendOverdue')}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-dark-400">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: PERIOD_ROW_BORDER_COLOR.pending }} aria-hidden />
              {t('pages.calendar.periodDetailLegendPending')}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-dark-400">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: PERIOD_ROW_BORDER_COLOR.cancelled }} aria-hidden />
              {t('pages.calendar.periodDetailLegendCancelled')}
            </span>
          </div>

          <div className="flex flex-col gap-6 w-full">
            <CalendarPeriodDetailTable
              persistenceKeySuffix="income"
              variant="income"
              heading={
                <>
                  <TrendingUp className="text-green-400 shrink-0" size={22} aria-hidden />
                  <span className="text-xl font-semibold text-white">{t('pages.calendar.periodIncomeListTitle')}</span>
                </>
              }
              sourceEvents={periodIncomeSorted}
              todayYmd={periodTableToday}
              emptyLabel={t('pages.calendar.periodDetailEmptyIncome')}
              eventTypeLabels={eventTypeLabels}
            />

            <CalendarPeriodDetailTable
              persistenceKeySuffix="expense"
              variant="expense"
              heading={
                <>
                  <TrendingDown className="text-red-400 shrink-0" size={22} aria-hidden />
                  <span className="text-xl font-semibold text-white">
                    {t('pages.calendar.periodExpenseListTitle')}
                  </span>
                </>
              }
              sourceEvents={periodExpenseSorted}
              todayYmd={periodTableToday}
              emptyLabel={t('pages.calendar.periodDetailEmptyExpense')}
              eventTypeLabels={eventTypeLabels}
            />
          </div>
        </motion.div>
      )}

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
                {t('pages.calendar.eventDetailTitle')}
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
                <label className="text-dark-400 text-sm">{t('pages.calendar.fieldTitle')}</label>
                <p className="text-white font-medium">{selectedEvent.title}</p>
              </div>
              <div>
                <label className="text-dark-400 text-sm">{t('pages.calendar.fieldType')}</label>
                <p className="text-white">{eventTypeLabels[selectedEvent.eventType]}</p>
              </div>
              <div>
                <label className="text-dark-400 text-sm">{t('pages.calendar.fieldDate')}</label>
                <p className="text-white">{formatCalendarDateLongEs(selectedEvent.eventDate, localeTag)}</p>
              </div>
              <div>
                <label className="text-dark-400 text-sm">{t('pages.calendar.fieldAmount')}</label>
                <p className="text-white font-semibold text-lg">
                  {fc(selectedEvent.amount, selectedEvent.currency)}
                </p>
              </div>
              <div>
                <label className="text-dark-400 text-sm">{t('pages.calendar.fieldStatus')}</label>
                <div className="flex items-center space-x-2 mt-1">
                  {getStatusIcon(selectedEvent.status)}
                  <span className="text-white">{statusLabels[selectedEvent.status]}</span>
                </div>
              </div>
              {selectedEvent.notes && (
                <div>
                  <label className="text-dark-400 text-sm">{t('pages.calendar.fieldNotes')}</label>
                  <p className="text-white">{selectedEvent.notes}</p>
                </div>
              )}

              <div className="flex space-x-2 pt-4 border-t border-dark-700">
                {selectedEvent.status === 'PENDING' && selectedEvent.eventType !== 'INCOME' && (
                  <button
                    onClick={() => handleEventStatusUpdate('PAID')}
                    className="btn-primary flex-1"
                  >
                    {t('pages.calendar.markAsPaid')}
                  </button>
                )}
                {selectedEvent.status === 'PENDING' && selectedEvent.eventType === 'INCOME' && (
                  <button
                    onClick={() => handleEventStatusUpdate('RECEIVED')}
                    className="btn-primary flex-1"
                  >
                    {t('pages.calendar.markAsReceived')}
                  </button>
                )}
                {(selectedEvent.status === 'PAID' || selectedEvent.status === 'RECEIVED') && (
                  <button
                    onClick={() => handleEventStatusUpdate('PENDING')}
                    className="btn-secondary flex-1"
                  >
                    {t('pages.calendar.markAsPending')}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {periodAmountModal && (
        <div className="modal-overlay z-[60]" onClick={() => setPeriodAmountModal(null)} role="presentation">
          <motion.div
            ref={periodAmountModalRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-period-amount-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="calendar-period-amount-title" className="text-xl font-bold text-white mb-2">
              {periodAmountModal.targetStatus === 'PAID'
                ? t('pages.expenses.variablePeriodPay.title')
                : t('pages.income.variablePeriodPay.title')}
            </h2>
            <p className="text-sm text-dark-400 mb-1">
              <span className="text-white/90">{periodAmountModal.ev.title}</span>
            </p>
            <p className="text-xs text-dark-500 mb-4">
              {periodAmountModal.targetStatus === 'PAID'
                ? t('pages.expenses.variablePeriodPay.hint')
                : t('pages.income.variablePeriodPay.hint')}
            </p>
            <label className="label" htmlFor="calendar-period-amount-input">
              {periodAmountModal.targetStatus === 'PAID'
                ? t('pages.expenses.variablePeriodPay.amountLabel')
                : t('pages.income.variablePeriodPay.amountLabel')}
            </label>
            <input
              id="calendar-period-amount-input"
              type="number"
              step="0.01"
              min="0"
              value={periodAmountInput}
              onChange={(e) => setPeriodAmountInput(e.target.value)}
              className="input w-full mb-4"
              autoComplete="off"
            />
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" className="btn-secondary" onClick={() => setPeriodAmountModal(null)}>
                {t('common.actions.cancel')}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  const n = parseFloat(periodAmountInput.trim().replace(',', '.'));
                  if (Number.isNaN(n) || n <= 0) {
                    toast.error(t('toast.generic.invalidAmount'));
                    return;
                  }
                  await submitCalendarStatusUpdate(
                    periodAmountModal.ev,
                    periodAmountModal.targetStatus,
                    n
                  );
                }}
              >
                {periodAmountModal.targetStatus === 'PAID'
                  ? t('pages.expenses.variablePeriodPay.confirm')
                  : t('pages.income.variablePeriodPay.confirm')}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
