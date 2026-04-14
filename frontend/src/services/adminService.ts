import api from './api';
import { User } from '../types';

export interface AdminUserRow {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  /** ID en `subscription_plans`; null si aún no hay fila en `user_subscriptions` */
  planId: number | null;
  subscriptionPlan: string;
  subscriptionPlanName?: string | null;
  subscriptionStatus: string;
}

export interface AdminSubscriptionPlanSummary {
  id: number;
  name: string;
  slug: string;
}

export interface AdminService {
  listUsers: (params: { page?: number; limit?: number; search?: string }) => Promise<{
    users: AdminUserRow[];
    page: number;
    limit: number;
    total: number;
  }>;
  getSettings: () => Promise<{ registrationEnabled: boolean }>;
  updateSettings: (registrationEnabled: boolean) => Promise<{ registrationEnabled: boolean }>;
  impersonate: (userId: number) => Promise<{
    token: string;
    user: User;
    impersonatedBy: number;
  }>;
  stopImpersonation: () => Promise<{ token: string; user: User }>;
  updateUser: (
    userId: number,
    body: {
      isActive?: boolean;
      subscriptionPlan?: string;
      subscriptionStatus?: string;
      planId?: number;
    }
  ) => Promise<unknown>;
  listSubscriptionPlans: () => Promise<{ plans: AdminSubscriptionPlanSummary[] }>;
  createSubscriptionPlan: (body: Record<string, unknown>) => Promise<unknown>;
  updateSubscriptionPlan: (id: number, body: Record<string, unknown>) => Promise<unknown>;
  deleteSubscriptionPlan: (id: number) => Promise<unknown>;
}

export const adminService: AdminService = {
  listUsers: async (params: { page?: number; limit?: number; search?: string }) => {
    const response = await api.get<{
      users: AdminUserRow[];
      page: number;
      limit: number;
      total: number;
    }>('/admin/users', { params });
    return response.data;
  },

  getSettings: async () => {
    const response = await api.get<{ registrationEnabled: boolean }>('/admin/settings');
    return response.data;
  },

  updateSettings: async (registrationEnabled: boolean) => {
    const response = await api.patch<{ registrationEnabled: boolean }>('/admin/settings', {
      registrationEnabled,
    });
    return response.data;
  },

  impersonate: async (userId: number) => {
    const response = await api.post<{
      token: string;
      user: User;
      impersonatedBy: number;
    }>(`/admin/impersonate/${userId}`);
    return response.data;
  },

  stopImpersonation: async () => {
    const response = await api.post<{ token: string; user: User }>('/admin/stop-impersonation');
    return response.data;
  },

  updateUser: async (
    userId: number,
    body: {
      isActive?: boolean;
      subscriptionPlan?: string;
      subscriptionStatus?: string;
      planId?: number;
    }
  ) => {
    const response = await api.patch(`/admin/users/${userId}`, body);
    return response.data;
  },

  listSubscriptionPlans: async () => {
    const response = await api.get<{ plans: AdminSubscriptionPlanSummary[] }>('/admin/subscription-plans');
    return response.data;
  },

  createSubscriptionPlan: async (body: Record<string, unknown>) => {
    const response = await api.post('/admin/subscription-plans', body);
    return response.data;
  },

  updateSubscriptionPlan: async (id: number, body: Record<string, unknown>) => {
    const response = await api.put(`/admin/subscription-plans/${id}`, body);
    return response.data;
  },

  deleteSubscriptionPlan: async (id: number) => {
    const response = await api.delete(`/admin/subscription-plans/${id}`);
    return response.data;
  },
};
