import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { BankAccount } from '../types';
import { Plus, Edit, Trash2, Wallet, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

const Accounts: React.FC = () => {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [summary, setSummary] = useState({ totalBalanceDop: 0, totalBalanceUsd: 0, totalAccounts: 0 });
  const [formData, setFormData] = useState({
    bankName: '',
    accountType: '',
    accountNumber: '',
    balanceDop: '',
    balanceUsd: '',
    currencyType: 'DOP' as 'DOP' | 'USD' | 'DUAL',
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      if (bankFilter) params.bank = bankFilter;
      
      const response = await api.get('/accounts', { params });
      setAccounts(response.data.accounts);
      setSummary(response.data.summary || { totalBalanceDop: 0, totalBalanceUsd: 0, totalAccounts: 0 });
    } catch (error: any) {
      toast.error('Error al cargar cuentas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [searchTerm, bankFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        balanceDop: formData.balanceDop ? parseFloat(formData.balanceDop) : 0,
        balanceUsd: formData.balanceUsd ? parseFloat(formData.balanceUsd) : 0,
        accountNumber: formData.accountNumber || null,
      };

      if (editingAccount) {
        await api.put(`/accounts/${editingAccount.id}`, data);
        toast.success('Cuenta actualizada');
      } else {
        await api.post('/accounts', data);
        toast.success('Cuenta creada');
      }

      setShowModal(false);
      resetForm();
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar cuenta');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta cuenta?')) return;
    try {
      await api.delete(`/accounts/${id}`);
      toast.success('Cuenta eliminada');
      fetchAccounts();
    } catch (error: any) {
      toast.error('Error al eliminar cuenta');
    }
  };

  const resetForm = () => {
    setFormData({
      bankName: '',
      accountType: '',
      accountNumber: '',
      balanceDop: '',
      balanceUsd: '',
      currencyType: 'DOP',
    });
    setEditingAccount(null);
  };

  useEscapeKey(showModal, () => {
    setShowModal(false);
    resetForm();
  });

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Cuentas Bancarias</h1>
          <p className="text-dark-400 text-sm sm:text-base">Gestiona tus cuentas bancarias</p>
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
          <span>Agregar Cuenta</span>
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">Balance Total DOP</p>
              <p className="text-2xl font-bold text-white">{summary.totalBalanceDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Balance Total USD</p>
              <p className="text-2xl font-bold text-white">{summary.totalBalanceUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Cantidad de Cuentas</p>
              <p className="text-2xl font-bold text-white">{summary.totalAccounts}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {accounts.length > 0 && (
        <>
          <div className="card">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
                <input
                  type="text"
                  placeholder="Buscar por banco, tipo o número..."
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
                  value={bankFilter}
                  onChange={(e) => setBankFilter(e.target.value)}
                  className="input w-full"
                >
                  <option value="">Todos los bancos</option>
                  {Array.from(new Set(accounts.map(a => a.bankName))).map((bank) => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </>
      )}

      {accounts.length === 0 ? (
        <div className="card text-center py-12">
          <Wallet className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">No tienes cuentas registradas</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Agregar Primera Cuenta</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {accounts.map((account) => (
            <motion.div key={account.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{account.bankName}</h3>
                  <p className="text-sm text-dark-400">{account.accountType}</p>
                </div>
                <div className="flex space-x-2">
                  <button onClick={() => { setEditingAccount(account); setFormData({ bankName: account.bankName, accountType: account.accountType, accountNumber: account.accountNumber || '', balanceDop: account.balanceDop.toString(), balanceUsd: account.balanceUsd.toString(), currencyType: account.currencyType }); setShowModal(true); }} className="p-2 text-primary-400 hover:text-primary-300"><Edit size={18} /></button>
                  <button onClick={() => handleDelete(account.id)} className="p-2 text-red-400 hover:text-red-300"><Trash2 size={18} /></button>
                </div>
              </div>
              {account.accountNumber && <p className="text-sm text-dark-400 mb-2">Número: {account.accountNumber}</p>}
              <div className="space-y-2">
                {(account.currencyType === 'DOP' || account.currencyType === 'DUAL') && (
                  <div className="flex justify-between">
                    <span className="text-dark-400">Balance DOP:</span>
                    <span className="text-white font-medium">{account.balanceDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</span>
                  </div>
                )}
                {(account.currencyType === 'USD' || account.currencyType === 'DUAL') && (
                  <div className="flex justify-between">
                    <span className="text-dark-400">Balance USD:</span>
                    <span className="text-white font-medium">{account.balanceUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD</span>
                  </div>
                )}
              </div>
            </motion.div>
          ))}
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
            aria-labelledby="accounts-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="accounts-modal-title" className="text-2xl font-bold text-white mb-6">
              {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Banco</label><input type="text" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">Tipo de Cuenta</label><input type="text" value={formData.accountType} onChange={(e) => setFormData({ ...formData, accountType: e.target.value })} className="input w-full" placeholder="Ahorro, Corriente, etc." required /></div>
              </div>
              <div><label className="label">Número de Cuenta (opcional)</label><input type="text" value={formData.accountNumber} onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })} className="input w-full" /></div>
              <div><label className="label">Tipo de Moneda</label><select value={formData.currencyType} onChange={(e) => setFormData({ ...formData, currencyType: e.target.value as any })} className="input w-full"><option value="DOP">DOP</option><option value="USD">USD</option><option value="DUAL">DUAL</option></select></div>
              {(formData.currencyType === 'DOP' || formData.currencyType === 'DUAL') && (
                <div><label className="label">Balance DOP</label><input type="number" step="0.01" value={formData.balanceDop} onChange={(e) => setFormData({ ...formData, balanceDop: e.target.value })} className="input w-full" required={formData.currencyType === 'DOP'} /></div>
              )}
              {(formData.currencyType === 'USD' || formData.currencyType === 'DUAL') && (
                <div><label className="label">Balance USD</label><input type="number" step="0.01" value={formData.balanceUsd} onChange={(e) => setFormData({ ...formData, balanceUsd: e.target.value })} className="input w-full" required={formData.currencyType === 'USD'} /></div>
              )}
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">{editingAccount ? 'Actualizar' : 'Crear'}</button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">Cancelar</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Accounts;
