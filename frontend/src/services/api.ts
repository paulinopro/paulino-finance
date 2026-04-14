import axios from 'axios';
import toast from 'react-hot-toast';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

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
        if (!onSubscriptionPage && !subscriptionDeniedRedirecting) {
          subscriptionDeniedRedirecting = true;
          toast.error(
            error.response?.data?.message ||
              'Tu suscripción no incluye este módulo. Elige un plan en Suscripción.'
          );
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
