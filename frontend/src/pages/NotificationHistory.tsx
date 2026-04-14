import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { Notification } from '../types';
import { Bell, CheckCircle, Search, X, Trash2, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { TABLE_PAGE_SIZE } from '../constants/pagination';

const NotificationHistory: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRead, setFilterRead] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const itemsPerPage = TABLE_PAGE_SIZE;

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
  }, [filterRead, filterType]);

  useEffect(() => {
    fetchNotifications();
  }, [filterRead, filterType, currentPage]);

  const fetchNotifications = async () => {
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
  };

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

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'CARD_PAYMENT':
        return '💳';
      case 'LOAN_PAYMENT':
        return '📋';
      case 'RECURRING_EXPENSE':
        return '🔄';
      default:
        return '🔔';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'CARD_PAYMENT':
        return 'bg-blue-600';
      case 'LOAN_PAYMENT':
        return 'bg-purple-600';
      case 'RECURRING_EXPENSE':
        return 'bg-orange-600';
      default:
        return 'bg-primary-600';
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
        <div className="min-w-0">
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
      <div className="card">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
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
            className="px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Todos los tipos</option>
            {notificationTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-4">
        {loading ? (
          <div className="card text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500 mx-auto"></div>
            <p className="text-dark-400 mt-4">Cargando notificaciones...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="card text-center py-12">
            <Bell className="mx-auto text-dark-400 mb-4" size={48} />
            <p className="text-dark-400">No hay notificaciones</p>
          </div>
        ) : (
          <>
            {filteredNotifications.map((notification) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`card ${!notification.isRead ? 'ring-2 ring-primary-500' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 ${getNotificationColor(notification.type)} rounded-lg flex items-center justify-center text-2xl`}>
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-1">{notification.title}</h3>
                      <p className="text-dark-400 text-sm">{notification.message}</p>
                    </div>
                    {!notification.isRead && (
                      <span className="px-2 py-1 bg-primary-600 text-white rounded text-xs">Nueva</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-4 text-xs text-dark-400">
                      <span>Tipo: {notification.type.replace('_', ' ')}</span>
                      <span>
                        {new Date(notification.createdAt).toLocaleDateString('es-DO', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!notification.isRead && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="px-3 py-1 bg-primary-600 text-white rounded text-sm hover:bg-primary-700 transition-colors"
                        >
                          Marcar como leída
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notification.id)}
                        className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
            ))}
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="card">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-dark-400">
                    Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, total)} de {total} notificaciones
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentPage === 1 || loading}
                      className="px-3 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      <ChevronLeft size={18} />
                      Anterior
                    </button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            disabled={loading}
                            className={`px-3 py-2 rounded-lg transition-colors ${
                              currentPage === pageNum
                                ? 'bg-primary-600 text-white'
                                : 'bg-dark-700 text-white hover:bg-dark-600'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages || loading}
                      className="px-3 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      Siguiente
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default NotificationHistory;
