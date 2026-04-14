import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Wallet, Calendar, FileText, Menu } from 'lucide-react';

type TabDef = {
  to: string;
  label: string;
  module: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
};

/** Primer segmento de ruta; evita que `/accounts-payable` active la pestaña Cuentas. */
function firstPathSegment(pathname: string): string {
  return pathname.split('/').filter(Boolean)[0] ?? '';
}

const TABS: TabDef[] = [
  {
    to: '/',
    label: 'Resumen',
    module: 'dashboard',
    icon: LayoutDashboard,
    isActive: (p) => {
      const s = firstPathSegment(p);
      return s !== 'accounts' && s !== 'calendar' && s !== 'reports';
    },
  },
  {
    to: '/accounts',
    label: 'Cuentas',
    module: 'accounts',
    icon: Wallet,
    isActive: (p) => firstPathSegment(p) === 'accounts',
  },
  {
    to: '/calendar',
    label: 'Calendario',
    module: 'calendar',
    icon: Calendar,
    isActive: (p) => firstPathSegment(p) === 'calendar',
  },
  {
    to: '/reports',
    label: 'Reportes',
    module: 'reports',
    icon: FileText,
    isActive: (p) => firstPathSegment(p) === 'reports',
  },
];

export interface MobileTabBarProps {
  hasModule: (key: string) => boolean;
  onMenuPress: () => void;
  onTabLinkPress: () => void;
}

/** Navegación inferior en móvil (oculto desde lg). Respeta módulos de suscripción; Menú abre el drawer. */
const MobileTabBar: React.FC<MobileTabBarProps> = ({
  hasModule,
  onMenuPress,
  onTabLinkPress,
}) => {
  const { pathname } = useLocation();
  const visible = TABS.filter((t) => hasModule(t.module));

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-30 flex items-stretch justify-around gap-0 border-t border-dark-700 bg-dark-800/95 backdrop-blur-sm pt-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_-4px_24px_rgba(0,0,0,0.25)]"
      role="navigation"
      aria-label="Navegación principal"
    >
      {visible.map((tab) => {
        const active = tab.isActive(pathname);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.module}
            to={tab.to}
            onClick={onTabLinkPress}
            className={`flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[11px] font-medium transition-colors ${
              active ? 'text-primary-400' : 'text-dark-400 hover:text-dark-200'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={22} className="shrink-0" aria-hidden />
            <span className="truncate leading-tight">{tab.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onMenuPress}
        className="flex min-h-[48px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[11px] font-medium text-dark-400 hover:text-dark-200"
        aria-label="Abrir menú lateral"
      >
        <Menu size={22} className="shrink-0" aria-hidden />
        <span className="leading-tight">Menú</span>
      </button>
    </nav>
  );
};

export default MobileTabBar;
