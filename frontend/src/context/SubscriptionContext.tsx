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
      return;
    }
    try {
      setLoadError(false);
      const data = await subscriptionClientService.getMe();
      setSubscription(data);
    } catch {
      setSubscription(null);
      setLoadError(true);
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
    setLoading(true);
    refetch();
  }, [refetch]);

  const hasModule = useCallback(
    (key: string) => {
      if (user?.isSuperAdmin || subscription?.isSuperAdmin) return true;
      return subscription?.modules?.includes(key) ?? false;
    },
    [user?.isSuperAdmin, subscription]
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
