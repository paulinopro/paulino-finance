import React, { useCallback, useEffect, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  LayoutDashboard,
  Users,
  Settings,
  Layers,
  ListTree,
  Stethoscope,
} from 'lucide-react';
import OfflineBanner from './OfflineBanner';
import { clearSuperAdminClientView, setSuperAdminClientViewOn } from '../constants/superAdminClientView';

const SIDEBAR_COLLAPSED_KEY = 'paulino-admin-sidebar-collapsed';

const NAV = [
  { to: '/admin', label: 'Resumen', icon: LayoutDashboard, isActive: (p: string) => p === '/admin' || p === '/admin/' },
  { to: '/admin/users', label: 'Usuarios', icon: Users, isActive: (p: string) => p === '/admin/users' || p.startsWith('/admin/users/') },
  { to: '/admin/settings', label: 'Configuración', icon: Settings, isActive: (p: string) => p === '/admin/settings' },
  { to: '/admin/audit', label: 'Auditoría', icon: ListTree, isActive: (p: string) => p === '/admin/audit' },
  { to: '/admin/system', label: 'Estado', icon: Stethoscope, isActive: (p: string) => p === '/admin/system' },
  {
    to: '/admin/subscriptions',
    label: 'Planes (producto)',
    icon: Layers,
    isActive: (p: string) => p === '/admin/subscriptions' || p.startsWith('/admin/subscriptions/'),
  },
] as const;

/**
 * Shell solo para rutas bajo /admin: sin menú de cliente, sin notificaciones de app.
 */
const AdminLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;

  useEffect(() => {
    clearSuperAdminClientView();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsLg(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setSidebarCollapsedPersist = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  };

  const sidebarVisible = isLg ? !sidebarCollapsed : sidebarOpen;
  const toggleSidebar = useCallback(() => {
    if (isLg) {
      setSidebarCollapsedPersist(!sidebarCollapsed);
    } else {
      setSidebarOpen((o) => !o);
    }
  }, [isLg, sidebarCollapsed]);

  const closeMobileDrawer = useCallback(() => {
    if (!isLg) setSidebarOpen(false);
  }, [isLg]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen min-h-[100dvh] flex w-full max-w-[100vw] overflow-x-hidden bg-slate-950">
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(20rem,calc(100vw-1rem))] max-w-[85vw] sm:w-64 transform transition-transform duration-300 ease-in-out pt-[env(safe-area-inset-top,0px)] bg-slate-900 border-r border-amber-900/30 ${
          sidebarVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between gap-2 p-4 sm:p-6 border-b shrink-0 border-amber-900/25">
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-amber-500/90 mb-0.5">Consola</p>
              <h1 className="text-lg sm:text-2xl font-bold truncate bg-gradient-to-r from-amber-200/95 to-amber-500/80 bg-clip-text text-transparent">
                Paulino Finance
              </h1>
            </div>
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
            {NAV.map((item) => {
              const active = item.isActive(pathname);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={closeMobileDrawer}
                  className={`flex items-center space-x-3 px-3 sm:px-4 py-3.5 sm:py-3 min-h-[48px] rounded-lg transition-colors ${
                    active
                      ? 'bg-primary-600 text-white'
                      : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                  }`}
                >
                  <item.icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="p-3 sm:p-4 border-t pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4 shrink-0 border-amber-900/25">
            <Link
              to="/profile"
              onClick={closeMobileDrawer}
              className="flex items-center space-x-3 mb-3 sm:mb-4 px-2 sm:px-4 py-2 rounded-lg transition-colors cursor-pointer hover:bg-dark-700/80 min-h-[48px]"
            >
              <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-white">
                  {user?.firstName?.[0] || user?.email?.[0]?.toUpperCase() || '·'}
                </span>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-white truncate">
                  {user?.firstName || user?.email}
                </p>
                <p className="text-xs text-dark-400 truncate">{user?.email}</p>
              </div>
            </Link>
            <Link
              to="/"
              onClick={() => {
                closeMobileDrawer();
                setSuperAdminClientViewOn();
              }}
              className="block w-full text-center text-xs text-amber-500/80 hover:text-amber-400 py-2 mb-2"
            >
              Ir a la app
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center space-x-3 px-3 sm:px-4 py-3.5 rounded-lg text-dark-300 hover:bg-dark-700 hover:text-white transition-colors min-h-[48px]"
            >
              <LogOut size={20} />
              <span className="font-medium">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </aside>
      {!isLg && sidebarOpen && (
        <button
          type="button"
          aria-label="Cerrar menú"
          className="fixed inset-0 bg-black/50 z-40 cursor-default border-0 p-0"
          onClick={closeMobileDrawer}
        />
      )}
      <div
        className={`flex-1 flex flex-col min-w-0 min-h-0 transition-[padding] duration-300 ease-in-out ${
          isLg && !sidebarCollapsed ? 'lg:pl-64' : ''
        }`}
      >
        <header className="sticky top-0 z-30 backdrop-blur-sm px-3 sm:px-4 py-2 flex items-center justify-between gap-2 min-h-[2.75rem] sm:min-h-[3rem] pt-[max(0.5rem,env(safe-area-inset-top))] bg-slate-900/90 border-b border-amber-900/25">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={toggleSidebar}
              className="min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] -ml-1 p-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-700/80 shrink-0"
              aria-label={sidebarVisible ? 'Ocultar menú lateral' : 'Mostrar menú lateral'}
              aria-expanded={sidebarVisible}
            >
              {sidebarVisible ? <PanelLeftClose size={22} aria-hidden /> : <PanelLeftOpen size={22} aria-hidden />}
            </button>
            <span className="hidden sm:inline text-[11px] font-semibold uppercase tracking-widest text-amber-500/80 truncate">
              Operación
            </span>
          </div>
        </header>
        <OfflineBanner />
        <main
          className="flex-1 min-w-0 p-3 xs:p-4 sm:p-6 overflow-y-auto overflow-x-hidden ring-1 ring-amber-900/20 ring-inset pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
