import axios from 'axios';
import toast from 'react-hot-toast';
import { getSubscriptionPlanAssignedFlag } from '../subscriptionPlanGate';

/**
 * REACT_APP_API_URL debe fijarse en build de producción si el API no va en el mismo origen (ej. api.tudominio.com).
 * Si no está definido: en producción usamos el mismo host que la PWA + /api (nginx debe proxy a Node);
 * en desarrollo, localhost:5000.
 */
function resolveApiBaseUrl(): string {
  const fromEnv = process.env.REACT_APP_API_URL;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
    return `${window.location.origin}/api`;
  }
  return 'http://localhost:5000/api';
}

const API_URL = resolveApiBaseUrl();

let subscriptionDeniedRedirecting = false;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 / 403 subscription
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      return Promise.reject(error);
    }
    if (error.response?.status === 403) {
      const code = error.response?.data?.code;
      if (code === 'SUBSCRIPTION_MODULE_DENIED') {
        const path = window.location.pathname || '';
        const onSubscriptionPage = path === '/subscription' || path.startsWith('/subscription/');
        const planAssigned = getSubscriptionPlanAssignedFlag();
        const message =
          error.response?.data?.message ||
          (planAssigned === false
            ? 'Tu suscripción no incluye este módulo. Elige un plan en Planes y suscripción.'
            : 'Tu plan actual no incluye esta acción o módulo.');
        toast.error(message);
        // Solo redirigir a Planes y suscripción si el usuario aún no tiene plan configurado
        if (
          planAssigned === false &&
          !onSubscriptionPage &&
          !subscriptionDeniedRedirecting
        ) {
          subscriptionDeniedRedirecting = true;
          window.setTimeout(() => {
            window.location.href = '/subscription';
          }, 0);
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
