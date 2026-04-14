import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { Income } from '../types';
import { Plus, Edit, Trash2, TrendingUp, Search, X, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { TABLE_PAGE_SIZE } from '../constants/pagination';

const IncomePage: React.FC = () => {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [income, setIncome] = useState<Income[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [summary, setSummary] = useState({ totalDop: 0, totalUsd: 0, totalIncome: 0 });
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
    incomeType: 'FIXED' as 'FIXED' | 'VARIABLE',
    frequency: '',
    receiptDay: '',
    date: '',
  });

  useEffect(() => {
    setCurrentPage(1); // Reset to first page when filters change
  }, [searchTerm, typeFilter]);

  useEffect(() => {
    fetchIncome();
  }, [searchTerm, typeFilter, currentPage]);

  const fetchIncome = async () => {
    try {
      setLoading(true);
      const params: any = {
        page: currentPage,
        limit: itemsPerPage,
      };
      if (searchTerm) params.search = searchTerm;
      if (typeFilter) params.type = typeFilter;
      
      const response = await api.get('/income', { params });
      setIncome(response.data.income);
      setSummary(response.data.summary || { totalDop: 0, totalUsd: 0, totalIncome: 0 });
      setTotalPages(response.data.pagination?.totalPages || 1);
      setTotal(response.data.pagination?.total || 0);
    } catch (error: any) {
      toast.error('Error al cargar ingresos');
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
        frequency: formData.incomeType === 'FIXED' ? formData.frequency : null,
        receiptDay: formData.incomeType === 'FIXED' && formData.frequency === 'MONTHLY' ? parseInt(formData.receiptDay) : null,
        date: formData.incomeType === 'VARIABLE' || (formData.incomeType === 'FIXED' && (formData.frequency === 'WEEKLY' || formData.frequency === 'BIWEEKLY')) ? formData.date : null,
      };

      if (editingIncome) {
        await api.put(`/income/${editingIncome.id}`, data);
        toast.success('Ingreso actualizado');
      } else {
        await api.post('/income', data);
        toast.success('Ingreso creado');
      }

      setShowModal(false);
      resetForm();
      fetchIncome();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar ingreso');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este ingreso?')) return;
    try {
      await api.delete(`/income/${id}`);
      toast.success('Ingreso eliminado');
      fetchIncome();
    } catch (error: any) {
      toast.error('Error al eliminar ingreso');
    }
  };

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      currency: 'DOP',
      incomeType: 'FIXED',
      frequency: '',
      receiptDay: '',
      date: '',
    });
    setEditingIncome(null);
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
          <h1 className="page-title">Ingresos</h1>
          <p className="text-dark-400 text-sm sm:text-base">Gestiona tus ingresos</p>
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
          <span>Agregar Ingreso</span>
        </button>
      </div>

      {/* Summary */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-dark-400 text-sm mb-1">Ingresos Totales DOP</p>
            <p className="text-2xl font-bold text-white">{summary.totalDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
          </div>
          <div>
            <p className="text-dark-400 text-sm mb-1">Ingresos Totales USD</p>
            <p className="text-2xl font-bold text-white">{summary.totalUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD</p>
          </div>
          <div>
            <p className="text-dark-400 text-sm mb-1">Cantidad de Ingresos</p>
            <p className="text-2xl font-bold text-white">{summary.totalIncome}</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      {income.length > 0 && (
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                <option value="FIXED">Fijo</option>
                <option value="VARIABLE">Variable</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {income.length === 0 ? (
        <div className="card text-center py-12">
          <TrendingUp className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">No tienes ingresos registrados</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Agregar Primer Ingreso</button>
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
                    if (sortBy === 'frequency') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('frequency');
                      setSortOrder('asc');
                    }
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <span>Frecuencia</span>
                    {sortBy === 'frequency' ? (sortOrder === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />) : <ArrowUpDown size={16} className="opacity-50" />}
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
                <th className="text-right py-3 px-4 text-dark-400 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {[...income].sort((a, b) => {
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
                    aValue = a.incomeType;
                    bValue = b.incomeType;
                    break;
                  case 'frequency':
                    aValue = a.frequency || '';
                    bValue = b.frequency || '';
                    break;
                  case 'date':
                    aValue = a.date ? new Date(a.date).getTime() : (a.receiptDay || 0);
                    bValue = b.date ? new Date(b.date).getTime() : (b.receiptDay || 0);
                    break;
                  default:
                    return 0;
                }
                
                if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
                return 0;
              }).map((item) => (
                <tr key={item.id} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                  <td data-label="Descripción" data-stack="hero" className="py-3 px-4 text-white">
                    {item.description}
                  </td>
                  <td data-label="Monto" className="py-3 px-4">
                    <span className="table-stack-value">
                      {item.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {item.currency}
                    </span>
                  </td>
                  <td data-label="Tipo" className="py-3 px-4">
                    <span className="table-stack-value text-dark-300">{item.incomeType === 'FIXED' ? 'Fijo' : 'Variable'}</span>
                  </td>
                  <td data-label="Frecuencia" className="py-3 px-4">
                    <span className="table-stack-value text-dark-300">
                      {item.frequency ? (item.frequency === 'MONTHLY' ? 'Mensual' : item.frequency === 'BIWEEKLY' ? 'Quincenal' : item.frequency === 'WEEKLY' ? 'Semanal' : item.frequency === 'ANNUAL' ? 'Anual' : item.frequency) : '-'}
                    </span>
                  </td>
                  <td data-label="Fecha / día" className="py-3 px-4">
                    <span className="table-stack-value text-dark-300">
                      {item.incomeType === 'FIXED' 
                        ? (item.frequency === 'MONTHLY' 
                            ? `Día ${item.receiptDay}` 
                            : item.date 
                              ? `Inicio: ${new Date(item.date).toLocaleDateString('es-DO')}` 
                              : '-')
                        : item.date 
                          ? new Date(item.date).toLocaleDateString('es-DO') 
                          : '-'}
                    </span>
                  </td>
                  <td data-label="Acciones" className="py-3 px-4">
                    <span className="table-stack-value">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => { setEditingIncome(item); setFormData({ description: item.description, amount: item.amount.toString(), currency: item.currency, incomeType: item.incomeType, frequency: item.frequency || '', receiptDay: item.receiptDay?.toString() || '', date: item.date || '' }); setShowModal(true); }} className="p-2 text-primary-400 hover:text-primary-300"><Edit size={18} /></button>
                        <button type="button" onClick={() => handleDelete(item.id)} className="p-2 text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
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
                  Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, total)} de {total} ingresos
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
            aria-labelledby="income-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="income-modal-title" className="text-2xl font-bold text-white mb-6">
              {editingIncome ? 'Editar Ingreso' : 'Nuevo Ingreso'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="label">Descripción</label><input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="input w-full" required /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Monto</label><input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">Moneda</label><select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className="input w-full"><option value="DOP">DOP</option><option value="USD">USD</option></select></div>
              </div>
              <div><label className="label">Tipo</label><select value={formData.incomeType} onChange={(e) => setFormData({ ...formData, incomeType: e.target.value as any })} className="input w-full"><option value="FIXED">Fijo</option><option value="VARIABLE">Variable</option></select></div>
              {formData.incomeType === 'FIXED' && (
                <>
                  <div><label className="label">Frecuencia</label><select value={formData.frequency} onChange={(e) => setFormData({ ...formData, frequency: e.target.value, receiptDay: formData.frequency === 'MONTHLY' ? formData.receiptDay : '', date: formData.frequency !== 'MONTHLY' ? formData.date : '' })} className="input w-full"><option value="MONTHLY">Mensual</option><option value="BIWEEKLY">Quincenal (cada 2 semanas)</option><option value="WEEKLY">Semanal</option></select></div>
                  {formData.frequency === 'MONTHLY' ? (
                    <div>
                      <label className="label">Día de Recepción</label>
                      <input 
                        type="number" 
                        min="1" 
                        max="31" 
                        value={formData.receiptDay} 
                        onChange={(e) => setFormData({ ...formData, receiptDay: e.target.value, date: '' })} 
                        className="input w-full" 
                        required 
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="label">Fecha de Inicio</label>
                      <input 
                        type="date" 
                        value={formData.date} 
                        onChange={(e) => setFormData({ ...formData, date: e.target.value, receiptDay: '' })} 
                        className="input w-full" 
                        required 
                      />
                      <p className="text-xs text-dark-400 mt-1">
                        {formData.frequency === 'BIWEEKLY' 
                          ? 'El sistema calculará automáticamente las siguientes fechas cada 14 días a partir de esta fecha'
                          : 'El sistema calculará automáticamente las siguientes fechas cada 7 días a partir de esta fecha'}
                      </p>
                    </div>
                  )}
                </>
              )}
              {formData.incomeType === 'VARIABLE' && (
                <div><label className="label">Fecha</label><input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="input w-full" required /></div>
              )}
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">{editingIncome ? 'Actualizar' : 'Crear'}</button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">Cancelar</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default IncomePage;
