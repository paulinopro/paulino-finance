import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import type { ExpenseCategory } from '../types';
import { Plus, Edit, Trash2, Search, X, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { LIST_CARD_SHELL, listCardAccentFromPercent, listCardProgressColor } from '../utils/listCard';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';

interface Budget {
  id: number;
  name: string;
  category?: string;
  amount: number;
  currency: string;
  periodType: 'MONTHLY' | 'YEARLY';
  periodMonth?: number;
  periodYear: number;
  spent: number;
  remaining: number;
  percentage: number;
  createdAt: string;
  updatedAt: string;
}

const Budgets: React.FC = () => {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    amount: '',
    currency: 'DOP',
    periodType: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
    periodMonth: new Date().getMonth() + 1,
    periodYear: new Date().getFullYear(),
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await api.get('/categories');
        setCategories(response.data.categories || []);
      } catch {
        /* silencioso: el modal igual permite sin categoría */
      }
    };
    fetchCategories();
  }, []);

  const fetchBudgets = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (periodFilter) params.periodType = periodFilter;

      const response = await api.get('/budgets', { params });
      setBudgets(response.data.budgets);
    } catch {
      toast.error('Error al cargar presupuestos');
    } finally {
      setLoading(false);
    }
  }, [periodFilter]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        amount: parseFloat(formData.amount),
        periodMonth: formData.periodType === 'MONTHLY' ? formData.periodMonth : null,
      };

      if (editingBudget) {
        await api.put(`/budgets/${editingBudget.id}`, data);
        toast.success('Presupuesto actualizado');
      } else {
        await api.post('/budgets', data);
        toast.success('Presupuesto creado');
      }

      setShowModal(false);
      resetForm();
      fetchBudgets();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar presupuesto');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este presupuesto?')) {
      return;
    }

    try {
      await api.delete(`/budgets/${id}`);
      toast.success('Presupuesto eliminado');
      fetchBudgets();
    } catch (error: any) {
      toast.error('Error al eliminar presupuesto');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      amount: '',
      currency: 'DOP',
      periodType: 'MONTHLY',
      periodMonth: new Date().getMonth() + 1,
      periodYear: new Date().getFullYear(),
    });
    setEditingBudget(null);
  };

  const openEditModal = (budget: Budget) => {
    setEditingBudget(budget);
    setFormData({
      name: budget.name,
      category: budget.category || '',
      amount: budget.amount.toString(),
      currency: budget.currency,
      periodType: budget.periodType,
      periodMonth: budget.periodMonth || new Date().getMonth() + 1,
      periodYear: budget.periodYear,
    });
    setShowModal(true);
  };

  useEscapeKey(showModal, () => {
    setShowModal(false);
    resetForm();
  });
  useModalFocusTrap(modalPanelRef, showModal);

  const filteredBudgets = budgets.filter((budget) =>
    budget.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    budget.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [listPage, setListPage] = useState(1);
  useEffect(() => {
    setListPage(1);
  }, [searchTerm, periodFilter]);
  const budgetTotalPages = Math.max(1, Math.ceil(filteredBudgets.length / TABLE_PAGE_SIZE));
  const budgetPageSafe = Math.min(listPage, budgetTotalPages);
  useEffect(() => {
    setListPage((p) => Math.min(p, budgetTotalPages));
  }, [budgetTotalPages]);
  const pagedBudgets = useMemo(() => {
    const start = (budgetPageSafe - 1) * TABLE_PAGE_SIZE;
    return filteredBudgets.slice(start, start + TABLE_PAGE_SIZE);
  }, [filteredBudgets, budgetPageSafe]);

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <PageHeader
        title="Presupuestos"
        subtitle="Gestiona tus presupuestos mensuales y anuales"
        actions={
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto"
          >
            <Plus size={20} />
            Nuevo Presupuesto
          </button>
        }
      />

      {/* Filters */}
      <div className="card-view">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1 relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-dark-400" aria-hidden />
            <input
              type="search"
              placeholder="Buscar por nombre o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input w-full pl-11"
              autoComplete="off"
            />
          </div>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="input w-full shrink-0 sm:min-w-[11rem] sm:max-w-[14rem]"
          >
            <option value="">Todos los períodos</option>
            <option value="MONTHLY">Mensual</option>
            <option value="YEARLY">Anual</option>
          </select>
        </div>
      </div>

      {/* Budgets List */}
      {filteredBudgets.length === 0 ? (
        <div className="card-view py-14 sm:py-16 text-center">
          <p className="text-dark-400 text-sm sm:text-base">No hay presupuestos que coincidan.</p>
        </div>
      ) : (
        <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 xl:gap-6">
          {pagedBudgets.map((budget) => {
            const pct = Math.min(100, budget.percentage);
            const periodLabel =
              budget.periodType === 'MONTHLY'
                ? `${monthNames[budget.periodMonth! - 1]} ${budget.periodYear}`
                : `Año ${budget.periodYear}`;

            return (
              <motion.article
                key={budget.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className={[LIST_CARD_SHELL, listCardAccentFromPercent(budget.percentage)].join(' ')}
              >
                <div className="flex flex-row gap-3 justify-between items-start">
                  <div className="min-w-0 flex-1 space-y-2 pr-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                        {budget.periodType === 'MONTHLY' ? 'Mensual' : 'Anual'}
                      </span>
                      <span className="text-xs text-dark-500 sm:text-sm">{periodLabel}</span>
                    </div>
                    <h3 className="text-balance break-words text-lg font-bold leading-snug text-white sm:text-xl">
                      {budget.name}
                    </h3>
                    {budget.category && (
                      <span className="inline-flex max-w-full truncate rounded-md bg-primary-600/15 px-2 py-0.5 text-xs font-medium text-primary-200 ring-1 ring-primary-500/25">
                        {budget.category}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => openEditModal(budget)}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-primary-400 transition-colors hover:bg-primary-500/15 active:bg-primary-500/25"
                      title="Editar"
                      aria-label="Editar presupuesto"
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(budget.id)}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-red-400 transition-colors hover:bg-red-500/10 active:bg-red-500/20"
                      title="Eliminar"
                      aria-label="Eliminar presupuesto"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-4 border-t border-dark-700/80 pt-4">
                  <div className="flex flex-col gap-3 xs:flex-row xs:items-end xs:justify-between">
                    <div>
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Tope</p>
                      <p className="text-base font-semibold tabular-nums text-white sm:text-lg">
                        {budget.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                        <span className="text-sm font-medium text-dark-400">{budget.currency}</span>
                      </p>
                    </div>
                    <div className="flex items-baseline gap-2 self-start xs:self-auto">
                      <span className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                        Uso
                      </span>
                      <span
                        className="text-2xl font-bold tabular-nums leading-none sm:text-3xl"
                        style={{ color: listCardProgressColor(budget.percentage) }}
                      >
                        {budget.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex justify-between gap-2 text-xs text-dark-400">
                      <span>Consumo del presupuesto</span>
                      <span className="tabular-nums text-dark-300">
                        {pct.toFixed(0)}% / 100%
                      </span>
                    </div>
                    <div
                      className="h-2.5 w-full overflow-hidden rounded-full bg-dark-700/90 ring-1 ring-dark-600/80 sm:h-3"
                      role="progressbar"
                      aria-valuenow={Math.round(pct)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: listCardProgressColor(budget.percentage),
                          boxShadow: `0 0 12px ${listCardProgressColor(budget.percentage)}55`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-2 sm:gap-3">
                    <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                        Gastado
                      </p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                        {budget.spent.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                        <span className="text-xs font-normal text-dark-400">{budget.currency}</span>
                      </p>
                    </div>
                    <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                        Restante
                      </p>
                      <p
                        className={`mt-0.5 text-sm font-semibold tabular-nums sm:text-base ${
                          budget.remaining >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {budget.remaining.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                        <span className="text-xs font-normal text-dark-400">{budget.currency}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
        <TablePagination
          currentPage={budgetPageSafe}
          totalPages={budgetTotalPages}
          totalItems={filteredBudgets.length}
          itemsPerPage={TABLE_PAGE_SIZE}
          onPageChange={setListPage}
          itemLabel="presupuestos"
          variant="card"
        />
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowModal(false);
            resetForm();
          }}
          role="presentation"
        >
          <motion.div
            ref={modalPanelRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="budgets-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="budgets-modal-title" className="text-xl font-semibold text-white">
                {editingBudget ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-dark-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Nombre *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Categoría</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">
                    {categories.length === 0 ? 'Sin categorías (créalas en Categorías)' : 'Sin categoría'}
                  </option>
                  {formData.category &&
                    !categories.some((c) => c.name === formData.category) && (
                      <option value={formData.category}>{formData.category}</option>
                    )}
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Monto *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Moneda *</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="DOP">DOP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Tipo de Período *</label>
                <select
                  value={formData.periodType}
                  onChange={(e) => setFormData({ ...formData, periodType: e.target.value as 'MONTHLY' | 'YEARLY' })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="MONTHLY">Mensual</option>
                  <option value="YEARLY">Anual</option>
                </select>
              </div>

              {formData.periodType === 'MONTHLY' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">Mes *</label>
                    <select
                      value={formData.periodMonth}
                      onChange={(e) => setFormData({ ...formData, periodMonth: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {monthNames.map((month, index) => (
                        <option key={index + 1} value={index + 1}>
                          {month}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">Año *</label>
                    <input
                      type="number"
                      value={formData.periodYear}
                      onChange={(e) => setFormData({ ...formData, periodYear: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                      min="2020"
                      max="2100"
                      required
                    />
                  </div>
                </div>
              )}

              {formData.periodType === 'YEARLY' && (
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Año *</label>
                  <input
                    type="number"
                    value={formData.periodYear}
                    onChange={(e) => setFormData({ ...formData, periodYear: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    min="2020"
                    max="2100"
                    required
                  />
                </div>
              )}

              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingBudget ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Budgets;
