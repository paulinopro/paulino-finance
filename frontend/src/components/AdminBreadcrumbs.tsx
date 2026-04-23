import React from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const Sep = () => <ChevronRight className="h-3.5 w-3.5 text-dark-600 shrink-0" aria-hidden />;

const link = 'text-amber-500/90 hover:text-amber-400 font-medium';
const current = 'text-dark-300 max-w-[min(100vw-6rem,28rem)] truncate';

type Props = {
  /** En ficha de usuario: email o nombre en la última miga. */
  userLabel?: string | null;
};

/**
 * Migas de pan para la consola super admin. «Consola» apunta a `/admin`.
 */
const AdminBreadcrumbs: React.FC<Props> = ({ userLabel }) => {
  const { pathname } = useLocation();
  const { userId } = useParams();

  const root = (
    <Link to="/admin" className={link}>
      Consola
    </Link>
  );

  if (pathname.startsWith('/admin/users/') && userId) {
    const last = (userLabel && userLabel.trim()) || `Usuario #${userId}`;
    return (
      <nav
        className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm"
        aria-label="Migas de pan"
      >
        {root}
        <Sep />
        <Link to="/admin" className={link}>
          Usuarios
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
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label="Migas de pan">
        {root}
        <Sep />
        <span className={current}>Auditoría</span>
      </nav>
    );
  }

  if (pathname === '/admin/system') {
    return (
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label="Migas de pan">
        {root}
        <Sep />
        <span className={current}>Estado</span>
      </nav>
    );
  }

  if (pathname === '/admin/subscriptions') {
    return (
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label="Migas de pan">
        {root}
        <Sep />
        <span className={current}>Planes (producto)</span>
      </nav>
    );
  }

  if (pathname === '/admin' || pathname === '/admin/') {
    return (
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label="Migas de pan">
        {root}
        <Sep />
        <span className={current}>Usuarios</span>
      </nav>
    );
  }

  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs sm:text-sm" aria-label="Migas de pan">
      {root}
    </nav>
  );
};

export default AdminBreadcrumbs;
