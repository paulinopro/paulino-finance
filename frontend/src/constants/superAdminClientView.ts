/** Super admin: permite ver el shell de la app (finanzas, etc.); al volver a /admin se limpia. */
export const SUPERADMIN_CLIENT_VIEW_KEY = 'pf_superadmin_client';

export function allowSuperAdminClientView(): boolean {
  try {
    return sessionStorage.getItem(SUPERADMIN_CLIENT_VIEW_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSuperAdminClientViewOn(): void {
  try {
    sessionStorage.setItem(SUPERADMIN_CLIENT_VIEW_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function clearSuperAdminClientView(): void {
  try {
    sessionStorage.removeItem(SUPERADMIN_CLIENT_VIEW_KEY);
  } catch {
    /* ignore */
  }
}
