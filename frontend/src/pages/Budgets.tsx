import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { Plus, Edit, Trash2, Search, X, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';

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
    fetchBudgets();
  }, [periodFilter]);

  const fetchBudgets = async () => {
    try {
      const params: any = {};
      if (periodFilter) params.periodType = periodFilter;
      
      const response = await api.get('/budgets', { params });
      setBudgets(response.data.budgets);
    } catch (error: any) {
      toast.error('Error al cargar presupuestos');
    } finally {
      setLoading(false);
    }
  };

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

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return '#ef4444';
    if (percentage >= 80) return '#f59e0b';
    return '#10b981';
  };

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Presupuestos</h1>
          <p className="text-dark-400 text-sm sm:text-base">Gestiona tus presupuestos mensuales y anuales</p>
        </div>
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
      </div>

      {/* Filters */}
      <div className="card">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos los períodos</option>
            <option value="MONTHLY">Mensual</option>
            <option value="YEARLY">Anual</option>
          </select>
        </div>
      </div>

      {/* Budgets List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredBudgets.length === 0 ? (
          <div className="card text-center py-12 col-span-2">
            <p className="text-dark-400">No hay presupuestos</p>
          </div>
        ) : (
          filteredBudgets.map((budget) => (
            <motion.div
              key={budget.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-1">{budget.name}</h3>
                  {budget.category && (
                    <p className="text-sm text-dark-400 mb-2">Categoría: {budget.category}</p>
                  )}
                  <p className="text-xs text-dark-400">
                    {budget.periodType === 'MONTHLY'
                      ? `${monthNames[budget.periodMonth! - 1]} ${budget.periodYear}`
                      : `Año ${budget.periodYear}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(budget)}
                    className="p-2 text-primary-400 hover:bg-primary-400/10 rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Edit size={20} />
                  </button>
                  <button
                    onClick={() => handleDelete(budget.id)}
                    className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-dark-400">Presupuesto</span>
                    <span className="text-sm font-semibold text-white">
                      {budget.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {budget.currency}
                    </span>
                  </div>
                  <div className="w-full bg-dark-600 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, budget.percentage)}%`,
                        backgroundColor: getProgressColor(budget.percentage),
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-dark-400">Gastado</p>
                    <p className="text-red-400 font-semibold">
                      {budget.spent.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {budget.currency}
                    </p>
                  </div>
                  <div>
                    <p className="text-dark-400">Restante</p>
                    <p className={`font-semibold ${budget.remaining >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {budget.remaining.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {budget.currency}
                    </p>
                  </div>
                </div>

                <div className="text-center">
                  <p className="text-xs text-dark-400">Progreso</p>
                  <p className="text-lg font-bold" style={{ color: getProgressColor(budget.percentage) }}>
                    {budget.percentage.toFixed(1)}%
                  </p>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

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
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Ej: Alimentación, Transporte, etc."
                />
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
