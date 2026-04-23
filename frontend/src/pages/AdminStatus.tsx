import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Stethoscope, Database, Clock, Server, ListTree, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService, type AdminHealth, type AdminDataQuality } from '../services/adminService';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';

function formatUptime(sec: number): string {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  const d = Math.floor(h / 24);
  return `~${d} d`;
}

const AdminStatus: React.FC = () => {
  const [data, setData] = useState<AdminHealth | null>(null);
  const [dq, setDq] = useState<AdminDataQuality | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setDq(null);
    const results = await Promise.allSettled([
      adminService.getHealth(),
      adminService.getSubscriptionDataQuality(),
    ]);
    const hRes = results[0] as PromiseSettledResult<AdminHealth>;
    const qRes = results[1] as PromiseSettledResult<AdminDataQuality>;
    if (hRes.status === 'fulfilled') {
      setData(hRes.value);
    } else {
      const e = hRes.reason as { response?: { data?: AdminHealth; status?: number } };
      if (e.response?.status === 503) {
        const d = (e.response?.data || {}) as Partial<AdminHealth>;
        setData({
          ok: false,
          database: 'down',
          serverTime: d.serverTime ?? new Date().toISOString(),
          uptimeSec: d.uptimeSec ?? 0,
          checkLatencyMs: d.checkLatencyMs,
          nodeVersion: d.nodeVersion,
          memoryRssMb: d.memoryRssMb,
          nodeEnv: d.nodeEnv,
          deployRef: d.deployRef,
        });
      } else {
        toast.error('No se pudo consultar el estado del sistema');
        setData(null);
      }
    }
    if (qRes.status === 'fulfilled') {
      setDq(qRes.value);
    } else {
      setDq(null);
      toast.error('No se pudieron cargar los conteos de periodos');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <AdminBreadcrumbs />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div className="flex items-start gap-3">
            <div className="p-3 rounded-xl bg-primary-600/20 text-primary-400">
              <Stethoscope className="w-8 h-8" />
            </div>
            <div>
              <h1 className="page-title">Estado del sistema</h1>
              <p className="text-dark-400 text-sm">BD, proceso Node y señal mínima para operación (sin APM)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="btn-primary inline-flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        <div className="card p-6 space-y-4">
          {loading ? (
            <p className="text-dark-500">Cargando…</p>
          ) : !data ? (
            <p className="text-dark-500">Sin datos de salud del API.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <Database className="w-5 h-5 text-sky-400 shrink-0" />
                <div>
                  <p className="text-dark-500 text-sm">Base de datos</p>
                  <p
                    className={`font-medium ${
                      data.database === 'up' && data.ok ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {data.database === 'up' && data.ok ? 'Operativa' : 'No disponible'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-dark-400 shrink-0" />
                <div>
                  <p className="text-dark-500 text-sm">Hora del servidor (ISO)</p>
                  <p className="text-white font-mono text-sm break-all">{data.serverTime}</p>
                </div>
              </div>
              <div>
                <p className="text-dark-500 text-sm">Proceso API (uptime)</p>
                <p className="text-white">{formatUptime(data.uptimeSec)}</p>
              </div>
              {data.checkLatencyMs != null && (
                <p className="text-dark-500 text-xs">Latencia consulta BD: {data.checkLatencyMs} ms</p>
              )}
              {(data.nodeVersion != null || data.memoryRssMb != null || data.nodeEnv != null) && (
                <div className="flex items-start gap-3 pt-2 border-t border-dark-700">
                  <Server className="w-5 h-5 text-violet-400/90 shrink-0 mt-0.5" />
                  <div className="space-y-1 text-sm">
                    <p className="text-dark-500">Proceso Node (API)</p>
                    {data.nodeVersion != null && (
                      <p className="text-dark-200">
                        <span className="text-dark-500">Runtime:</span> {data.nodeVersion}
                      </p>
                    )}
                    {data.nodeEnv != null && (
                      <p className="text-dark-200">
                        <span className="text-dark-500">NODE_ENV:</span>{' '}
                        <span className="font-mono text-xs">{data.nodeEnv}</span>
                      </p>
                    )}
                    {data.memoryRssMb != null && (
                      <p className="text-dark-200">
                        <span className="text-dark-500">Memoria RSS (aprox.):</span> {data.memoryRssMb} MB
                      </p>
                    )}
                    {data.deployRef != null && data.deployRef !== '' && (
                      <p className="text-dark-200">
                        <span className="text-dark-500">Despliegue:</span>{' '}
                        <span className="font-mono text-xs">{data.deployRef}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {dq && (
          <div className="card p-6 space-y-3 mt-4">
            <div className="flex items-start gap-3">
              <ListTree className="w-5 h-5 text-amber-400/90 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <h2 className="text-base font-medium text-white">Calidad de datos (suscripciones / cobros)</h2>
                <p className="text-dark-500 text-sm mt-0.5">
                  Conteos de filas; no altera la base. Criterio de “hecho” en el plan: reducir nulos
                  injustificados. Script opcional: <code className="text-dark-300 text-xs">docs/scripts/backfill_subscription_payment_periods.sql</code>
                </p>
              </div>
            </div>
            {dq.totalPayments > 0 &&
              (dq.paymentsBothPeriodNull > 0 ||
                dq.paymentsNullPeriodStart > 0 ||
                dq.paymentsNullPeriodEnd > 0 ||
                dq.activeSubscriptionsIncompleteWindow > 0) && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-900/20 border border-amber-800/40 px-3 py-2 text-amber-100/90 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Hay campos de periodo por completar. Revisar con SQL de backfill o nuevos eventos
                    de PayPal.
                  </span>
                </div>
              )}
            <ul className="text-sm text-dark-200 space-y-1.5 font-mono">
              <li>
                <span className="text-dark-500">Cobros totales:</span> {dq.totalPayments}
              </li>
              <li>
                <span className="text-dark-500">period_start nulo:</span> {dq.paymentsNullPeriodStart}
              </li>
              <li>
                <span className="text-dark-500">period_end nulo:</span> {dq.paymentsNullPeriodEnd}
              </li>
              <li>
                <span className="text-dark-500">Ambos nulos en cobro:</span> {dq.paymentsBothPeriodNull}
              </li>
              <li>
                <span className="text-dark-500">Suscr. activa/trial sin ventana completa (desde/hasta):</span>{' '}
                {dq.activeSubscriptionsIncompleteWindow}
              </li>
            </ul>
          </div>
        )}

        <p className="text-dark-500 text-xs mt-4">
          No es APM: no hay colas, CPU por request ni alertas. Sirve para comprobar que el API responde y el proceso
          razona en memoria acotada.
        </p>
      </motion.div>
    </div>
  );
};

export default AdminStatus;
