import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  UserMinus,
  Link2,
  Activity,
  Layers,
  Settings,
  Stethoscope,
  ListTree,
  TrendingUp,
  Banknote,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { adminService, type AdminKpis } from '../services/adminService';
import { CATEGORY_CHART_COLORS } from '../constants/chartColors';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'rgba(15, 23, 42, 0.95)',
  border: '1px solid rgba(51, 65, 85, 0.8)',
  borderRadius: '8px',
  fontSize: '12px',
};

const CHART_AXIS_TICK = { fill: '#94a3b8', fontSize: 11 };

function formatAdminCurrency(amount: number, currency: string): string {
  const cur = currency?.length === 3 ? currency.toUpperCase() : 'USD';
  try {
    return new Intl.NumberFormat('es-DO', {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${cur}`;
  }
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<AdminKpis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminService
      .getStats()
      .then((s) => setStats(s))
      .catch(() => {
        toast.error('No se pudieron cargar las estadísticas');
      })
      .finally(() => setLoading(false));
  }, []);

  const s = stats;

  const statusChartData = s
    ? [
        { label: 'active', value: s.subscriptionByStatus.active },
        { label: 'trialing', value: s.subscriptionByStatus.trialing },
        { label: 'cancelled', value: s.subscriptionByStatus.cancelled },
        { label: 'expired', value: s.subscriptionByStatus.expired },
        { label: 'past_due', value: s.subscriptionByStatus.pastDue },
      ]
    : [];

  const planChartData = s
    ? s.planDistribution.map((p) => ({
        name:
          p.planName.length > 22 ? `${p.planName.slice(0, 20)}…` : p.planName,
        fullName: p.planName,
        userCount: p.userCount,
      }))
    : [];

  const subscriptionPayments = s?.subscriptionPayments ?? {
    totalRecorded: 0,
    last30dCount: 0,
    last30dAmountByCurrency: [] as { currency: string; total: number }[],
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <AdminBreadcrumbs />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary-600/20 text-primary-400">
              <LayoutDashboard className="w-8 h-8" />
            </div>
            <div>
              <h1 className="page-title">Resumen del sistema</h1>
              <p className="text-dark-400 text-sm">Indicadores y accesos rápidos a la consola</p>
            </div>
          </div>
        </div>

        {loading && !s && (
          <p className="text-dark-500 text-sm mb-6">Cargando indicadores…</p>
        )}

        {s && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="card p-4 flex items-start gap-3">
                <Users className="w-5 h-5 text-primary-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">Usuarios totales</p>
                  <p className="text-lg font-semibold text-white">{s.totalUsers}</p>
                  <p className="text-dark-500 text-xs mt-1">
                    {s.newLast7d} nuevos (7d) · {s.newLast30d} (30d)
                  </p>
                </div>
              </div>
              <div className="card p-4 flex items-start gap-3">
                <UserMinus className="w-5 h-5 text-emerald-400/90 mt-0.5 shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">Cuentas activas / bloqueadas</p>
                  <p className="text-lg font-semibold text-white">
                    {s.activeUsers} <span className="text-dark-500 text-sm">/</span> {s.disabledUsers}
                  </p>
                </div>
              </div>
              <div className="card p-4 flex items-start gap-3">
                <Link2 className="w-5 h-5 text-sky-400/90 mt-0.5 shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">Con fila de suscripción</p>
                  <p className="text-lg font-semibold text-white">{s.withSubscription}</p>
                  <p className="text-dark-500 text-xs mt-1">{s.usersWithoutSubscription} sin asignar</p>
                </div>
              </div>
              <div className="card p-4 flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-amber-400/90 mt-0.5 shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">Super admin</p>
                  <p className="text-lg font-semibold text-white">{s.superAdmins}</p>
                </div>
              </div>
            </div>

            <div className="card p-4 mb-6 flex items-start gap-3">
              <Banknote className="w-5 h-5 text-emerald-400/90 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-white mb-1">Cobros de suscripción (PayPal)</h2>
                <p className="text-dark-500 text-xs mb-2">
                  Últimos 30 días: {subscriptionPayments.last30dCount} cobros · {subscriptionPayments.totalRecorded}{' '}
                  registros totales en historial
                </p>
                {subscriptionPayments.last30dAmountByCurrency.length === 0 ? (
                  <p className="text-dark-400 text-sm">
                    Sin sumas en este periodo (sin cobros completados o sin filas en esa ventana).
                  </p>
                ) : (
                  <ul className="text-sm space-y-1">
                    {subscriptionPayments.last30dAmountByCurrency.map((row) => (
                      <li key={row.currency} className="flex justify-between gap-4 text-dark-300">
                        <span>{row.currency}</span>
                        <span className="text-white font-medium tabular-nums">
                          {formatAdminCurrency(row.total, row.currency)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-dark-500 text-[0.65rem] mt-2">
                  Suma de subscription_payments en estado completado (p. ej. webhook). No refleja comisiones ni impuestos de
                  PayPal.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <div className="card p-4">
                <h2 className="text-sm font-semibold text-white mb-1">Suscripciones por estado</h2>
                <p className="text-dark-500 text-xs mb-3">Filas en user_subscriptions por status</p>
                <div className="h-[220px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.5)" vertical={false} />
                      <XAxis dataKey="label" tick={CHART_AXIS_TICK} axisLine={{ stroke: '#475569' }} />
                      <YAxis tick={CHART_AXIS_TICK} axisLine={{ stroke: '#475569' }} allowDecimals={false} width={36} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        labelStyle={{ color: '#e2e8f0' }}
                        formatter={(v: number) => [v, 'Usuarios']}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                        {statusChartData.map((_, i) => (
                          <Cell key={i} fill={CATEGORY_CHART_COLORS[i % CATEGORY_CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="card p-4">
                <h2 className="text-sm font-semibold text-white mb-1">Usuarios por plan</h2>
                <p className="text-dark-500 text-xs mb-3">Asignaciones actuales (plan_id)</p>
                {planChartData.length === 0 ? (
                  <p className="text-dark-500 text-sm py-8">Sin planes configurados</p>
                ) : (
                  <div className="h-[220px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={planChartData}
                        margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(51,65,85,0.5)" horizontal={false} />
                        <XAxis type="number" tick={CHART_AXIS_TICK} axisLine={{ stroke: '#475569' }} allowDecimals={false} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={108}
                          tick={CHART_AXIS_TICK}
                          axisLine={{ stroke: '#475569' }}
                        />
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          labelStyle={{ color: '#e2e8f0' }}
                          formatter={(v: number) => [v, 'Usuarios']}
                          labelFormatter={(_, payload) =>
                            (payload?.[0]?.payload as { fullName?: string })?.fullName ?? ''
                          }
                        />
                        <Bar dataKey="userCount" radius={[0, 4, 4, 0]} maxBarSize={22}>
                          {planChartData.map((_, i) => (
                            <Cell key={i} fill={CATEGORY_CHART_COLORS[i % CATEGORY_CHART_COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            <div className="mb-6">
              <Link
                to="/admin/audit"
                className="card p-4 flex items-start gap-3 hover:border-amber-500/30 border border-dark-700 transition"
              >
                <Activity className="w-5 h-5 text-amber-400/90 mt-0.5 shrink-0" />
                <div>
                  <p className="text-dark-500 text-xs">Auditoría (24h)</p>
                  <p className="text-lg font-semibold text-white">{s.auditEventsLast24h}</p>
                  <p className="text-dark-500 text-xs mt-1">Abrir registro de acciones de administración →</p>
                </div>
              </Link>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/admin/users"
            className="card flex items-center gap-3 p-4 hover:border-primary-600/40 transition border border-dark-700"
          >
            <Users className="w-6 h-6 text-primary-400 shrink-0" />
            <div>
              <p className="font-medium text-white">Usuarios</p>
              <p className="text-dark-500 text-sm">Listado, filtros, plan y suplantación</p>
            </div>
          </Link>
          <Link
            to="/admin/settings"
            className="card flex items-center gap-3 p-4 hover:border-primary-600/40 transition border border-dark-700"
          >
            <Settings className="w-6 h-6 text-primary-400 shrink-0" />
            <div>
              <p className="font-medium text-white">Configuración global</p>
              <p className="text-dark-500 text-sm">Registro público y modo mantenimiento</p>
            </div>
          </Link>
          <Link
            to="/admin/subscriptions"
            className="card flex items-center gap-3 p-4 hover:border-primary-600/40 transition border border-dark-700"
          >
            <Layers className="w-6 h-6 text-primary-400 shrink-0" />
            <div>
              <p className="font-medium text-white">Planes de suscripción</p>
              <p className="text-dark-500 text-sm">Precios, módulos por plan e integración PayPal</p>
            </div>
          </Link>
          <Link
            to="/admin/audit"
            className="card flex items-center gap-3 p-4 hover:border-primary-600/40 transition border border-dark-700"
          >
            <ListTree className="w-6 h-6 text-primary-400 shrink-0" />
            <div>
              <p className="font-medium text-white">Auditoría</p>
              <p className="text-dark-500 text-sm">Historial de acciones</p>
            </div>
          </Link>
          <Link
            to="/admin/system"
            className="card flex items-center gap-3 p-4 hover:border-amber-600/30 transition border border-dark-700 sm:col-span-2"
          >
            <Stethoscope className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <p className="font-medium text-white">Estado del API</p>
              <p className="text-dark-500 text-sm">Salud, BD y entorno de ejecución</p>
            </div>
          </Link>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminDashboard;
