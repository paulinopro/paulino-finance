import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { Plus, Edit, Trash2, Search, X, Target, CheckCircle, TrendingUp, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { ResponsiveContainer, RadialBarChart, RadialBar } from 'recharts';
import { TABLE_PAGE_SIZE } from '../constants/pagination';

interface FinancialGoal {
  id: number;
  name: string;
  description?: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  targetDate?: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  progress: number;
  remaining: number;
  createdAt: string;
  updatedAt: string;
}

interface GoalMovement {
  id: number;
  goalId: number;
  amount: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

const FinancialGoals: React.FC = () => {
  const goalModalRef = useRef<HTMLDivElement>(null);
  const historyModalRef = useRef<HTMLDivElement>(null);
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyGoal, setHistoryGoal] = useState<FinancialGoal | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [progressInputs, setProgressInputs] = useState<Record<number, string>>({});
  const [goalMovements, setGoalMovements] = useState<Record<number, GoalMovement[]>>({});
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    targetAmount: '',
    currency: 'DOP',
    targetDate: '',
  });

  useEffect(() => {
    fetchGoals();
  }, [statusFilter]);

  const fetchGoals = async () => {
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      
      const response = await api.get('/financial-goals', { params });
      setGoals(response.data.goals);
    } catch (error: any) {
      toast.error('Error al cargar metas financieras');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        targetAmount: parseFloat(formData.targetAmount),
        targetDate: formData.targetDate || null,
      };

      if (editingGoal) {
        await api.put(`/financial-goals/${editingGoal.id}`, data);
        toast.success('Meta financiera actualizada');
      } else {
        await api.post('/financial-goals', data);
        toast.success('Meta financiera creada');
      }

      setShowModal(false);
      resetForm();
      fetchGoals();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar meta financiera');
    }
  };

  const handleAddMovement = async (goalId: number) => {
    const value = parseFloat(progressInputs[goalId] || '0');

    if (isNaN(value) || value <= 0) {
      toast.error('Ingresa un monto válido mayor que 0');
      return;
    }

    try {
      await api.post(`/financial-goals/${goalId}/movements`, { amount: value });
      toast.success('Progreso agregado');
      setProgressInputs((prev) => ({ ...prev, [goalId]: '' }));
      fetchGoals();
      fetchMovements(goalId);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al agregar progreso');
    }
  };

  const fetchMovements = async (goalId: number) => {
    try {
      const response = await api.get(`/financial-goals/${goalId}/movements`);
      setGoalMovements((prev) => ({
        ...prev,
        [goalId]: response.data.movements,
      }));
    } catch (error: any) {
      toast.error('Error al cargar historial de movimientos');
    }
  };

  const openHistoryModal = async (goal: FinancialGoal) => {
    setHistoryGoal(goal);
    setHistoryPage(1);
    if (!goalMovements[goal.id]) {
      await fetchMovements(goal.id);
    }
    setShowHistoryModal(true);
  };

  const handleUpdateMovement = async (goalId: number, movement: GoalMovement, newAmount: number) => {
    if (isNaN(newAmount) || newAmount <= 0) {
      toast.error('Ingresa un monto válido mayor que 0');
      return;
    }

    try {
      await api.put(`/financial-goals/${goalId}/movements/${movement.id}`, {
        amount: newAmount,
        note: movement.note,
      });
      toast.success('Movimiento actualizado');
      fetchGoals();
      fetchMovements(goalId);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al actualizar movimiento');
    }
  };

  const handleDeleteMovement = async (goalId: number, movementId: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este movimiento?')) {
      return;
    }

    try {
      await api.delete(`/financial-goals/${goalId}/movements/${movementId}`);
      toast.success('Movimiento eliminado');
      fetchGoals();
      fetchMovements(goalId);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al eliminar movimiento');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta meta financiera?')) {
      return;
    }

    try {
      await api.delete(`/financial-goals/${id}`);
      toast.success('Meta financiera eliminada');
      fetchGoals();
    } catch (error: any) {
      toast.error('Error al eliminar meta financiera');
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await api.put(`/financial-goals/${id}`, { status });
      toast.success('Estado actualizado');
      fetchGoals();
    } catch (error: any) {
      toast.error('Error al actualizar estado');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      targetAmount: '',
      currency: 'DOP',
      targetDate: '',
    });
    setEditingGoal(null);
  };

  const openEditModal = (goal: FinancialGoal) => {
    setEditingGoal(goal);
    setFormData({
      name: goal.name,
      description: goal.description || '',
      targetAmount: goal.targetAmount.toString(),
      currency: goal.currency,
      targetDate: goal.targetDate ? new Date(goal.targetDate).toISOString().slice(0, 10) : '',
    });
    setShowModal(true);
  };

  useEscapeKey(showHistoryModal, () => setShowHistoryModal(false));
  useEscapeKey(showModal && !showHistoryModal, () => {
    setShowModal(false);
    resetForm();
  });
  useModalFocusTrap(goalModalRef, showModal && !showHistoryModal);
  useModalFocusTrap(historyModalRef, showHistoryModal && !!historyGoal);

  const filteredGoals = goals.filter((goal) =>
    goal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    goal.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getProgressColor = (progress: number) => {
    if (progress >= 100) return '#10b981';
    if (progress >= 50) return '#3b82f6';
    return '#f59e0b';
  };

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
          <h1 className="page-title">Metas Financieras</h1>
          <p className="text-dark-400 text-sm sm:text-base">Establece y rastrea tus metas financieras</p>
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
          Nueva Meta
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos los estados</option>
            <option value="ACTIVE">Activa</option>
            <option value="COMPLETED">Completada</option>
            <option value="CANCELLED">Cancelada</option>
          </select>
        </div>
      </div>

      {/* Goals List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredGoals.length === 0 ? (
          <div className="card text-center py-12 col-span-2">
            <p className="text-dark-400">No hay metas financieras</p>
          </div>
        ) : (
          filteredGoals.map((goal) => (
            <motion.div
              key={goal.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Target className="text-primary-400" size={20} />
                    <h3 className="text-lg font-semibold text-white">{goal.name}</h3>
                    {goal.status === 'COMPLETED' && (
                      <CheckCircle className="text-green-400" size={20} />
                    )}
                  </div>
                  {goal.description && (
                    <p className="text-sm text-dark-400 mb-2">{goal.description}</p>
                  )}
                  {goal.targetDate && (
                    <p className="text-xs text-dark-400">
                      Fecha objetivo: {new Date(goal.targetDate).toLocaleDateString('es-DO')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openHistoryModal(goal)}
                    className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                    title="Historial de movimientos"
                  >
                    <Clock size={20} />
                  </button>
                  {goal.status === 'ACTIVE' && (
                    <button
                      onClick={() => openEditModal(goal)}
                      className="p-2 text-primary-400 hover:bg-primary-400/10 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit size={20} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(goal.id)}
                    className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={20} />
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <div className="relative w-32 h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        innerRadius="60%"
                        outerRadius="90%"
                        data={[
                          {
                            name: 'Progreso',
                            value: Math.min(100, goal.progress),
                            fill: getProgressColor(goal.progress),
                          },
                        ]}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <RadialBar dataKey="value" cornerRadius={10} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold text-white">{goal.progress.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-dark-400">Meta</span>
                    <span className="text-sm font-semibold text-white">
                      {goal.targetAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {goal.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-dark-400">Actual</span>
                    <span className="text-sm font-semibold text-green-400">
                      {goal.currentAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {goal.currency}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-dark-400">Restante</span>
                    <span className="text-sm font-semibold text-primary-400">
                      {goal.remaining.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {goal.currency}
                    </span>
                  </div>
                </div>

                {goal.status === 'ACTIVE' && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Monto a agregar al progreso"
                      className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      value={progressInputs[goal.id] || ''}
                      onChange={(e) =>
                        setProgressInputs((prev) => ({
                          ...prev,
                          [goal.id]: e.target.value,
                        }))
                      }
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddMovement(goal.id);
                        }
                      }}
                    />
                    <button
                      onClick={() => handleAddMovement(goal.id)}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      <TrendingUp size={16} />
                    </button>
                  </div>
                )}

                <div className="flex gap-2">
                  <select
                    value={goal.status}
                    onChange={(e) => handleStatusChange(goal.id, e.target.value)}
                    className="flex-1 px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="ACTIVE">Activa</option>
                    <option value="COMPLETED">Completada</option>
                    <option value="CANCELLED">Cancelada</option>
                  </select>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Modal Meta */}
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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">
                {editingGoal ? 'Editar Meta Financiera' : 'Nueva Meta Financiera'}
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
                <label className="block text-sm font-medium text-dark-300 mb-2">Descripción</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Monto Objetivo *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.targetAmount}
                    onChange={(e) => setFormData({ ...formData, targetAmount: e.target.value })}
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
                <label className="block text-sm font-medium text-dark-300 mb-2">Fecha Objetivo</label>
                <input
                  type="date"
                  value={formData.targetDate}
                  onChange={(e) => setFormData({ ...formData, targetDate: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingGoal ? 'Actualizar' : 'Crear'}
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

      {/* Modal Historial de Movimientos */}
      {showHistoryModal && historyGoal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)} role="presentation">
          <motion.div
            ref={historyModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-2xl w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="financial-goals-history-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 id="financial-goals-history-title" className="text-xl font-semibold text-white mb-1">
                  Historial de movimientos
                </h2>
                <p className="text-sm text-dark-400">{historyGoal.name}</p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-dark-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            {(() => {
              const movements = goalMovements[historyGoal.id] || [];
              const itemsPerPage = TABLE_PAGE_SIZE;
              const totalPages = Math.max(1, Math.ceil(movements.length / itemsPerPage));
              const currentPage = Math.min(historyPage, totalPages);
              const startIndex = (currentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const paginatedMovements = movements.slice(startIndex, endIndex);

              return (
                <div className="space-y-4">
                  <div className="space-y-3">
                    {paginatedMovements.length > 0 ? (
                      paginatedMovements.map((movement) => (
                  <div
                    key={movement.id}
                    className="flex items-center justify-between bg-dark-700 rounded-lg px-4 py-3 text-sm"
                  >
                    <div>
                      <p className="text-white">
                        {movement.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                        {historyGoal.currency}
                      </p>
                      <p className="text-dark-400 text-xs">
                        {new Date(movement.createdAt).toLocaleString('es-DO')}
                      </p>
                      {movement.note && (
                        <p className="text-dark-300 text-xs mt-1">Nota: {movement.note}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="p-1.5 rounded-lg hover:bg-primary-400/10 text-primary-400"
                        title="Editar movimiento"
                        onClick={() => {
                          const nuevo = prompt(
                            'Nuevo monto para este movimiento:',
                            movement.amount.toString()
                          );
                          if (nuevo !== null) {
                            const nuevoValor = parseFloat(nuevo);
                            if (!isNaN(nuevoValor) && nuevoValor > 0) {
                              handleUpdateMovement(historyGoal.id, movement, nuevoValor);
                            } else {
                              toast.error('Monto inválido');
                            }
                          }
                        }}
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        className="p-1.5 rounded-lg hover:bg-red-400/10 text-red-400"
                        title="Eliminar movimiento"
                        onClick={() => handleDeleteMovement(historyGoal.id, movement.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                    ))
                    ) : (
                      <p className="text-sm text-dark-400">
                        No hay movimientos registrados para esta meta.
                      </p>
                    )}
                  </div>

                  {movements.length > itemsPerPage && (
                    <div className="flex items-center justify-between pt-2 border-t border-dark-700 text-xs text-dark-300">
                      <span>
                        Página {currentPage} de {totalPages}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={currentPage === 1}
                          onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                          className={`px-3 py-1 rounded-lg border border-dark-600 ${
                            currentPage === 1
                              ? 'text-dark-500 cursor-not-allowed'
                              : 'text-white hover:bg-dark-700'
                          }`}
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          disabled={currentPage === totalPages}
                          onClick={() =>
                            setHistoryPage((prev) => Math.min(totalPages, prev + 1))
                          }
                          className={`px-3 py-1 rounded-lg border border-dark-600 ${
                            currentPage === totalPages
                              ? 'text-dark-500 cursor-not-allowed'
                              : 'text-white hover:bg-dark-700'
                          }`}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default FinancialGoals;
