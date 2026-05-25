import React, { useCallback, useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation, Trans } from 'react-i18next';
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
  CalendarDays,
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
  Wrench,
} from 'lucide-react';
import type { AppNotification } from '../types';
import toast from 'react-hot-toast';
import OfflineBanner from './OfflineBanner';
import TablePagination from './TablePagination';
import { TABLE_PAGE_SIZE_LAYOUT_NOTIFICATIONS } from '../constants/pagination';
import MobileTabBar from './MobileTabBar';
import NotificationBellListRow from './NotificationBellListRow';
import { useForegroundPushNotifications } from '../hooks/useForegroundPushNotifications';
import { syncPushSubscriptionWithServer } from '../services/pushSubscription';
import { useMobileTabBarVisible } from '../hooks/useMobileTabBarVisible';
import { allowSuperAdminClientView } from '../constants/superAdminClientView';
import { LAYOUT_DESKTOP_SHELL_MEDIA } from '../constants/layout';

const SIDEBAR_COLLAPSED_KEY = 'paulino-sidebar-collapsed';

interface MenuItem {
  menuKey: string;
  label: string;
  path?: string;
  icon: React.ComponentType<any>;
  children?: MenuItem[];
  /** Clave de módulo de suscripción; si falta, el ítem no se filtra por plan */
  module?: string;
  /** Resaltado activo (p. ej. /admin y /admin/users/:id) */
  isActivePath?: (pathname: string) => boolean;
}

function pathToModule(pathname: string): string | null {
  if (pathname === '/' || pathname === '') return 'dashboard';
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
    agenda: 'agenda',
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

/** Claves i18n cortas para etiquetas del panel del campanario. */
const HEADER_NOTIF_I18N_KEY: Record<string, 'card' | 'loan' | 'recurring' | 'system'> = {
  CARD_PAYMENT: 'card',
  LOAN_PAYMENT: 'loan',
  RECURRING_EXPENSE: 'recurring',
  SYSTEM: 'system',
};
type BellTabId = 'unread' | 'read';

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
  const [isDesktopShell, setIsDesktopShell] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(LAYOUT_DESKTOP_SHELL_MEDIA).matches
  );
  const [expandedMenus, setExpandedMenus] = useState<{ [key: string]: boolean }>({});
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [bellTab, setBellTab] = useState<BellTabId>('unread');
  const [unreadBadgeCount, setUnreadBadgeCount] = useState(0);
  const [bellPanelTotal, setBellPanelTotal] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationPage, setNotificationPage] = useState(1);
  const [notificationTotalPages, setNotificationTotalPages] = useState(1);
  const [publicMaintenanceMode, setPublicMaintenanceMode] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);

  const { user, logout, impersonatedBy, stopImpersonation } = useAuth();

  const fetchUnreadBadgeCount = useCallback(async () => {
    if (!user?.id) {
      setUnreadBadgeCount(0);
      return;
    }
    try {
      const response = await api.get('/notifications', {
        params: { unreadOnly: true, page: 1, limit: 1 },
      });
      setUnreadBadgeCount(response.data.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching unread badge count:', error);
    }
  }, [user?.id]);

  const fetchBellPanelNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setBellPanelTotal(0);
      setNotificationTotalPages(1);
      return;
    }
    try {
      const params: Record<string, string | number | boolean> = {
        page: notificationPage,
        limit: TABLE_PAGE_SIZE_LAYOUT_NOTIFICATIONS,
      };
      if (bellTab === 'unread') params.unreadOnly = true;
      else params.readOnly = true;
      const response = await api.get('/notifications', { params });
      setNotifications(response.data.notifications || []);
      const total = response.data.pagination?.total || 0;
      setBellPanelTotal(total);
      setNotificationTotalPages(response.data.pagination?.totalPages || 1);
    } catch (error) {
      console.error('Error fetching bell notifications:', error);
    }
  }, [bellTab, notificationPage, user?.id]);

  const {
    hasModule,
    subscription,
    loading: subLoading,
    loadError: subscriptionLoadError,
    refetch: refetchSubscription,
  } = useSubscription();
  const location = useLocation();
  const navigate = useNavigate();
  const showMobileTabBar = useMobileTabBarVisible();
  const { t } = useTranslation();

  const shortNotifLabel = useCallback(
    (type: string) => {
      const k = HEADER_NOTIF_I18N_KEY[type];
      if (k) return t(`notifTypes.${k}`);
      return type
        .split('_')
        .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
        .join(' ')
        .slice(0, 24);
    },
    [t]
  );

  useForegroundPushNotifications(notifications, user?.id);

  useEffect(() => {
    if (!user?.id) return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    void syncPushSubscriptionWithServer();
  }, [user?.id]);

  const menuItems: MenuItem[] = useMemo(
    () => [
      ...(user?.isSuperAdmin && impersonatedBy == null
        ? ([
            {
              menuKey: 'admin_console',
              path: '/admin',
              label: t('nav.adminConsole'),
              icon: Shield,
            },
          ] as MenuItem[])
        : []),
      { menuKey: 'summary', path: '/', label: t('nav.summary'), icon: LayoutDashboard, module: 'dashboard' },
      {
        menuKey: 'finances',
        label: t('nav.finances'),
        icon: DollarSign,
        children: [
          { menuKey: 'accounts', path: '/accounts', label: t('nav.accounts'), icon: Wallet, module: 'accounts' },
          { menuKey: 'income', path: '/income', label: t('nav.income'), icon: TrendingUp, module: 'income' },
          { menuKey: 'expenses', path: '/expenses', label: t('nav.expenses'), icon: TrendingDown, module: 'expenses' },
          { menuKey: 'cards', path: '/cards', label: t('nav.cards'), icon: CreditCard, module: 'cards' },
          { menuKey: 'loans', path: '/loans', label: t('nav.loans'), icon: Receipt, module: 'loans' },
          { menuKey: 'accounts_payable', path: '/accounts-payable', label: t('nav.accountsPayable'), icon: FileText, module: 'accounts_payable' },
          { menuKey: 'accounts_receivable', path: '/accounts-receivable', label: t('nav.accountsReceivable'), icon: WalletIcon, module: 'accounts_receivable' },
        ],
      },
      {
        menuKey: 'planning',
        label: t('nav.planning'),
        icon: CalendarIcon,
        children: [
          { menuKey: 'calendar', path: '/calendar', label: t('nav.calendar'), icon: CalendarIcon, module: 'calendar' },
          { menuKey: 'agenda', path: '/agenda', label: t('nav.agenda'), icon: CalendarDays, module: 'agenda' },
          { menuKey: 'budgets', path: '/budgets', label: t('nav.budgets'), icon: FileText, module: 'budgets' },
          { menuKey: 'financial_goals', path: '/financial-goals', label: t('nav.financialGoals'), icon: Target, module: 'financial_goals' },
        ],
      },
      {
        menuKey: 'analysis',
        label: t('nav.analysis'),
        icon: BarChart3,
        children: [
          { menuKey: 'reports', path: '/reports', label: t('nav.reports'), icon: FileTextIcon, module: 'reports' },
          { menuKey: 'cash_flow', path: '/cash-flow', label: t('nav.cashFlow'), icon: TrendingUpIcon, module: 'cash_flow' },
          { menuKey: 'projections', path: '/projections', label: t('nav.projections'), icon: BarChart3, module: 'projections' },
        ],
      },
      {
        menuKey: 'specials',
        label: t('nav.specials'),
        icon: Car,
        children: [{ menuKey: 'vehicles', path: '/vehicles', label: t('nav.vehicles'), icon: Car, module: 'vehicles' }],
      },
      {
        menuKey: 'notifications_group',
        label: t('nav.notifications'),
        icon: Bell,
        children: [
          { menuKey: 'notifications_history', path: '/notifications/history', label: t('nav.notificationHistory'), icon: History, module: 'notifications' },
        ],
      },
      {
        menuKey: 'subscription_group',
        label: t('nav.subscription'),
        icon: CreditCard,
        children: [
          { menuKey: 'subscription_plans', path: '/subscription', label: t('nav.subscriptionPlans'), icon: CreditCard, module: 'subscription' },
          { menuKey: 'subscription_payments', path: '/subscription/payments', label: t('nav.subscriptionPaymentHistory'), icon: Receipt, module: 'subscription' },
        ],
      },
      {
        menuKey: 'preferences_group',
        label: t('nav.preferences'),
        icon: Settings,
        children: [
          { menuKey: 'profile', path: '/profile', label: t('nav.myProfile'), icon: UserCircle, module: 'profile' },
          { menuKey: 'categories', path: '/categories', label: t('nav.categories'), icon: Tag, module: 'categories' },
          { menuKey: 'templates', path: '/templates', label: t('nav.templates'), icon: MessageSquare, module: 'templates' },
          { menuKey: 'settings', path: '/settings', label: t('nav.settings'), icon: Settings, module: 'settings' },
        ],
      },
    ],
    [t, user?.isSuperAdmin, impersonatedBy]
  );

  const filteredMenuItems = useMemo(
    () => filterMenuBySubscription(menuItems, hasModule),
    [menuItems, hasModule]
  );

  useEffect(() => {
    if (!user?.isSuperAdmin || impersonatedBy != null) return;
    if (allowSuperAdminClientView()) return;
    const p = location.pathname;
    if (p === '/profile' || p.startsWith('/subscription')) return;
    navigate('/admin', { replace: true });
  }, [user?.isSuperAdmin, impersonatedBy, location.pathname, navigate]);

  useEffect(() => {
    if (!user) return;
    if (subLoading) return;
    if (subscriptionLoadError) return;
    // Sin cuerpo de /subscription/me no evaluar acceso (evita toast falso al refrescar).
    if (subscription == null) return;
    const p = location.pathname;
    if (p.startsWith('/subscription')) return;
    const mod = pathToModule(p);
    if (!mod || hasModule(mod)) return;

    const hasAssignedPlan = Boolean(
      user.isSuperAdmin ||
      user.hasUserSubscriptionRecord === true ||
      subscription?.isSuperAdmin ||
      subscription?.plan != null ||
      (subscription != null && subscription.status !== 'none')
    );
    if (hasAssignedPlan) {
      // Suscripción vencida: hay fila/plan pero sin acceso a módulos — mensaje y destino correctos
      if (subscription?.status === 'expired') {
        if (!p.startsWith('/subscription')) {
          toast.error(t('layout.toastSubscriptionExpired'));
          navigate('/subscription', { replace: true });
        }
        return;
      }
      if (p !== '/') {
        toast.error(t('layout.toastPlanNoModule'));
        navigate('/', { replace: true });
      }
      return;
    }
    navigate('/subscription', { replace: true });
  }, [location.pathname, subLoading, subscriptionLoadError, user, subscription, hasModule, navigate]);

  useEffect(() => {
    const mq = window.matchMedia(LAYOUT_DESKTOP_SHELL_MEDIA);
    const onChange = () => setIsDesktopShell(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    void fetchUnreadBadgeCount();
    const interval = setInterval(() => void fetchUnreadBadgeCount(), 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadBadgeCount]);

  useEffect(() => {
    void fetchBellPanelNotifications();
    const interval = setInterval(() => void fetchBellPanelNotifications(), 30000);
    return () => clearInterval(interval);
  }, [fetchBellPanelNotifications]);

  useEffect(() => {
    setNotificationPage(1);
  }, [bellTab]);

  /** Al abrir el panel solo: no deps de fetchBellPanelNotifications (depende de la página → recreaba el callback al paginar y volvía todo a página 1). */
  useEffect(() => {
    if (!showNotifications) return;
    setNotificationPage(1);
    void fetchUnreadBadgeCount();
  }, [showNotifications, fetchUnreadBadgeCount]);

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

  const handleBellNotificationOpen = async (n: AppNotification) => {
    try {
      if (!n.isRead) await api.put(`/notifications/${n.id}/read`);
      setShowNotifications(false);
      navigate(`/notifications/history?nid=${encodeURIComponent(String(n.id))}`);
      await Promise.all([fetchUnreadBadgeCount(), fetchBellPanelNotifications()]);
    } catch (error) {
      console.error('Error opening notification:', error);
      toast.error(t('layout.notificationOpenError'));
    }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      await Promise.all([fetchUnreadBadgeCount(), fetchBellPanelNotifications()]);
    } catch (error) {
      console.error('Error marking all as read:', error);
      toast.error(t('layout.markAllReadError'));
    }
  };

  const toggleMenu = (menuKey: string) => {
    setExpandedMenus((prev) => ({
      ...prev,
      [menuKey]: !prev[menuKey],
    }));
  };

  const isMenuActive = (item: MenuItem): boolean => {
    if (item.isActivePath) {
      return item.isActivePath(location.pathname);
    }
    if (item.path) {
      return location.pathname === item.path;
    }
    if (item.children) {
      return item.children.some((child) => isMenuActive(child));
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

  /** Menú visible: teléfono = drawer; tablet+ = barra lateral según colapso */
  const sidebarVisible = isDesktopShell ? !sidebarCollapsed : sidebarOpen;

  const toggleSidebar = () => {
    if (isDesktopShell) {
      setSidebarCollapsedPersist(!sidebarCollapsed);
    } else {
      setSidebarOpen((o) => !o);
    }
  };

  const closeMobileDrawer = () => {
    if (!isDesktopShell) setSidebarOpen(false);
  };

  const renderMenuItem = (item: MenuItem, level: number = 0) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus[item.menuKey] || isMenuActive(item);
    const isActive = isMenuActive(item);

    return (
      <div key={item.menuKey}>
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
            type="button"
            onClick={() => toggleMenu(item.menuKey)}
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
    <div
      className="min-h-screen min-h-[100dvh] flex w-full max-w-[100vw] overflow-x-hidden bg-dark-900"
    >
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-1rem))] max-w-[85vw] sm:w-64 transform transition-transform duration-300 ease-in-out pt-[env(safe-area-inset-top,0px)] bg-dark-800 border-r border-dark-700 ${sidebarVisible ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="flex flex-col h-full min-h-0">
          <div
            className="flex items-center justify-between gap-2 p-4 sm:p-6 border-b shrink-0 border-dark-700"
          >
            <div className="min-w-0">
              <h1
                className="text-lg sm:text-2xl font-bold truncate bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent"
              >
                {t('layout.brandTitle')}
              </h1>
            </div>
            <button
              type="button"
              onClick={closeMobileDrawer}
              className="md:hidden min-h-[44px] min-w-[44px] p-2 -mr-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700/80"
              aria-label={t('layout.closeMobileMenuAria')}
            >
              <X size={22} />
            </button>
          </div>

          <nav className="flex-1 p-3 sm:p-3 space-y-1 overflow-y-auto overscroll-contain min-h-0">
            {filteredMenuItems.map((item) => renderMenuItem(item))}
          </nav>

          <div
            className="p-3 sm:p-4 border-t pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-4 shrink-0 border-dark-700"
          >
            <Link
              to="/profile"
              title={t('layout.myProfileAria')}
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
              <span className="font-medium">{t('layout.logout')}</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay: solo vista compacta cuando el drawer está abierto */}
      {!isDesktopShell && sidebarOpen && (
        <button
          type="button"
          aria-label={t('layout.closeMobileMenuAria')}
          className="fixed inset-0 bg-black/50 z-40 cursor-default border-0 p-0"
          onClick={closeMobileDrawer}
        />
      )}

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 transition-[padding] duration-300 ease-in-out ${isDesktopShell && !sidebarCollapsed ? 'md:pl-64' : ''
          }`}
      >
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 backdrop-blur-sm px-3 sm:px-4 py-2 flex items-center justify-between gap-2 min-h-[2.75rem] sm:min-h-[3rem] pt-[max(0.5rem,env(safe-area-inset-top))] bg-dark-800/95 border-b border-dark-700"
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={toggleSidebar}
              className="min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] -ml-1 p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700/80 shrink-0"
              aria-label={sidebarVisible ? t('layout.hideSidebarAria') : t('layout.showSidebarAria')}
              aria-expanded={sidebarVisible}
            >
              {sidebarVisible ? (
                <PanelLeftClose size={22} aria-hidden />
              ) : (
                <PanelLeftOpen size={22} aria-hidden />
              )}
            </button>
          </div>
          <div className="flex-1 lg:flex-none" aria-hidden="true" />
          <div className="flex items-center justify-end gap-1.5 sm:gap-3 shrink-0">
            <div className="relative">
              <button
                type="button"
                ref={notificationsButtonRef}
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700/80 transition-colors"
                aria-expanded={showNotifications}
                aria-label={t('layout.notificationsAria')}
              >
                <Bell size={20} />
                {unreadBadgeCount > 0 && (
                  <span className="absolute top-1 right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center text-xs text-white">
                    {unreadBadgeCount > 9 ? '9+' : unreadBadgeCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div
                  ref={notificationsRef}
                  className="fixed z-[60] left-3 right-3 top-[calc(3rem+env(safe-area-inset-top,0px))] flex max-h-[calc(100svh-5.5rem)] w-auto flex-col overflow-hidden rounded-xl border border-dark-700 bg-dark-800 shadow-xl sm:absolute sm:inset-x-auto sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:max-h-[min(calc(100dvh-5rem),32rem)] sm:w-80 sm:max-w-[min(calc(100vw-14rem),20rem)]"
                >
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-dark-700/90 bg-dark-800 px-2.5 py-2">
                    <h3 className="truncate text-[0.8125rem] font-semibold tracking-tight text-white">
                      {t('layout.notificationsHeading')}
                    </h3>
                    {bellTab === 'unread' && unreadBadgeCount > 0 && (
                      <button
                        type="button"
                        onClick={() => void markAllAsRead()}
                        className="shrink-0 text-[0.62rem] font-medium text-primary-400 hover:text-primary-300"
                      >
                        {t('layout.markAllRead')}
                      </button>
                    )}
                  </div>

                  <div role="tablist" aria-label={t('layout.bellTabsAria')} className="flex shrink-0 gap-0.5 border-b border-dark-700/80 bg-[rgba(15,23,42,0.45)] px-1.5 py-1.5">
                    <button
                      type="button"
                      role="tab"
                      id="bell-tab-unread"
                      aria-selected={bellTab === 'unread'}
                      aria-controls="bell-panel-notifications-list"
                      onClick={() => setBellTab('unread')}
                      className={[
                        'min-h-[36px] flex-1 rounded-lg px-2 text-[0.6875rem] font-semibold transition-colors',
                        bellTab === 'unread'
                          ? 'bg-dark-700 text-white shadow-sm'
                          : 'text-dark-400 hover:bg-dark-800/95 hover:text-dark-200',
                      ].join(' ')}
                    >
                      {t('layout.newTab')}
                      {unreadBadgeCount > 0 ? (
                        <span className="ml-1.5 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[0.5625rem] font-bold text-white">
                          {unreadBadgeCount > 99 ? '99+' : unreadBadgeCount}
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      id="bell-tab-read"
                      aria-selected={bellTab === 'read'}
                      aria-controls="bell-panel-notifications-list"
                      onClick={() => setBellTab('read')}
                      className={[
                        'min-h-[36px] flex-1 rounded-lg px-2 text-[0.6875rem] font-semibold transition-colors',
                        bellTab === 'read'
                          ? 'bg-dark-700 text-white shadow-sm'
                          : 'text-dark-400 hover:bg-dark-800/95 hover:text-dark-200',
                      ].join(' ')}
                    >
                      {t('layout.readTab')}
                    </button>
                  </div>

                  {/* 5 filas × 3.5rem: sin scroll dentro de la página */}
                  <div
                    role="tabpanel"
                    id="bell-panel-notifications-list"
                    aria-labelledby={bellTab === 'unread' ? 'bell-tab-unread' : 'bell-tab-read'}
                    className="flex h-[21rem] w-full shrink-0 flex-col overflow-hidden bg-[rgba(15,23,42,0.35)]"
                  >
                    {notifications.length === 0 ? (
                      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
                        <p className="text-[0.7rem] leading-relaxed text-dark-400">
                          {bellTab === 'unread' ? t('layout.noNewNotifications') : t('layout.noReadNotifications')}
                        </p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <NotificationBellListRow
                          key={notification.id}
                          notification={notification}
                          typeLabel={shortNotifLabel(notification.type)}
                          onActivate={() => void handleBellNotificationOpen(notification)}
                        />
                      ))
                    )}
                  </div>

                  <TablePagination
                    variant="minimal"
                    className="shrink-0"
                    currentPage={notificationPage}
                    totalPages={notificationTotalPages}
                    totalItems={bellPanelTotal}
                    itemsPerPage={TABLE_PAGE_SIZE_LAYOUT_NOTIFICATIONS}
                    onPageChange={setNotificationPage}
                    itemLabel={t('layout.itemLabel_notifications')}
                  />

                  <div className="shrink-0 border-t border-dark-700/90 bg-dark-800 px-2 py-1.5">
                    <Link
                      to="/notifications/history"
                      onClick={() => setShowNotifications(false)}
                      className="block truncate text-center text-[0.65rem] font-medium text-primary-400 hover:text-primary-300"
                    >
                      {t('layout.fullHistoryLink')}
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <OfflineBanner />

        {publicMaintenanceMode && !user?.isSuperAdmin && (
          <div className="bg-amber-900/35 border-b border-amber-700/50 px-3 sm:px-4 py-2.5 flex items-start gap-2 text-sm text-amber-100/95">
            <Wrench className="w-4 h-4 shrink-0 mt-0.5 text-amber-400/90" aria-hidden />
            <p>
              <Trans i18nKey="layout.maintenanceMode" components={{ bold: <span className="font-medium" /> }} />
            </p>
          </div>
        )}

        {subscriptionLoadError && user && !user.isSuperAdmin && (
          <div className="bg-red-900/30 border-b border-red-700/45 px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
            <span className="text-red-100">{t('layout.subscriptionLoadError')}</span>
            <button
              type="button"
              onClick={() => void refetchSubscription()}
              className="px-3 py-1.5 rounded-lg bg-red-800/50 text-white hover:bg-red-700/60 shrink-0"
            >
              {t('layout.retry')}
            </button>
          </div>
        )}

        {impersonatedBy != null && (
          <div className="bg-amber-900/35 border-b border-amber-700/40 px-3 sm:px-4 py-2 flex flex-col xs:flex-row flex-wrap xs:items-center xs:justify-between gap-2 text-sm">
            <span className="text-amber-100">{t('layout.supportModeBanner', { email: user?.email ?? '' })}</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await stopImpersonation();
                  toast.success(t('layout.sessionRestored'));
                  navigate('/admin');
                } catch {
                  toast.error(t('layout.sessionRestoreError'));
                }
              }}
              className="px-3 py-1 rounded-lg bg-amber-700/50 text-white hover:bg-amber-600/60"
            >
              {t('layout.stopImpersonation')}
            </button>
          </div>
        )}

        {/* Page content */}
        <main
          className={`flex-1 min-w-0 p-3 xs:p-4 sm:p-6 overflow-y-auto overflow-x-hidden ${showMobileTabBar
            ? 'pb-24 md:pb-[max(1.5rem,env(safe-area-inset-bottom))]'
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
