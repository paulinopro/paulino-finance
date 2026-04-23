import React, { useCallback, useEffect, useState } from 'react';
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
import TablePagination from '../components/TablePagination';
import SystemNotificationBody from '../components/SystemNotificationBody';
import { LIST_CARD_SHELL, listCardAccentNeutral, listCardAccentSubtle } from '../utils/listCard';
import { useMediaQuery } from '../hooks/useMediaQuery';

/** Etiquetas en español para códigos de tipo de notificación (backend) */
const NOTIFICATION_TYPE_LABEL_ES: Record<string, string> = {
  CARD_PAYMENT: 'Pago de tarjeta',
  LOAN_PAYMENT: 'Pago de préstamo',
  RECURRING_EXPENSE: 'Gasto recurrente',
  EXPENSE: 'Gasto',
  INCOME: 'Ingreso',
  REMINDER: 'Recordatorio',
  SYSTEM: 'Sistema',
};

function notificationTypeLabelEs(type: string): string {
  if (NOTIFICATION_TYPE_LABEL_ES[type]) return NOTIFICATION_TYPE_LABEL_ES[type];
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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRead, setFilterRead] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const itemsPerPage = TABLE_PAGE_SIZE;
  /** Desktop/tablet: tarjeta en fila + cuerpo compacto; móvil: flujo vertical + cuerpo completo. */
  const isWideCardLayout = useMediaQuery('(min-width: 768px)');

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
  }, [filterRead, filterType]);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: itemsPerPage,
      };
      if (filterRead === 'read') params.readOnly = false;
      if (filterRead === 'unread') params.unreadOnly = true;
      if (filterType !== 'all') params.type = filterType;

      const response = await api.get('/notifications', { params });
      const filteredNotifications = response.data.notifications || [];

      setNotifications(filteredNotifications);
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      toast.error('Error al cargar notificaciones');
    } finally {
      setLoading(false);
    }
  }, [filterRead, filterType, currentPage, itemsPerPage]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markAsRead = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      fetchNotifications();
    } catch (error: any) {
      toast.error('Error al marcar como leída');
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      toast.success('Todas las notificaciones marcadas como leídas');
      fetchNotifications();
    } catch (error: any) {
      toast.error('Error al marcar todas como leídas');
    }
  };

  const deleteNotification = async (id: number) => {
    try {
      await api.delete(`/notifications/${id}`);
      toast.success('Notificación eliminada');
      fetchNotifications();
    } catch (error: any) {
      toast.error('Error al eliminar notificación');
    }
  };

  // Apply search filter on client side (for better UX)
  const filteredNotifications = notifications.filter((notification) =>
    notification.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    notification.message.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const notificationTypes = Array.from(new Set(notifications.map((n) => n.type)));

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
          <h1 className="page-title truncate">Historial de Notificaciones</h1>
          <p className="text-dark-400 text-sm sm:text-base">Todas las notificaciones del sistema</p>
        </div>
        {notifications.filter((n) => !n.isRead).length > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto text-sm sm:text-base"
          >
            <CheckCircle size={20} />
            Marcar todas como leídas
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
              placeholder="Buscar notificaciones..."
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
            <option value="all">Todas</option>
            <option value="unread">No leídas</option>
            <option value="read">Leídas</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full md:flex-1 md:min-w-[160px] px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los tipos</option>
            {notificationTypes.map((type) => (
              <option key={type} value={type}>
                {notificationTypeLabelEs(type)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        {loading ? (
          <div className="card-view text-center py-12 sm:py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
            <p className="text-dark-400 mt-4">Cargando notificaciones...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="card-view text-center py-12 sm:py-16">
            <Bell className="mx-auto text-dark-400 mb-4" size={48} />
            <p className="text-dark-400">No hay notificaciones</p>
          </div>
        ) : (
          <>
            {filteredNotifications.map((notification) => {
              const { Icon: TypeIcon, box: typeBox, iconColor: typeIconClass } = getNotificationTypeVisual(
                notification.type
              );
              return (
                <motion.article
                  key={notification.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={[
                    LIST_CARD_SHELL,
                    'overflow-hidden md:py-3.5',
                    notification.isRead ? listCardAccentSubtle() : listCardAccentNeutral(),
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
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                            <Bell className="h-3.5 w-3.5 shrink-0 text-[#3bbcff]" aria-hidden />
                            Notificación
                          </span>
                          {!notification.isRead && (
                            <span className="shrink-0 rounded-md bg-primary-600 px-2 py-1 text-xs font-medium text-white shadow-sm">
                              Nueva
                            </span>
                          )}
                        </div>
                        <h3 className="text-balance break-words text-base font-bold uppercase leading-snug text-[#3bbcff] sm:text-lg md:line-clamp-2 md:text-[0.9375rem] md:leading-tight">
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
                          <p className="text-[0.6rem] font-medium uppercase tracking-wider text-dark-500 md:text-[0.55rem]">Tipo</p>
                          <p className="mt-0.5 text-xs font-medium leading-tight text-dark-200 line-clamp-2 md:text-[0.7rem]">
                            {notificationTypeLabelEs(notification.type)}
                          </p>
                        </div>
                        <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-2.5 py-2 md:rounded-lg md:px-2 md:py-1.5">
                          <p className="text-[0.6rem] font-medium uppercase tracking-wider text-dark-500 md:text-[0.55rem]">Fecha</p>
                          <p className="mt-0.5 text-[0.7rem] leading-tight text-dark-300 sm:text-sm md:text-[0.65rem]">
                            {new Date(notification.createdAt).toLocaleDateString('es-DO', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
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
                            Marcar como leída
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteNotification(notification.id)}
                          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-red-400 transition-colors hover:bg-red-500/10 touch-manipulation md:min-h-9 md:min-w-9 md:shrink-0"
                          title="Eliminar"
                          aria-label="Eliminar notificación"
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}

            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={total}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              itemLabel="notificaciones"
              disabled={loading}
              variant="card"
            />
          </>
        )}
      </div>
    </div>
  );
};

export default NotificationHistory;
