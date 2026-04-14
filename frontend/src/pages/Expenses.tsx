import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { Expense } from '../types';
import { Plus, Edit, Trash2, TrendingDown, CheckCircle, Circle, Search, X, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { ExpenseCategory } from '../types';
import { TABLE_PAGE_SIZE } from '../constants/pagination';

const Expenses: React.FC = () => {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [summary, setSummary] = useState({ totalDop: 0, totalUsd: 0, totalExpenses: 0 });
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const itemsPerPage = TABLE_PAGE_SIZE;
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    currency: 'DOP',
    expenseType: 'RECURRING_MONTHLY' as 'RECURRING_MONTHLY' | 'NON_RECURRING' | 'ANNUAL',
    category: '',
    paymentDay: '',
    paymentMonth: '',
    date: '',
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
  }, [searchTerm, typeFilter, categoryFilter]);

  useEffect(() => {
    fetchExpenses();
  }, [searchTerm, typeFilter, categoryFilter, currentPage]);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      setCategories(response.data.categories);
    } catch (error: any) {
      console.error('Error loading categories:', error);
    }
  };

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: itemsPerPage,
      };
      if (searchTerm) params.search = searchTerm;
      if (typeFilter) params.type = typeFilter;
      if (categoryFilter) params.category = categoryFilter;
      
      const response = await api.get('/expenses', { params });
      setExpenses(response.data.expenses);
      setSummary(response.data.summary || { totalDop: 0, totalUsd: 0, totalExpenses: 0 });
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      toast.error('Error al cargar gastos');
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
        paymentDay: formData.expenseType === 'RECURRING_MONTHLY' ? parseInt(formData.paymentDay) : null,
        paymentMonth: formData.expenseType === 'ANNUAL' ? parseInt(formData.paymentMonth) : null,
        date: formData.expenseType === 'NON_RECURRING' ? formData.date : null,
      };

      if (editingExpense) {
        await api.put(`/expenses/${editingExpense.id}`, data);
        toast.success('Gasto actualizado');
      } else {
        await api.post('/expenses', data);
        toast.success('Gasto creado');
      }

      setShowModal(false);
      resetForm();
      fetchExpenses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar gasto');
    }
  };

  const handleTogglePaid = async (id: number, isPaid: boolean) => {
    try {
      await api.patch(`/expenses/${id}/payment-status`, { isPaid: !isPaid });
      toast.success('Estado actualizado');
      fetchExpenses();
    } catch (error: any) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este gasto?')) return;
    try {
      await api.delete(`/expenses/${id}`);
      toast.success('Gasto eliminado');
      fetchExpenses();
    } catch (error: any) {
      toast.error('Error al eliminar gasto');
    }
  };

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      currency: 'DOP',
      expenseType: 'RECURRING_MONTHLY',
      category: '',
      paymentDay: '',
      paymentMonth: '',
      date: '',
    });
    setEditingExpense(null);
  };

  useEscapeKey(showModal, () => {
    setShowModal(false);
    resetForm();
  });
  useModalFocusTrap(modalPanelRef, showModal);

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Gastos</h1>
          <p className="text-dark-400 text-sm sm:text-base">Gestiona tus gastos</p>
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
          <span>Agregar Gasto</span>
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">Gastos Totales DOP</p>
              <p className="text-2xl font-bold text-white">{summary.totalDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Gastos Totales USD</p>
              <p className="text-2xl font-bold text-white">{summary.totalUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Cantidad de Gastos</p>
              <p className="text-2xl font-bold text-white">{summary.totalExpenses}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {expenses.length > 0 && (
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
              <input
                type="text"
                placeholder="Buscar por descripción..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input w-full pl-10"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-dark-400 hover:text-white"
                >
                  <X size={18} />
                </button>
              )}
            </div>
            <div>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="input w-full"
              >
                <option value="">Todos los tipos</option>
                <option value="RECURRING_MONTHLY">Recurrente Mensual</option>
                <option value="NON_RECURRING">No Recurrente</option>
                <option value="ANNUAL">Anual</option>
              </select>
            </div>
            <div>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="input w-full"
              >
                <option value="">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="card text-center py-12">
          <TrendingDown className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">No tienes gastos registrados</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Agregar Primer Gasto</button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="table-responsive table-stack">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700">
                <th 
                  className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                  onClick={() => {
                    if (sortBy === 'description') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('description');
                      setSortOrder('asc');
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <span>Descripción</span>
                    {sortBy === 'description' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                  </div>
                </th>
                <th 
                  className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                  onClick={() => {
                    if (sortBy === 'amount') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('amount');
                      setSortOrder('asc');
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <span>Monto</span>
                    {sortBy === 'amount' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                  </div>
                </th>
                <th 
                  className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                  onClick={() => {
                    if (sortBy === 'type') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('type');
                      setSortOrder('asc');
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <span>Tipo</span>
                    {sortBy === 'type' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                  </div>
                </th>
                <th 
                  className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                  onClick={() => {
                    if (sortBy === 'category') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('category');
                      setSortOrder('asc');
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <span>Categoría</span>
                    {sortBy === 'category' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                  </div>
                </th>
                <th 
                  className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                  onClick={() => {
                    if (sortBy === 'date') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('date');
                      setSortOrder('asc');
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <span>Fecha/Día</span>
                    {sortBy === 'date' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                  </div>
                </th>
                <th 
                  className="text-left py-3 px-4 text-dark-400 font-medium cursor-pointer hover:text-white select-none"
                  onClick={() => {
                    if (sortBy === 'status') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('status');
                      setSortOrder('asc');
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <span>Estado</span>
                    {sortBy === 'status' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
                  </div>
                </th>
                <th className="text-right py-3 px-4 text-dark-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {[...expenses].sort((a, b) => {
                if (!sortBy) return 0;
                let aValue: any, bValue: any;
                
                switch (sortBy) {
                  case 'description':
                    aValue = a.description.toLowerCase();
                    bValue = b.description.toLowerCase();
                    break;
                  case 'amount':
                    aValue = a.amount;
                    bValue = b.amount;
                    break;
                  case 'type':
                    aValue = a.expenseType;
                    bValue = b.expenseType;
                    break;
                  case 'category':
                    aValue = (a.category || '').toLowerCase();
                    bValue = (b.category || '').toLowerCase();
                    break;
                  case 'date':
                    aValue = a.date ? new Date(a.date).getTime() : (a.paymentDay || 0);
                    bValue = b.date ? new Date(b.date).getTime() : (b.paymentDay || 0);
                    break;
                  case 'status':
                    aValue = a.isPaid ? 1 : 0;
                    bValue = b.isPaid ? 1 : 0;
                    break;
                  default:
                    return 0;
                }
                
                if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
                return 0;
              }).map((expense) => (
                <tr key={expense.id} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                  <td data-label="Descripción" data-stack="hero" className="py-3 px-4 text-white">
                    {expense.description}
                  </td>
                  <td data-label="Monto" className="py-3 px-4">
                    <span className="table-stack-value">
                      {expense.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {expense.currency}
                    </span>
                  </td>
                  <td data-label="Tipo" className="py-3 px-4">
                    <span className="table-stack-value text-dark-300">
                      {expense.expenseType === 'RECURRING_MONTHLY' ? 'Recurrente Mensual' :
                       expense.expenseType === 'ANNUAL' ? 'Anual' : 'No Recurrente'}
                    </span>
                  </td>
                  <td data-label="Categoría" className="py-3 px-4">
                    <span className="table-stack-value text-dark-300">{expense.category || '-'}</span>
                  </td>
                  <td data-label="Fecha / día" className="py-3 px-4">
                    <span className="table-stack-value text-dark-300">
                      {expense.expenseType === 'RECURRING_MONTHLY' ? `Día ${expense.paymentDay}` :
                       expense.expenseType === 'ANNUAL' ? `Mes ${expense.paymentMonth}` :
                       expense.date ? new Date(expense.date).toLocaleDateString('es-DO') : '-'}
                    </span>
                  </td>
                  <td data-label="Estado" className="py-3 px-4">
                    <span className="table-stack-value">
                      <button type="button" onClick={() => handleTogglePaid(expense.id, expense.isPaid)} className="flex items-center gap-2">
                        {expense.isPaid ? <CheckCircle className="text-green-400" size={20} /> : <Circle className="text-dark-400" size={20} />}
                        <span className={expense.isPaid ? 'text-green-400' : 'text-dark-300'}>{expense.isPaid ? 'Pagado' : 'Pendiente'}</span>
                      </button>
                    </span>
                  </td>
                  <td data-label="Acciones" className="py-3 px-4">
                    <span className="table-stack-value">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => { setEditingExpense(expense); setFormData({ description: expense.description, amount: expense.amount.toString(), currency: expense.currency, expenseType: expense.expenseType, category: expense.category || '', paymentDay: expense.paymentDay?.toString() || '', paymentMonth: expense.paymentMonth?.toString() || '', date: expense.date || '' }); setShowModal(true); }} className="p-2 text-primary-400 hover:text-primary-300"><Edit size={18} /></button>
                        <button type="button" onClick={() => handleDelete(expense.id)} className="p-2 text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
                      </div>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="border-t border-dark-700 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-dark-400">
                  Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, total)} de {total} gastos
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1 || loading}
                    className="px-3 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    <ChevronLeft size={18} />
                    Anterior
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum: number;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          disabled={loading}
                          className={`px-3 py-2 rounded-lg transition-colors ${
                            currentPage === pageNum
                              ? 'bg-primary-600 text-white'
                              : 'bg-dark-700 text-white hover:bg-dark-600'
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages || loading}
                    className="px-3 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    Siguiente
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-2xl w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expenses-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="expenses-modal-title" className="text-2xl font-bold text-white mb-6">
              {editingExpense ? 'Editar Gasto' : 'Nuevo Gasto'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="label">Descripción</label><input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input w-full" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Monto</label><input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">Moneda</label><select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className="input w-full"><option value="DOP">DOP</option><option value="USD">USD</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Tipo</label><select value={formData.expenseType} onChange={(e) => setFormData({ ...formData, expenseType: e.target.value as any })} className="input w-full"><option value="RECURRING_MONTHLY">Recurrente Mensual</option><option value="NON_RECURRING">No Recurrente</option><option value="ANNUAL">Anual</option></select></div>
                <div>
                  <label className="label">Categoría</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="input w-full"
                    required
                  >
                    <option value="">{categories.length === 0 ? 'Sin categorías' : 'Seleccionar Categoría'}</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {formData.expenseType === 'RECURRING_MONTHLY' && (
                <div><label className="label">Día de Pago</label><input type="number" min="1" max="31" value={formData.paymentDay} onChange={(e) => setFormData({ ...formData, paymentDay: e.target.value })} className="input w-full" required /></div>
              )}
              {formData.expenseType === 'ANNUAL' && (
                <div><label className="label">Mes de Pago</label><input type="number" min="1" max="12" value={formData.paymentMonth} onChange={(e) => setFormData({ ...formData, paymentMonth: e.target.value })} className="input w-full" required /></div>
              )}
              {formData.expenseType === 'NON_RECURRING' && (
                <div><label className="label">Fecha</label><input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="input w-full" required /></div>
              )}
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">{editingExpense ? 'Actualizar' : 'Crear'}</button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">Cancelar</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Expenses;
