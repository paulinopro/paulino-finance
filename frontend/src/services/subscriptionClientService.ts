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
  currentPeriodEnd: string | null;
  paypalSubscriptionId: string | null;
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
