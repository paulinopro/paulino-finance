import api from './api';

export interface SubscriptionMe {
  isSuperAdmin?: boolean;
  status: string;
  plan: {
    id: number;
    name: string;
    slug: string;
    priceMonthly: number;
    priceYearly: number;
    currency: string;
  } | null;
  modules: string[];
  /** Inicio del ciclo de facturación actual (PayPal o null si no aplica) */
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** Facturación mensual o anual cuando aplica */
  billingInterval: 'monthly' | 'yearly' | null;
  paypalSubscriptionId: string | null;
}

export interface SubscriptionPaymentItem {
  id: number;
  amount: string;
  currency: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  paidAt: string;
  source: string;
  planName: string | null;
  planSlug: string | null;
}

export const subscriptionClientService = {
  getMe: async (): Promise<SubscriptionMe> => {
    const { data } = await api.get<SubscriptionMe>('/subscription/me');
    return data;
  },

  getPlans: async () => {
    const { data } = await api.get<{ plans: unknown[] }>('/subscription/plans');
    return data.plans;
  },

  getPaymentHistory: async (): Promise<SubscriptionPaymentItem[]> => {
    const { data } = await api.get<{ payments: SubscriptionPaymentItem[] }>('/subscription/payments');
    return data.payments;
  },

  startPaypal: async (body: {
    planId: number;
    billingCycle: 'monthly' | 'yearly';
    returnUrl: string;
    cancelUrl: string;
  }) => {
    const { data } = await api.post<{ approvalUrl: string; subscriptionId: string }>(
      '/subscription/paypal/start',
      body
    );
    return data;
  },
};
