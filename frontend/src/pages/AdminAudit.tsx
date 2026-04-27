import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, ListTree, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService, type AdminAuditEvent } from '../services/adminService';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import AdminBreadcrumbs from '../components/AdminBreadcrumbs';

const ACTION_OPTIONS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'user.impersonate', label: 'Suplantar' },
  { value: 'user.impersonate_end', label: 'Fin de suplantación' },
  { value: 'user.update', label: 'Actualizar usuario' },
  { value: 'settings.registration', label: 'Config. registro' },
  { value: 'settings.maintenance', label: 'Config. mantenimiento' },
  { value: 'plan.create', label: 'Crear plan' },
  { value: 'plan.update', label: 'Actualizar plan' },
  { value: 'plan.delete', label: 'Eliminar plan' },
  { value: 'plan.sync_paypal', label: 'Sync PayPal' },
];

function formatDetails(details: unknown): string {
  if (details == null) return '—';
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

const ADMIN_AUDIT_DEFAULT_PAGE_SIZE = 30;

const AdminAudit: React.FC = () => {
  const { pageSize: limit, setPageSize: setAuditPageLimit, pageSizeOptions: auditPageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:adminAudit', ADMIN_AUDIT_DEFAULT_PAGE_SIZE);
  const [events, setEvents] = useState<AdminAuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [actionInput, setActionInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminService.listAuditLog({
        page,
        limit,
        action: action || undefined,
      });
      setEvents(r.events);
      setTotal(r.total);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al cargar auditoría');
    } finally {
      setLoading(false);
    }
  }, [page, action, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyActionFilter = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAction(actionInput.trim());
  };

  useEffect(() => {
    setPage(1);
  }, [limit]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const downloadCsv = async () => {
    try {
      await adminService.downloadAuditCsv({ action: action || undefined });
      toast.success('Descarga lista');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Error al exportar');
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <AdminBreadcrumbs />
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-center sm:text-left">
            <div className="p-3 rounded-xl bg-primary-600/20 text-primary-400">
              <ListTree className="w-8 h-8" />
            </div>
            <div>
              <h1 className="page-title">Auditoría</h1>
              <p className="text-dark-400 text-sm">Acciones registradas en consola (super admin)</p>
            </div>
          </div>
          <button type="button" onClick={downloadCsv} className="btn-primary inline-flex items-center gap-2">
            <Download className="w-4 h-4" />
            CSV (hasta 5.000)
          </button>
        </div>

        <form onSubmit={applyActionFilter} className="flex flex-col sm:flex-row gap-2 mb-6">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
              <select
                className="input pl-10 w-full"
                value={actionInput}
                onChange={(e) => setActionInput(e.target.value)}
                aria-label="Filtrar por acción"
              >
                {ACTION_OPTIONS.map((o) => (
                  <option key={o.value || 'all'} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary px-4 shrink-0">
              Filtrar
            </button>
          </div>
        </form>

        <div className="card overflow-hidden">
          <div className="table-responsive table-stack">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-dark-700 text-dark-400">
                  <th className="py-3 px-2">Fecha</th>
                  <th className="py-3 px-2">Acción</th>
                  <th className="py-3 px-2">Actor</th>
                  <th className="py-3 px-2">Objetivo</th>
                  <th className="py-3 px-2 min-w-[120px]">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-dark-500">
                      Cargando…
                    </td>
                  </tr>
                ) : events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-dark-500">
                      Sin eventos
                    </td>
                  </tr>
                ) : (
                  events.map((ev) => (
                    <tr key={ev.id} className="border-b border-dark-800/80 hover:bg-dark-800/40 max-md:border-0">
                      <td data-label="Fecha" className="py-3 px-2 text-dark-300 whitespace-nowrap">
                        {ev.createdAt
                          ? new Date(ev.createdAt).toLocaleString('es-419', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                      <td data-label="Acción" className="py-3 px-2 font-mono text-xs text-primary-200 break-all">
                        {ev.action}
                      </td>
                      <td data-label="Actor" className="py-3 px-2 break-all">
                        {ev.actorEmail}
                      </td>
                      <td data-label="Objetivo" className="py-3 px-2 text-dark-400 text-xs break-all">
                        {[ev.targetType, ev.targetId != null ? `#${ev.targetId}` : ''].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td data-label="Detalle" className="py-3 px-2 text-dark-500 text-xs max-w-[min(100vw,20rem)] md:max-w-md">
                        <span className="line-clamp-3" title={formatDetails(ev.details)}>
                          {formatDetails(ev.details)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <TablePagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={total}
          itemsPerPage={limit}
          onPageChange={setPage}
          itemLabel="eventos"
          disabled={loading}
          variant="card"
          pageSizeOptions={auditPageSizeOptions}
          onPageSizeChange={setAuditPageLimit}
        />
      </motion.div>
    </div>
  );
};

export default AdminAudit;
