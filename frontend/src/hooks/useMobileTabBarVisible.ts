import { useLocation } from 'react-router-dom';

/**
 * Indica si la barra inferior móvil está presente: mismas rutas que Layout,
 * excluyendo auth y /admin (no hay tab bar ahí).
 */
export function useMobileTabBarVisible(): boolean {
  const { pathname } = useLocation();
  const isAuth =
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password';
  if (isAuth) return false;
  if (pathname.startsWith('/admin')) return false;
  return true;
}
