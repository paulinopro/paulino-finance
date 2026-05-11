import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const Sep = () => <ChevronRight className="h-3.5 w-3.5 text-dark-600 shrink-0" aria-hidden />;

const link = 'text-amber-500/90 hover:text-amber-400 font-medium';
const current = 'text-dark-300 max-w-[min(100vw-6rem,28rem)] truncate';

type Props = {
  /** En ficha de usuario: email o nombre en la última miga. */
  userLabel?: string | null;
};

/**
 * Migas de pan para la consola super admin. «Consola» apunta al resumen `/admin`.
 */
const AdminBreadcrumbs: React.FC<Props> = ({ userLabel }) => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { userId } = useParams();

  const root = (
    <Link to="/admin" className={link}>
      {t('common.adminBreadcrumbs.console')}
    </Link>
  );

  if (pathname.startsWith('/admin/users/') && userId) {
    const last = (userLabel && userLabel.trim()) || t('common.adminBreadcrumbs.userNumber', { id: userId });
    return (
      <nav
        className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm"
        aria-label={t('common.adminBreadcrumbs.aria')}
      >
        {root}
        <Sep />
        <Link to="/admin/users" className={link}>
          {t('common.adminBreadcrumbs.users')}
        </Link>
        <Sep />
        <span className={current} title={last}>
          {last}
        </span>
      </nav>
    );
  }

  if (pathname === '/admin/audit') {
    return (
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label={t('common.adminBreadcrumbs.aria')}>
        {root}
        <Sep />
        <span className={current}>{t('common.adminBreadcrumbs.audit')}</span>
      </nav>
    );
  }

  if (pathname === '/admin/system') {
    return (
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label={t('common.adminBreadcrumbs.aria')}>
        {root}
        <Sep />
        <span className={current}>{t('common.adminBreadcrumbs.status')}</span>
      </nav>
    );
  }

  if (pathname === '/admin/subscriptions') {
    return (
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label={t('common.adminBreadcrumbs.aria')}>
        {root}
        <Sep />
        <span className={current}>{t('common.adminBreadcrumbs.plans')}</span>
      </nav>
    );
  }

  if (pathname === '/admin/users') {
    return (
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label={t('common.adminBreadcrumbs.aria')}>
        {root}
        <Sep />
        <span className={current}>{t('common.adminBreadcrumbs.users')}</span>
      </nav>
    );
  }

  if (pathname === '/admin/settings') {
    return (
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label={t('common.adminBreadcrumbs.aria')}>
        {root}
        <Sep />
        <span className={current}>{t('common.adminBreadcrumbs.settings')}</span>
      </nav>
    );
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    return (
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label={t('common.adminBreadcrumbs.aria')}>
        {root}
        <Sep />
        <span className={current}>{t('common.adminBreadcrumbs.overview')}</span>
      </nav>
    );
  }

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label={t('common.adminBreadcrumbs.aria')}>
      {root}
    </nav>
  );
};

export default AdminBreadcrumbs;
