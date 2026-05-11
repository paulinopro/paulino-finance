import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import api from '../services/api';
import type { AppNotification } from '../types';
import {
  Bell,
  CheckCircle,
  CreditCard,
  FileText,
  Landmark,
  RefreshCw,
  Search,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import SystemNotificationBody from '../components/SystemNotificationBody';
import { LIST_CARD_SHELL, listCardAccentNeutral, listCardAccentSubtle } from '../utils/listCard';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useTranslation } from 'react-i18next';

function fallbackNotificationTypeLabel(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

type TypeVisual = { Icon: LucideIcon; box: string; iconColor: string };

function getNotificationTypeVisual(type: string): TypeVisual {
  switch (type) {
    case 'CARD_PAYMENT':
      return {
        Icon: CreditCard,
        box: 'border-blue-500/35 bg-blue-500/10 shadow-[inset_0_1px_0_0_rgba(59,130,246,0.2)]',
        iconColor: 'text-blue-400',
      };
    case 'LOAN_PAYMENT':
      return {
        Icon: Landmark,
        box: 'border-violet-500/35 bg-violet-500/10 shadow-[inset_0_1px_0_0_rgba(139,92,246,0.2)]',
        iconColor: 'text-violet-300',
      };
    case 'RECURRING_EXPENSE':
      return {
        Icon: RefreshCw,
        box: 'border-amber-500/40 bg-amber-500/10 shadow-[inset_0_1px_0_0_rgba(245,158,11,0.2)]',
        iconColor: 'text-amber-400',
      };
    case 'EXPENSE':
      return {
        Icon: FileText,
        box: 'border-orange-500/35 bg-orange-500/10 shadow-[inset_0_1px_0_0_rgba(249,115,22,0.2)]',
        iconColor: 'text-orange-400',
      };
    case 'INCOME':
      return {
        Icon: Wallet,
        box: 'border-emerald-500/35 bg-emerald-500/10 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.2)]',
        iconColor: 'text-emerald-400',
      };
    default:
      return {
        Icon: Bell,
        box: 'border-primary-500/35 bg-primary-500/10 shadow-[inset_0_1px_0_0_rgba(59,130,246,0.15)]',
        iconColor: 'text-primary-400',
      };
  }
}

const NotificationHistory: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const { formatDateTimeMedium } = useIntlFormatting();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinnedNotification, setPinnedNotification] = useState<AppNotification | null>(null);
  const scrollHighlightRanForRef = useRef<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRead, setFilterRead] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const { pageSize: itemsPerPage, setPageSize: setItemsPerPage, pageSizeOptions } = usePersistedTablePageSize(
    'pf:pageSize:notificationHistory',
    TABLE_PAGE_SIZE
  );
  /** Desktop/tablet: tarjeta en fila + cuerpo compacto; móvil: flujo vertical + cuerpo completo. */
  const isWideCardLayout = useMediaQuery('(min-width: 768px)');

  const notificationTypeLabel = useCallback(
    (type: string) =>
      t(`notifTypes.${type}`, { defaultValue: fallbackNotificationTypeLabel(type) }),
    [t]
  );

  const nidParam = searchParams.get('nid');
  const nidParsed = nidParam !== null ? parseInt(nidParam, 10) : NaN;
  const nidForDeepLink = Number.isFinite(nidParsed) ? nidParsed : null;

  useEffect(() => {
    scrollHighlightRanForRef.current = null;
  }, [nidForDeepLink]);

  /** Carga la notificación cuando viene por ?nid=y no está en la página actual del listado paginado. */
  useEffect(() => {
    if (nidForDeepLink === null) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await api.get<{ notification: AppNotification }>(`/notifications/${nidForDeepLink}`);
        if (!cancelled && response.data?.notification)
          setPinnedNotification(response.data.notification);
      } catch {
        if (!cancelled) {
          setPinnedNotification(null);
          toast.error(t('toast.notificationHistory.notFound'));
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete('nid');
              return next;
            },
            { replace: true }
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nidForDeepLink, setSearchParams, t]);

  /** Si aparece en el listado (p. ej. al cambiar de página), quitamos la duplicada fijada. */
  useEffect(() => {
    if (nidForDeepLink === null) return;
    if (!notifications.some((n) => n.id === nidForDeepLink)) return;
    setPinnedNotification(null);
  }, [notifications, nidForDeepLink]);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
  }, [filterRead, filterType, itemsPerPage]);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: itemsPerPage,
      };
      if (filterRead === 'read') params.readOnly = true;
      if (filterRead === 'unread') params.unreadOnly = true;
      if (filterType !== 'all') params.type = filterType;

      const response = await api.get('/notifications', { params });
      const filteredNotifications = response.data.notifications || [];

      setNotifications(filteredNotifications);
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      toast.error(t('toast.notificationHistory.loadError'));
    } finally {
      setLoading(false);
    }
  }, [filterRead, filterType, currentPage, itemsPerPage, t]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      fetchNotifications();
    } catch (error: any) {
      toast.error(t('toast.notificationHistory.markReadError'));
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      toast.success(t('toast.notificationHistory.allMarkedRead'));
      fetchNotifications();
    } catch (error: any) {
      toast.error(t('toast.notificationHistory.markAllReadError'));
    }
  };

  const deleteNotification = async (id: number) => {
    try {
      await api.delete(`/notifications/${id}`);
      toast.success(t('toast.notificationHistory.deleted'));
      fetchNotifications();
    } catch (error: any) {
      toast.error(t('toast.notificationHistory.deleteError'));
    }
  };

  const notificationsIncludingPinned = useMemo(() => {
    if (!pinnedNotification) return notifications;
    if (notifications.some((n) => n.id === pinnedNotification.id)) return notifications;
    return [pinnedNotification, ...notifications];
  }, [notifications, pinnedNotification]);

  // Apply search filter on client side (for better UX)
  const filteredNotifications = notificationsIncludingPinned.filter(
    (notification) =>
      notification.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      notification.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (nidForDeepLink === null || loading) return;

    const inList = filteredNotifications.some((n) => n.id === nidForDeepLink);
    if (!inList) return;
    if (scrollHighlightRanForRef.current === nidForDeepLink) return;

    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`notification-card-${nidForDeepLink}`);
      if (!el) return;
      scrollHighlightRanForRef.current = nidForDeepLink;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary-500', 'ring-offset-2', 'ring-offset-dark-900');

      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary-500', 'ring-offset-2', 'ring-offset-dark-900');
      }, 2200);

      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('nid');
          return next;
        },
        { replace: true }
      );
    }, 120);

    return () => window.clearTimeout(scrollTimer);
  }, [nidForDeepLink, loading, filteredNotifications, setSearchParams]);

  const notificationTypes = Array.from(
    new Set(notificationsIncludingPinned.map((n) => n.type))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-center sm:text-left">
          <h1 className="page-title truncate">{t('pages.notificationHistory.title')}</h1>
          <p className="text-dark-400 text-sm sm:text-base">{t('pages.notificationHistory.subtitle')}</p>
        </div>
        {notificationsIncludingPinned.some((n) => !n.isRead) && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto text-sm sm:text-base"
          >
            <CheckCircle size={20} />
            {t('pages.notificationHistory.markAllRead')}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card-view">
        <div className="flex flex-col gap-3 sm:gap-4 md:flex-row md:items-end">
          <div className="flex-1 relative w-full min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
            <input
              type="text"
              placeholder={t('pages.notificationHistory.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={filterRead}
            onChange={(e) => setFilterRead(e.target.value)}
            className="px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">{t('pages.notificationHistory.filterAll')}</option>
            <option value="unread">{t('pages.notificationHistory.filterUnread')}</option>
            <option value="read">{t('pages.notificationHistory.filterRead')}</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full md:flex-1 md:min-w-[160px] px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">{t('pages.notificationHistory.filterAllTypes')}</option>
            {notificationTypes.map((type) => (
              <option key={type} value={type}>
                {notificationTypeLabel(type)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        {filteredNotifications.length === 0 ? (
          <div className="card-view text-center py-12 sm:py-16">
            <Bell className="mx-auto text-dark-400 mb-4" size={48} />
            <p className="text-dark-400">{t('pages.notificationHistory.emptyState')}</p>
          </div>
        ) : (
          <>
            {filteredNotifications.map((notification) => {
              const { Icon: TypeIcon, box: typeBox, iconColor: typeIconClass } = getNotificationTypeVisual(
                notification.type
              );
              return (
                <motion.article
                  id={`notification-card-${notification.id}`}
                  key={notification.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={[
                    LIST_CARD_SHELL,
                    'overflow-hidden md:py-3.5 transition-[opacity,filter,box-shadow] duration-200',
                    notification.isRead
                      ? [
                          listCardAccentSubtle(),
                          'opacity-[0.93]',
                          'bg-dark-900/40',
                          'border-dark-600/60',
                          'hover:opacity-[0.98]',
                        ].join(' ')
                      : [
                          listCardAccentNeutral(),
                          'opacity-100',
                          'shadow-[0_8px_30px_-12px_rgba(59,188,255,0.35)]',
                        ].join(' '),
                  ].join(' ')}
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
                    {/* Móvil: arriba · md+: columna izquierda (título) */}
                    <div className="flex min-w-0 items-center gap-3 md:max-w-[14rem] md:shrink-0 lg:max-w-[16rem]">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border md:h-9 md:w-9 ${typeBox}`}
                        aria-hidden="true"
                      >
                        <TypeIcon className={`h-[1.125rem] w-[1.125rem] md:h-4 md:w-4 sm:h-5 sm:w-5 ${typeIconClass}`} strokeWidth={2} />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5 md:space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={[
                              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide sm:text-xs',
                              notification.isRead
                                ? 'border-dark-600/60 bg-dark-800/50 text-dark-500'
                                : 'border-dark-600/80 bg-dark-700/50 text-dark-300',
                            ].join(' ')}
                          >
                            <Bell
                              className={[
                                'h-3.5 w-3.5 shrink-0',
                                notification.isRead ? 'text-dark-500' : 'text-[#3bbcff]',
                              ].join(' ')}
                              aria-hidden
                            />
                            {t('pages.notificationHistory.notificationLabel')}
                          </span>
                          {!notification.isRead && (
                            <span className="shrink-0 rounded-md bg-primary-600 px-2 py-1 text-xs font-medium text-white shadow-sm">
                              {t('pages.notificationHistory.newLabel')}
                            </span>
                          )}
                        </div>
                        <h3
                          className={[
                            'break-words text-base font-bold uppercase leading-snug sm:text-lg md:line-clamp-2 md:text-[0.9375rem] md:leading-tight',
                            notification.isRead ? 'text-dark-400' : 'text-[#3bbcff]',
                          ].join(' ')}
                        >
                          {notification.title}
                        </h3>
                      </div>
                    </div>

                    {/* Cuerpo: ancho completo en móvil, centro en md+ */}
                    <div className="min-w-0 border-t border-dark-700/60 pt-3 md:mx-0 md:flex-1 md:border-l md:border-t-0 md:border-dark-600/50 md:px-4 md:pt-0">
                      <SystemNotificationBody
                        variant={isWideCardLayout ? 'compact' : 'full'}
                        title={notification.title}
                        message={notification.message}
                        className="min-w-0"
                      />
                    </div>

                    {/* Metadatos + acciones: abajo en móvil, columna estrecha en md+ */}
                    <div className="flex min-w-0 flex-col gap-2.5 border-t border-dark-700/80 pt-3 md:max-w-[12rem] md:shrink-0 md:gap-2 md:border-l md:border-t-0 md:border-dark-600/50 md:pl-3 md:pt-0">
                      <div className="grid grid-cols-2 gap-2 md:grid-cols-1 md:gap-1.5">
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-2.5 py-2 md:rounded-lg md:px-2 md:py-1.5">
                          <p className="text-[0.6rem] font-medium uppercase tracking-wider text-dark-500 md:text-[0.55rem]">{t('pages.notificationHistory.typeLabel')}</p>
                          <p className="mt-0.5 text-xs font-medium leading-tight text-dark-200 line-clamp-2 md:text-[0.7rem]">
                            {notificationTypeLabel(notification.type)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-2.5 py-2 md:rounded-lg md:px-2 md:py-1.5">
                          <p className="text-[0.6rem] font-medium uppercase tracking-wider text-dark-500 md:text-[0.55rem]">{t('pages.notificationHistory.dateLabel')}</p>
                          <p className="mt-0.5 text-[0.7rem] leading-tight text-dark-300 sm:text-sm md:text-[0.65rem]">
                            {formatDateTimeMedium(notification.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 xs:flex-row xs:flex-wrap xs:items-center xs:justify-end md:flex-nowrap">
                        {!notification.isRead && (
                          <button
                            type="button"
                            onClick={() => markAsRead(notification.id)}
                            className="min-h-[44px] w-full min-w-0 rounded-lg bg-primary-600 px-3 py-2 text-sm text-white transition-colors hover:bg-primary-700 touch-manipulation xs:w-auto xs:grow md:min-h-9 md:px-2 md:py-1.5 md:text-[0.7rem]"
                          >
                            {t('pages.notificationHistory.markRead')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteNotification(notification.id)}
                          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-red-400 transition-colors hover:bg-red-500/10 touch-manipulation md:min-h-9 md:min-w-9 md:shrink-0"
                          title={t('common.actions.delete')}
                          aria-label={t('pages.notificationHistory.deleteAria')}
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </>
        )}
      </div>
      {!loading && filteredNotifications.length > 0 && (
            <TablePagination
              className="mt-4 sm:mt-5"
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={total}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemLabel={t('pages.notificationHistory.itemsLabel')}
              disabled={loading}
              variant="card"
              pageSizeOptions={pageSizeOptions}
              onPageSizeChange={setItemsPerPage}
            />
      )}
    </div>
  );
};

export default NotificationHistory;
