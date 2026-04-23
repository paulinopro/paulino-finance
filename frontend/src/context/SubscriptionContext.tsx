import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  ReactNode,
} from 'react';
import { subscriptionClientService, SubscriptionMe } from '../services/subscriptionClientService';
import { setSubscriptionPlanAssignedFlag } from '../subscriptionPlanGate';
import { useAuth } from './AuthContext';

interface SubscriptionContextType {
  subscription: SubscriptionMe | null;
  loading: boolean;
  /** true si la petición a /subscription/me falló (red no servidor) */
  loadError: boolean;
  hasModule: (key: string) => boolean;
  refetch: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const refetch = useCallback(async () => {
    if (!user) {
      setSubscription(null);
      setLoadError(false);
      setLoading(false);
      setSubscriptionPlanAssignedFlag(null);
      return;
    }
    setLoading(true);
    try {
      setLoadError(false);
      const data = await subscriptionClientService.getMe();
      setSubscription(data);
      const assigned = Boolean(
        user.isSuperAdmin ||
          data.isSuperAdmin ||
          data.plan != null ||
          (data.status != null && data.status !== 'none')
      );
      setSubscriptionPlanAssignedFlag(assigned);
    } catch {
      setSubscription(null);
      setLoadError(true);
      setSubscriptionPlanAssignedFlag(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  /** Antes del primer paint cuando aparece el usuario: evita un frame con loading=false y subscription=null (redirect erróneo en Layout). */
  useLayoutEffect(() => {
    if (user?.id != null) {
      setLoading(true);
    }
  }, [user?.id]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  /** Marca el gate antes de que termine /subscription/me: el perfil de auth ya indica si hay fila en user_subscriptions. */
  useEffect(() => {
    if (!user) {
      setSubscriptionPlanAssignedFlag(null);
      return;
    }
    if (user.isSuperAdmin || user.hasUserSubscriptionRecord === true) {
      setSubscriptionPlanAssignedFlag(true);
    } else if (user.hasUserSubscriptionRecord === false) {
      setSubscriptionPlanAssignedFlag(false);
    }
  }, [user]);

  const hasModule = useCallback(
    (key: string) => {
      if (user?.isSuperAdmin || subscription?.isSuperAdmin) return true;
      if (!user) return false;
      if (!subscription) {
        // Sin /subscription/me aún: no denegar (evita menú vacío, tab bar y falsos "sin módulo").
        // error de red: fail-open en UI; el API sigue aplicando el plan.
        if (loading || loadError) return true;
        return false;
      }
      // Vencida: sin módulos en cliente; la ruta debe llevar a renovación, no al mensaje de "plan sin sección"
      if (subscription.status === 'expired') return false;
      const modules = subscription.modules;
      const st = subscription.status;
      const hasPlan = subscription.plan != null;
      const planSlug = subscription.plan?.slug;
      // Plan de pago / completo con lista vacía por JSON corrupto o migración: no mostrar "sin sección" para todo
      if (
        hasPlan &&
        (st === 'active' || st === 'trialing') &&
        (!modules || modules.length === 0) &&
        planSlug != null &&
        planSlug !== 'free'
      ) {
        return true;
      }
      return modules?.includes(key) ?? false;
    },
    [user, subscription, loading, loadError]
  );

  return (
    <SubscriptionContext.Provider value={{ subscription, loading, loadError, hasModule, refetch }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return ctx;
};
