import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { allowSuperAdminClientView } from '../constants/superAdminClientView';
import Dashboard from '../pages/Dashboard';

/**
 * Ruta "/": resumen; los super admin van a /admin salvo que hayan activado "Ir a la app" (sesión con bandera).
 */
const RootIndex: React.FC = () => {
  const { user, impersonatedBy } = useAuth();
  if (user?.isSuperAdmin && impersonatedBy == null && !allowSuperAdminClientView()) {
    return <Navigate to="/admin" replace />;
  }
  return <Dashboard />;
};

export default RootIndex;
