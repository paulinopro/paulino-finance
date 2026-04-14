import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { Plus, Edit, Trash2, CheckCircle, Search, X, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

interface AccountPayable {
  id: number;
  description: string;
  amount: number;
  currency: string;
  dueDate: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  category?: string;
  notes?: string;
  paidDate?: string;
  createdAt: string;
  updatedAt: string;
}

const AccountsPayable: React.FC = () => {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [accounts, setAccounts] = useState<AccountPayable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountPayable | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    currency: 'DOP',
    dueDate: '',
    category: '',
    notes: '',
  });

  useEffect(() => {
    fetchAccounts();
  }, [statusFilter]);

  const fetchAccounts = async () => {
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      
      const response = await api.get('/accounts-payable', { params });
      setAccounts(response.data.accountsPayable);
    } catch (error: any) {
      toast.error('Error al cargar cuentas por pagar');
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
      };

      if (editingAccount) {
        await api.put(`/accounts-payable/${editingAccount.id}`, data);
        toast.success('Cuenta por pagar actualizada');
      } else {
        await api.post('/accounts-payable', data);
        toast.success('Cuenta por pagar creada');
      }

      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar cuenta por pagar');
    }
  };

  const handlePay = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas marcar esta cuenta como pagada? Se agregará automáticamente a tus gastos.')) {
      return;
    }

    try {
      await api.put(`/accounts-payable/${id}/pay`);
      toast.success('Cuenta marcada como pagada y agregada a gastos');
      fetchAccounts();
    } catch (error: any) {
      toast.error('Error al pagar cuenta');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta cuenta por pagar?')) {
      return;
    }

    try {
      await api.delete(`/accounts-payable/${id}`);
      toast.success('Cuenta por pagar eliminada');
      fetchAccounts();
    } catch (error: any) {
      toast.error('Error al eliminar cuenta por pagar');
    }
  };

  const resetForm = () => {
    setFormData({
      description: '',
      amount: '',
      currency: 'DOP',
      dueDate: '',
      category: '',
      notes: '',
    });
    setEditingAccount(null);
  };

  const openEditModal = (account: AccountPayable) => {
    setEditingAccount(account);
    setFormData({
      description: account.description,
      amount: account.amount.toString(),
      currency: account.currency,
      dueDate: account.dueDate,
      category: account.category || '',
      notes: account.notes || '',
    });
    setShowModal(true);
  };

  useEscapeKey(showModal, () => {
    setShowModal(false);
    resetForm();
  });
  useModalFocusTrap(modalPanelRef, showModal);

  const filteredAccounts = accounts.filter((account) =>
    account.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'text-green-400 bg-green-400/10';
      case 'OVERDUE':
        return 'text-red-400 bg-red-400/10';
      default:
        return 'text-yellow-400 bg-yellow-400/10';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'Pagada';
      case 'OVERDUE':
        return 'Vencida';
      default:
        return 'Pendiente';
    }
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
          <h1 className="page-title">Cuentas por Pagar</h1>
          <p className="text-dark-400 text-sm sm:text-base">Gestiona tus cuentas por pagar</p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto text-sm sm:text-base"
        >
          <Plus size={20} />
          Nueva Cuenta por Pagar
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
            <option value="PENDING">Pendiente</option>
            <option value="PAID">Pagada</option>
            <option value="OVERDUE">Vencida</option>
          </select>
        </div>
      </div>

      {/* Accounts List */}
      <div className="grid grid-cols-1 gap-4">
        {filteredAccounts.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-dark-400">No hay cuentas por pagar</p>
          </div>
        ) : (
          filteredAccounts.map((account) => (
            <motion.div
              key={account.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">{account.description}</h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(account.status)}`}>
                      {getStatusText(account.status)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-dark-400">Monto</p>
                      <p className="text-white font-medium">
                        {account.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {account.currency}
                      </p>
                    </div>
                    <div>
                      <p className="text-dark-400">Fecha de Vencimiento</p>
                      <p className="text-white font-medium">{new Date(account.dueDate).toLocaleDateString('es-DO')}</p>
                    </div>
                    {account.category && (
                      <div>
                        <p className="text-dark-400">Categoría</p>
                        <p className="text-white font-medium">{account.category}</p>
                      </div>
                    )}
                    {account.paidDate && (
                      <div>
                        <p className="text-dark-400">Fecha de Pago</p>
                        <p className="text-white font-medium">{new Date(account.paidDate).toLocaleDateString('es-DO')}</p>
                      </div>
                    )}
                  </div>
                  {account.notes && (
                    <div className="mt-2">
                      <p className="text-dark-400 text-sm">Notas: {account.notes}</p>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {account.status === 'PENDING' && (
                    <>
                      <button
                        onClick={() => handlePay(account.id)}
                        className="p-2 text-green-400 hover:bg-green-400/10 rounded-lg transition-colors"
                        title="Marcar como pagada"
                      >
                        <CheckCircle size={20} />
                      </button>
                      <button
                        onClick={() => openEditModal(account)}
                        className="p-2 text-primary-400 hover:bg-primary-400/10 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit size={20} />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDelete(account.id)}
                    className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                    title="Eliminar"
                  >
                    <Trash2 size={20} />
                  </button>
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
            aria-labelledby="accounts-payable-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="accounts-payable-modal-title" className="text-xl font-semibold text-white">
                {editingAccount ? 'Editar Cuenta por Pagar' : 'Nueva Cuenta por Pagar'}
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
                <label className="block text-sm font-medium text-dark-300 mb-2">Descripción *</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
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
                <label className="block text-sm font-medium text-dark-300 mb-2">Fecha de Vencimiento *</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
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
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingAccount ? 'Actualizar' : 'Crear'}
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

export default AccountsPayable;
