import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import api from '../services/api';
import {
  LayoutDashboard,
  CreditCard,
  Receipt,
  TrendingUp,
  TrendingDown,
  Wallet,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Bell,
  LogOut,
  FileText,
  MessageSquare,
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronRight,
  Target,
  TrendingUp as TrendingUpIcon,
  Car,
  History,
  Tag,
  FileText as FileTextIcon,
  BarChart3,
  DollarSign,
  Wallet as WalletIcon,
  Shield,
  UserCircle,
  Layers,
} from 'lucide-react';
import { Notification } from '../types';
import toast from 'react-hot-toast';
import OfflineBanner from './OfflineBanner';
import MobileTabBar from './MobileTabBar';
import { useMobileTabBarVisible } from '../hooks/useMobileTabBarVisible';

const SIDEBAR_COLLAPSED_KEY = 'paulino-sidebar-collapsed';

interface MenuItem {
  label: string;
  path?: string;
  icon: React.ComponentType<any>;
  children?: MenuItem[];
  /** Clave de módulo de suscripción; si falta, el ítem no se filtra por plan */
  module?: string;
}

function pathToModule(pathname: string): string | null {
  if (pathname === '/' || pathname === '') return 'dashboard';
  if (pathname.startsWith('/admin')) return null;
  if (pathname.startsWith('/subscription')) return null;
  const first = pathname.split('/').filter(Boolean)[0];
  const map: Record<string, string> = {
    cards: 'cards',
    loans: 'loans',
    income: 'income',
    expenses: 'expenses',
    accounts: 'accounts',
    reports: 'reports',
    calendar: 'calendar',
    'accounts-payable': 'accounts_payable',
    'accounts-receivable': 'accounts_receivable',
    budgets: 'budgets',
    'financial-goals': 'financial_goals',
    'cash-flow': 'cash_flow',
    projections: 'projections',
    vehicles: 'vehicles',
    notifications: 'notifications',
    categories: 'categories',
    templates: 'templates',
    settings: 'settings',
    profile: 'profile',
  };
  return map[first] ?? null;
}

function filterMenuBySubscription(
  items: MenuItem[],
  hasModule: (k: string) => boolean
): MenuItem[] {
  return (
    items
      .map((item) => {
        if (item.children?.length) {
          const children = filterMenuBySubscription(item.children, hasModule);
          if (children.length === 0) return null;
          return { ...item, children };
        }
        if (item.module && !hasModule(item.module)) return null;
        return item;
      })
      .filter(Boolean) as MenuItem[]
  );
}

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** En pantallas lg+: true = menú oculto (persistido en localStorage) */
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isLg, setIsLg] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  const [expandedMenus, setExpandedMenus] = useState<{ [key: string]: boolean }>({});
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationPage, setNotificationPage] = useState(1);
  const [notificationTotalPages, setNotificationTotalPages] = useState(1);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const { user, logout, impersonatedBy, stopImpersonation } = useAuth();
  const { hasModule, loading: subLoading, loadError: subscriptionLoadError, refetch: refetchSubscription } =
    useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const showMobileTabBar = useMobileTabBarVisible();

  const menuItems: MenuItem[] = useMemo(
    () => [
      ...(user?.isSuperAdmin && impersonatedBy == null
        ? ([
          { path: '/admin', label: 'Administración', icon: Shield },
          { path: '/admin/subscriptions', label: 'Planes de suscripción', icon: Layers },
        ] as MenuItem[])
        : []),
      { path: '/', label: 'Resumen', icon: LayoutDashboard, module: 'dashboard' },
      {
        label: 'Finanzas',
        icon: DollarSign,
        children: [
          { path: '/accounts', label: 'Cuentas', icon: Wallet, module: 'accounts' },
          { path: '/income', label: 'Ingresos', icon: TrendingUp, module: 'income' },
          { path: '/expenses', label: 'Gastos', icon: TrendingDown, module: 'expenses' },
          { path: '/cards', label: 'Tarjetas', icon: CreditCard, module: 'cards' },
          { path: '/loans', label: 'Préstamos', icon: Receipt, module: 'loans' },
          { path: '/accounts-payable', label: 'Por Pagar', icon: FileText, module: 'accounts_payable' },
          { path: '/accounts-receivable', label: 'Por Cobrar', icon: WalletIcon, module: 'accounts_receivable' },
        ],
      },
      {
        label: 'Planificación',
        icon: CalendarIcon,
        children: [
          { path: '/calendar', label: 'Calendario', icon: CalendarIcon, module: 'calendar' },
          { path: '/budgets', label: 'Presupuestos', icon: FileText, module: 'budgets' },
          { path: '/financial-goals', label: 'Metas Financieras', icon: Target, module: 'financial_goals' },
        ],
      },
      {
        label: 'Análisis',
        icon: BarChart3,
        children: [
          { path: '/reports', label: 'Reportes', icon: FileTextIcon, module: 'reports' },
          { path: '/cash-flow', label: 'Flujo de Caja', icon: TrendingUpIcon, module: 'cash_flow' },
          { path: '/projections', label: 'Proyecciones', icon: BarChart3, module: 'projections' },
        ],
      },
      {
        label: 'Especiales',
        icon: Car,
        children: [
          { path: '/vehicles', label: 'Vehículos', icon: Car, module: 'vehicles' },
        ],
      },
      {
        label: 'Notificaciones',
        icon: Bell,
        children: [
          { path: '/notifications/history', label: 'Historial', icon: History, module: 'notifications' },
        ],
      },
      {
        label: 'Preferencias',
        icon: Settings,
        children: [
          { path: '/subscription', label: 'Planes', icon: CreditCard, module: 'subscription' },
          { path: '/profile', label: 'Mi perfil', icon: UserCircle, module: 'profile' },
          { path: '/categories', label: 'Categorías', icon: Tag, module: 'categories' },
          { path: '/templates', label: 'Plantillas', icon: MessageSquare, module: 'templates' },
          { path: '/settings', label: 'Configuración', icon: Settings, module: 'settings' },
        ],
      },
    ],
    [user?.isSuperAdmin, impersonatedBy]
  );

  const filteredMenuItems = useMemo(
    () => filterMenuBySubscription(menuItems, hasModule),
    [menuItems, hasModule]
  );

  useEffect(() => {
    if (subLoading || !user) return;
    if (subscriptionLoadError) return;
    const p = location.pathname;
    if (p.startsWith('/admin') || p.startsWith('/subscription')) return;
    const mod = pathToModule(p);
    if (mod && !hasModule(mod)) {
      navigate('/subscription', { replace: true });
    }
  }, [location.pathname, subLoading, subscriptionLoadError, user, hasModule, navigate]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsLg(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [notificationPage]);

  useEffect(() => {
    if (showNotifications) {
      setNotificationPage(1);
    }
  }, [showNotifications]);

  // Close notifications when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showNotifications) {
        const target = event.target as Node;
        const isClickInsideNotifications = notificationsRef.current?.contains(target);
        const isClickOnButton = notificationsButtonRef.current?.contains(target);

        if (!isClickInsideNotifications && !isClickOnButton) {
          setShowNotifications(false);
        }
      }
    };

    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const fetchNotifications = async () => {
    try {
      const response = await api.get('/notifications', {
        params: {
          unreadOnly: true,
          page: notificationPage,
          limit: 10, // 10 notifications per page in header
        },
      });
      setNotifications(response.data.notifications || []);
      setUnreadCount(response.data.pagination?.total || 0);
      setNotificationTotalPages(response.data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      fetchNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      fetchNotifications();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const toggleMenu = (label: string) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const isMenuActive = (item: MenuItem): boolean => {
    if (item.path) {
      return location.pathname === item.path;
    }
    if (item.children) {
      return item.children.some((child) => child.path === location.pathname);
    }
    return false;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const setSidebarCollapsedPersist = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  };

  /** Menú visible: móvil = drawer abierto; escritorio = no colapsado */
  const sidebarVisible = isLg ? !sidebarCollapsed : sidebarOpen;

  const toggleSidebar = () => {
    if (isLg) {
      setSidebarCollapsedPersist(!sidebarCollapsed);
    } else {
      setSidebarOpen((o) => !o);
    }
  };

  const closeMobileDrawer = () => {
    if (!isLg) setSidebarOpen(false);
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus[item.label] || isMenuActive(item);
    const isActive = isMenuActive(item);

    return (
      <div key={item.label}>
        {item.path ? (
          <Link
            to={item.path}
            onClick={closeMobileDrawer}
            className={`flex items-center space-x-3 px-3 sm:px-4 py-3.5 sm:py-3 min-h-[48px] rounded-lg transition-colors active:bg-dark-700/80 ${isActive
              ? 'bg-primary-600 text-white'
              : 'text-dark-300 hover:bg-dark-700 hover:text-white'
              }`}
            style={{ paddingLeft: `${12 + level * 20}px` }}
          >
            <item.icon size={20} />
            <span className="font-medium">{item.label}</span>
          </Link>
        ) : (
          <button
            onClick={() => toggleMenu(item.label)}
            className={`w-full flex items-center justify-between px-3 sm:px-4 py-3.5 sm:py-3 min-h-[48px] rounded-lg transition-colors active:bg-dark-700/80 ${isActive
              ? 'bg-primary-600 text-white'
              : 'text-dark-300 hover:bg-dark-700 hover:text-white'
              }`}
            style={{ paddingLeft: `${12 + level * 20}px` }}
          >
            <div className="flex items-center space-x-3">
              <item.icon size={20} />
              <span className="font-medium">{item.label}</span>
            </div>
            {hasChildren && (isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
          </button>
        )}
        {hasChildren && (
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="space-y-1 mt-1">
                  {item.children!.map((child) => renderMenuItem(child, level + 1))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen min-h-[100dvh] bg-dark-900 flex w-full max-w-[100vw] overflow-x-hidden">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-1rem))] max-w-[85vw] sm:w-64 bg-dark-800 border-r border-dark-700 transform transition-transform duration-300 ease-in-out pt-[env(safe-area-inset-top,0px)] ${sidebarVisible ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between gap-2 p-4 sm:p-6 border-b border-dark-700 shrink-0">
            <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent truncate">
              Paulino Finance
            </h1>
            <button
              type="button"
              onClick={closeMobileDrawer}
              className="lg:hidden min-h-[44px] min-w-[44px] p-2 -mr-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700/80"
              aria-label="Cerrar menú"
            >
              <X size={22} />
            </button>
          </div>

          <nav className="flex-1 p-3 sm:p-4 space-y-1 overflow-y-auto overscroll-contain min-h-0">
            {filteredMenuItems.map((item) => renderMenuItem(item))}
          </nav>

          <div className="p-3 sm:p-4 border-t border-dark-700 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4 shrink-0">
            <Link
              to="/profile"
              title="Mi perfil"
              onClick={closeMobileDrawer}
              className="flex items-center space-x-3 mb-3 sm:mb-4 px-2 sm:px-4 py-2 rounded-lg transition-colors cursor-pointer hover:bg-dark-700/80 min-h-[48px]"
            >
              <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold">
                  {user?.firstName?.[0] || user?.email[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-white truncate">
                  {user?.firstName || user?.email}
                </p>
                <p className="text-xs text-dark-400 truncate">{user?.email}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-3 sm:px-4 py-3.5 rounded-lg text-dark-300 hover:bg-dark-700 hover:text-white transition-colors min-h-[48px]"
            >
              <LogOut size={20} />
              <span className="font-medium">Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay: solo móvil cuando el drawer está abierto */}
      {!isLg && sidebarOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 bg-black/50 z-40 cursor-default border-0 p-0"
          onClick={closeMobileDrawer}
        />
      )}

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 transition-[padding] duration-300 ease-in-out ${isLg && !sidebarCollapsed ? 'lg:pl-64' : ''
          }`}
      >
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-dark-800/95 backdrop-blur-sm border-b border-dark-700 px-3 sm:px-4 py-2 flex items-center justify-between gap-2 min-h-[2.75rem] sm:min-h-[3rem] pt-[max(0.5rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={toggleSidebar}
            className="min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] -ml-1 p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700/80 shrink-0"
            aria-label={sidebarVisible ? 'Ocultar menú lateral' : 'Mostrar menú lateral'}
            aria-expanded={sidebarVisible}
          >
            {sidebarVisible ? (
              <PanelLeftClose size={22} aria-hidden />
            ) : (
              <PanelLeftOpen size={22} aria-hidden />
            )}
          </button>
          <div className="flex-1 lg:flex-none" aria-hidden="true" />
          <div className="flex items-center justify-end gap-1.5 sm:gap-3 shrink-0">
            <div className="relative">
              <button
                type="button"
                ref={notificationsButtonRef}
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700/80 transition-colors"
                aria-expanded={showNotifications}
                aria-label="Notificaciones"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center text-xs text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div
                  ref={notificationsRef}
                  className="fixed z-[60] left-3 right-3 top-[calc(3rem+env(safe-area-inset-top,0px))] w-auto max-h-[min(70vh,28rem)] overflow-y-auto sm:absolute sm:inset-x-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-80 sm:max-h-96 bg-dark-800 border border-dark-700 rounded-xl shadow-xl overscroll-contain"
                >
                  <div className="p-4 border-b border-dark-700 flex items-center justify-between">
                    <h3 className="text-white font-semibold">Notificaciones</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-xs text-primary-400 hover:text-primary-300"
                      >
                        Marcar todas como leídas
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-dark-700">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-dark-400 text-sm">
                        No hay notificaciones
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 cursor-pointer hover:bg-dark-700 transition-colors ${!notification.isRead ? 'bg-dark-750' : ''
                            }`}
                          onClick={() => {
                            if (!notification.isRead) {
                              markAsRead(notification.id);
                            }
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <p className="text-white font-medium text-sm">{notification.title}</p>
                              <p className="text-dark-400 text-xs mt-1">{notification.message}</p>
                              <p className="text-dark-500 text-xs mt-1">
                                {new Date(notification.createdAt).toLocaleDateString('es-DO', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                            {!notification.isRead && (
                              <div className="w-2 h-2 bg-primary-500 rounded-full ml-2"></div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  {notificationTotalPages > 1 && (
                    <div className="p-3 border-t border-dark-700 flex items-center justify-between">
                      <button
                        onClick={() => setNotificationPage((prev) => Math.max(1, prev - 1))}
                        disabled={notificationPage === 1}
                        className="px-3 py-1 text-sm bg-dark-700 text-white rounded hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Anterior
                      </button>
                      <span className="text-xs text-dark-400">
                        Página {notificationPage} de {notificationTotalPages}
                      </span>
                      <button
                        onClick={() => setNotificationPage((prev) => Math.min(notificationTotalPages, prev + 1))}
                        disabled={notificationPage === notificationTotalPages}
                        className="px-3 py-1 text-sm bg-dark-700 text-white rounded hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Siguiente
                      </button>
                    </div>
                  )}
                  <div className="p-4 border-t border-dark-700">
                    <Link
                      to="/notifications/history"
                      onClick={() => setShowNotifications(false)}
                      className="text-sm text-primary-400 hover:text-primary-300 text-center block"
                    >
                      Ver todas las notificaciones
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <OfflineBanner />

        {subscriptionLoadError && user && !user.isSuperAdmin && (
          <div className="bg-red-900/30 border-b border-red-700/45 px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
            <span className="text-red-100">No se pudo cargar tu suscripción. Revisa la conexión o inténtalo de nuevo.</span>
            <button
              type="button"
              onClick={() => void refetchSubscription()}
              className="px-3 py-1.5 rounded-lg bg-red-800/50 text-white hover:bg-red-700/60 shrink-0"
            >
              Reintentar
            </button>
          </div>
        )}

        {impersonatedBy != null && (
          <div className="bg-amber-900/35 border-b border-amber-700/40 px-3 sm:px-4 py-2 flex flex-col xs:flex-row flex-wrap xs:items-center xs:justify-between gap-2 text-sm">
            <span className="text-amber-100">
              Modo soporte: estás actuando como <strong>{user?.email}</strong>
            </span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await stopImpersonation();
                  toast.success('Sesión de administrador restaurada');
                  navigate('/admin');
                } catch {
                  toast.error('No se pudo restaurar la sesión');
                }
              }}
              className="px-3 py-1 rounded-lg bg-amber-700/50 text-white hover:bg-amber-600/60"
            >
              Volver a mi cuenta
            </button>
          </div>
        )}

        {/* Page content */}
        <main
          className={`flex-1 min-w-0 p-3 xs:p-4 sm:p-6 overflow-y-auto overflow-x-hidden ${
            showMobileTabBar
              ? 'pb-24 lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]'
              : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]'
          }`}
        >
          <Outlet />
        </main>

        {showMobileTabBar && (
          <MobileTabBar
            hasModule={hasModule}
            onMenuPress={toggleSidebar}
            onTabLinkPress={closeMobileDrawer}
          />
        )}
      </div>
    </div>
  );
};

export default Layout;
