import api from './api';
import { User } from '../types';
import type { SubscriptionMe, SubscriptionPaymentItem } from './subscriptionClientService';

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
  /** Ventana de facturación actual (API en ISO/UTC) */
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export interface AdminSubscriptionPlanSummary {
  id: number;
  name: string;
  slug: string;
  description?: string;
  priceMonthly?: number;
  priceYearly?: number;
  currency?: string;
  paypalProductId?: string | null;
  paypalPlanIdMonthly?: string | null;
  paypalPlanIdYearly?: string | null;
  enabledModules?: Record<string, boolean>;
  isActive?: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminHealth {
  ok: boolean;
  database: 'up' | 'down';
  serverTime: string;
  uptimeSec: number;
  checkLatencyMs?: number;
  /** v22.x etc. */
  nodeVersion?: string;
  /** Resident set size aprox. (MB) */
  memoryRssMb?: number;
  /** p. ej. production | development */
  nodeEnv?: string;
  /** Despliegue: RELEASE, GIT_COMMIT, etc. (ver env) */
  deployRef?: string;
}

/** Indicadores de periodo en cobros / ventana de suscripción (solo lectura). */
export interface AdminDataQuality {
  totalPayments: number;
  paymentsNullPeriodStart: number;
  paymentsNullPeriodEnd: number;
  paymentsBothPeriodNull: number;
  activeSubscriptionsIncompleteWindow: number;
}

export interface AdminKpis {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  withSubscription: number;
  superAdmins: number;
  newLast7d: number;
  newLast30d: number;
  auditEventsLast24h: number;
  subscriptionByStatus: {
    active: number;
    trialing: number;
    cancelled: number;
    expired: number;
    pastDue: number;
  };
  usersWithoutSubscription: number;
  planDistribution: Array<{ planId: number; planName: string; userCount: number }>;
  /** Cobros registrados (webhook PayPal → subscription_payments, status completed) */
  subscriptionPayments: {
    totalRecorded: number;
    last30dCount: number;
    last30dAmountByCurrency: Array<{ currency: string; total: number }>;
  };
}

export interface AdminAuditEvent {
  id: number;
  action: string;
  targetType: string | null;
  targetId: number | null;
  details: unknown;
  createdAt: string;
  actorEmail: string;
}

export interface AdminService {
  getHealth: () => Promise<AdminHealth>;
  getSubscriptionDataQuality: () => Promise<AdminDataQuality>;
  getStats: () => Promise<AdminKpis>;
  listUsers: (params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: 'true' | 'false';
    planId?: string | number;
    /** `none` = sin fila en user_subscriptions */
    subscriptionStatus?: string;
    /** Fecha de registro del usuario (YYYY-MM-DD), filtra `created_at` */
    createdFrom?: string;
    createdTo?: string;
    /** Solapamiento del periodo de facturación (fechas en UTC, YYYY-MM-DD) */
    billingPeriodFrom?: string;
    billingPeriodTo?: string;
  }) => Promise<{
    users: AdminUserRow[];
    page: number;
    limit: number;
    total: number;
  }>;
  downloadUsersCsv: (params: {
    search?: string;
    isActive?: 'true' | 'false';
    planId?: string | number;
    subscriptionStatus?: string;
    createdFrom?: string;
    createdTo?: string;
    billingPeriodFrom?: string;
    billingPeriodTo?: string;
  }) => Promise<void>;
  listAuditLog: (params: { page?: number; limit?: number; action?: string }) => Promise<{
    events: AdminAuditEvent[];
    page: number;
    limit: number;
    total: number;
  }>;
  downloadAuditCsv: (params?: { action?: string }) => Promise<void>;
  getSettings: () => Promise<{ registrationEnabled: boolean; maintenanceMode: boolean }>;
  updateSettings: (body: {
    registrationEnabled?: boolean;
    maintenanceMode?: boolean;
  }) => Promise<{ registrationEnabled: boolean; maintenanceMode: boolean }>;
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
      /** Asignación manual: ventana + intervalo (default mensual en API) */
      billingInterval?: 'monthly' | 'yearly';
    }
  ) => Promise<unknown>;
  listSubscriptionPlans: () => Promise<{ plans: AdminSubscriptionPlanSummary[] }>;
  createSubscriptionPlan: (body: Record<string, unknown>) => Promise<unknown>;
  updateSubscriptionPlan: (id: number, body: Record<string, unknown>) => Promise<unknown>;
  syncSubscriptionPlanPaypal: (id: number) => Promise<{
    success: boolean;
    paypalProductId: string;
    paypalPlanIdMonthly: string;
    paypalPlanIdYearly: string;
    created: { product: boolean; monthly: boolean; yearly: boolean };
  }>;
  deleteSubscriptionPlan: (id: number) => Promise<unknown>;
  getUserById: (userId: number) => Promise<{
    user: {
      id: number;
      email: string;
      firstName?: string;
      lastName?: string;
      createdAt: string;
      isActive: boolean;
      isSuperAdmin: boolean;
    };
    subscription: SubscriptionMe;
  }>;
  getUserPayments: (userId: number) => Promise<{ payments: SubscriptionPaymentItem[] }>;
}

function downloadBlobResponse(res: { data: Blob; headers: Record<string, unknown> }, defaultName: string) {
  const dispo = res.headers['content-disposition'];
  const fromHeader =
    typeof dispo === 'string' && dispo.includes('filename=')
      ? /filename="([^"]+)"|filename=([^;]+)/i.exec(dispo)
      : null;
  const name =
    (fromHeader && (fromHeader[1] || fromHeader[2] || '').trim().replace(/"/g, '')) || defaultName;
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.URL.revokeObjectURL(url);
}

export const adminService: AdminService = {
  getHealth: async () => {
    const response = await api.get<AdminHealth>('/admin/health');
    return response.data;
  },

  getSubscriptionDataQuality: async () => {
    const response = await api.get<AdminDataQuality>('/admin/data-quality/subscription-payments');
    return response.data;
  },

  getStats: async () => {
    const response = await api.get<AdminKpis>('/admin/stats');
    return response.data;
  },

  listUsers: async (params) => {
    const response = await api.get<{
      users: AdminUserRow[];
      page: number;
      limit: number;
      total: number;
    }>('/admin/users', { params });
    return response.data;
  },

  downloadUsersCsv: async (params) => {
    const response = await api.get<Blob>('/admin/users', {
      params: { ...params, format: 'csv' },
      responseType: 'blob',
    });
    downloadBlobResponse(response, 'usuarios.csv');
  },

  listAuditLog: async (params) => {
    const response = await api.get<{
      events: AdminAuditEvent[];
      page: number;
      limit: number;
      total: number;
    }>('/admin/audit-log', { params });
    return response.data;
  },

  downloadAuditCsv: async (params) => {
    const response = await api.get<Blob>('/admin/audit-log', {
      params: { ...params, format: 'csv' },
      responseType: 'blob',
    });
    downloadBlobResponse(response, 'auditoria.csv');
  },

  getSettings: async () => {
    const response = await api.get<{ registrationEnabled: boolean; maintenanceMode: boolean }>('/admin/settings');
    return response.data;
  },

  updateSettings: async (body: { registrationEnabled?: boolean; maintenanceMode?: boolean }) => {
    const response = await api.patch<{ registrationEnabled: boolean; maintenanceMode: boolean }>(
      '/admin/settings',
      body
    );
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

  updateUser: async (userId, body) => {
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

  syncSubscriptionPlanPaypal: async (id: number) => {
    const response = await api.post<{
      success: boolean;
      paypalProductId: string;
      paypalPlanIdMonthly: string;
      paypalPlanIdYearly: string;
      created: { product: boolean; monthly: boolean; yearly: boolean };
    }>(`/admin/subscription-plans/${id}/sync-paypal`);
    return response.data;
  },

  deleteSubscriptionPlan: async (id: number) => {
    const response = await api.delete(`/admin/subscription-plans/${id}`);
    return response.data;
  },

  getUserById: async (userId: number) => {
    const response = await api.get<{
      user: {
        id: number;
        email: string;
        firstName?: string;
        lastName?: string;
        createdAt: string;
        isActive: boolean;
        isSuperAdmin: boolean;
      };
      subscription: SubscriptionMe;
    }>(`/admin/users/${userId}`);
    return response.data;
  },

  getUserPayments: async (userId: number) => {
    const response = await api.get<{ payments: SubscriptionPaymentItem[] }>(`/admin/users/${userId}/payments`);
    return response.data;
  },
};
