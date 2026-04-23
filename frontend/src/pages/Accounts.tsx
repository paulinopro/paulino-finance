import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import api from '../services/api';
import { BankAccount } from '../types';
import { Plus, Edit, Trash2, Wallet, Search, X, ArrowLeftRight, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { LIST_CARD_SHELL, listCardAccentNeutral, listCardBtnEdit, listCardBtnDanger } from '../utils/listCard';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';

/** Texto para compartir datos de cuenta bancaria. NOMBRE y CEDULA solo si hay datos en el perfil. */
function buildBankAccountCopyText(
  account: BankAccount,
  fullName: string,
  cedula: string
): string {
  const bank = (account.bankName || '').trim();
  const num = (account.accountNumber || '').trim();
  const tipo = (account.accountType || '').trim();
  const nombre = (fullName || '').trim();
  const ced = (cedula || '').trim();

  const parts: string[] = [
    'NOMBRE DEL BANCO',
    bank,
    '',
    'NUMERO DE CUENTA',
    num,
    '',
    'TIPO DE CUENTA',
    tipo,
  ];

  if (nombre) {
    parts.push('', 'NOMBRE', nombre);
  }
  if (ced) {
    parts.push('', 'CEDULA', ced);
  }

  return parts.join('\n');
}

const Accounts: React.FC = () => {
  const { user } = useAuth();
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [summary, setSummary] = useState({
    totalBalanceDop: 0,
    totalBalanceUsd: 0,
    totalAccounts: 0,
    totalBankDop: 0,
    totalBankUsd: 0,
    totalCashDop: 0,
    totalCashUsd: 0,
  });
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({
    fromAccountId: '',
    toAccountId: '',
    amount: '',
    currency: 'DOP' as 'DOP' | 'USD',
    note: '',
  });
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    bankAccountId: '',
    amountDelta: '',
    currency: 'DOP' as 'DOP' | 'USD',
    reason: '',
  });
  const [formData, setFormData] = useState({
    bankName: '',
    accountType: '',
    accountNumber: '',
    balanceDop: '',
    balanceUsd: '',
    currencyType: 'DOP' as 'DOP' | 'USD' | 'DUAL',
    accountKind: 'bank' as 'bank' | 'cash' | 'wallet',
  });

  const fetchAccounts = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (searchTerm) params.search = searchTerm;
      if (bankFilter) params.bank = bankFilter;

      const response = await api.get('/accounts', { params });
      setAccounts(response.data.accounts);
      setSummary(
        response.data.summary || {
          totalBalanceDop: 0,
          totalBalanceUsd: 0,
          totalAccounts: 0,
          totalBankDop: 0,
          totalBankUsd: 0,
          totalCashDop: 0,
          totalCashUsd: 0,
        }
      );
    } catch {
      toast.error('Error al cargar cuentas');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, bankFilter]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const [listPage, setListPage] = useState(1);
  useEffect(() => {
    setListPage(1);
  }, [searchTerm, bankFilter]);
  const accountTotalPages = Math.max(1, Math.ceil(accounts.length / TABLE_PAGE_SIZE));
  const accountPageSafe = Math.min(listPage, accountTotalPages);
  useEffect(() => {
    setListPage((p) => Math.min(p, accountTotalPages));
  }, [accountTotalPages]);
  const pagedAccounts = useMemo(() => {
    const start = (accountPageSafe - 1) * TABLE_PAGE_SIZE;
    return accounts.slice(start, start + TABLE_PAGE_SIZE);
  }, [accounts, accountPageSafe]);

  const copyBankAccountDetails = async (account: BankAccount) => {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    const text = buildBankAccountCopyText(account, fullName, user?.cedula ?? '');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Datos copiados al portapapeles');
    } catch {
      toast.error('No se pudo copiar al portapapeles');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        balanceDop: formData.balanceDop ? parseFloat(formData.balanceDop) : 0,
        balanceUsd: formData.balanceUsd ? parseFloat(formData.balanceUsd) : 0,
        accountNumber: formData.accountNumber || null,
        accountKind: formData.accountKind,
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

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/accounts/transfers', {
        fromAccountId: parseInt(transferForm.fromAccountId, 10),
        toAccountId: parseInt(transferForm.toAccountId, 10),
        amount: parseFloat(transferForm.amount),
        currency: transferForm.currency,
        note: transferForm.note || undefined,
      });
      toast.success('Transferencia realizada');
      setShowTransferModal(false);
      setTransferForm({ fromAccountId: '', toAccountId: '', amount: '', currency: 'DOP', note: '' });
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error en transferencia');
    }
  };

  const submitAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(adjustForm.bankAccountId, 10);
    if (!id) {
      toast.error('Selecciona una cuenta');
      return;
    }
    try {
      await api.post(`/accounts/${id}/cash-adjustments`, {
        amountDelta: parseFloat(adjustForm.amountDelta),
        currency: adjustForm.currency,
        reason: adjustForm.reason || undefined,
      });
      toast.success('Ajuste registrado');
      setShowAdjustModal(false);
      setAdjustForm({ bankAccountId: '', amountDelta: '', currency: 'DOP', reason: '' });
      fetchAccounts();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al registrar ajuste');
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
      accountKind: 'bank',
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
      <PageHeader
        title="Cuentas financieras"
        subtitle="Bancos, efectivo y billeteras — un solo lugar"
        actions={
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setShowTransferModal(true)}
              className="btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <ArrowLeftRight size={18} />
              <span>Transferir</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAdjustModal(true)}
              className="btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <span aria-hidden>💵</span>
              <span>Ajuste de caja</span>
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto"
            >
              <Plus size={20} />
              <span>Agregar cuenta</span>
            </button>
          </div>
        }
      />

      {/* Summary */}
      {summary && (
        <div className="card-view">
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
          <div className="card-view">
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
        <div className="card-view text-center py-12 sm:py-16">
          <Wallet className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">No tienes cuentas registradas</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Agregar Primera Cuenta</button>
        </div>
      ) : (
        <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 xl:gap-6">
          {pagedAccounts.map((account) => (
            <motion.article
              key={account.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className={[LIST_CARD_SHELL, listCardAccentNeutral()].join(' ')}
            >
              <div className="flex flex-row gap-3 justify-between items-start">
                <div className="min-w-0 flex-1 space-y-2 pr-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                      <span aria-hidden>{account.accountKind === 'bank' ? '🏦' : '💵'}</span>
                      <Wallet className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                      {account.accountType}
                    </span>
                    <span className="text-xs text-dark-500 sm:text-sm">{account.currencyType}</span>
                  </div>
                  <h3 className="text-balance break-words text-lg font-bold leading-snug text-white sm:text-xl">{account.bankName}</h3>
                  {account.accountNumber && (
                    <span className="inline-flex max-w-full truncate rounded-md bg-primary-600/15 px-2 py-0.5 text-xs font-medium text-primary-200 ring-1 ring-primary-500/25">
                      {account.accountNumber}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  {account.accountKind === 'bank' && (
                    <button
                      type="button"
                      onClick={() => copyBankAccountDetails(account)}
                      className={listCardBtnEdit}
                      title="Copiar datos de la cuenta"
                      aria-label="Copiar datos de la cuenta"
                    >
                      <Copy className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAccount(account);
                      setFormData({
                        bankName: account.bankName,
                        accountType: account.accountType,
                        accountNumber: account.accountNumber || '',
                        balanceDop: account.balanceDop.toString(),
                        balanceUsd: account.balanceUsd.toString(),
                        currencyType: account.currencyType,
                        accountKind: account.accountKind || 'bank',
                      });
                      setShowModal(true);
                    }}
                    className={listCardBtnEdit}
                    title="Editar"
                    aria-label="Editar cuenta"
                  >
                    <Edit className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(account.id)}
                    className={listCardBtnDanger}
                    title="Eliminar"
                    aria-label="Eliminar cuenta"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-dark-700/80 pt-4">
                <div className="grid grid-cols-1 gap-2 xs:grid-cols-2 sm:gap-3">
                  {(account.currencyType === 'DOP' || account.currencyType === 'DUAL') && (
                    <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Balance DOP</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                        {account.balanceDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                        <span className="text-xs font-normal text-dark-400">DOP</span>
                      </p>
                    </div>
                  )}
                  {(account.currencyType === 'USD' || account.currencyType === 'DUAL') && (
                    <div className="rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Balance USD</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                        {account.balanceUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                        <span className="text-xs font-normal text-dark-400">USD</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.article>
          ))}
        </div>
        <TablePagination
          currentPage={accountPageSafe}
          totalPages={accountTotalPages}
          totalItems={accounts.length}
          itemsPerPage={TABLE_PAGE_SIZE}
          onPageChange={setListPage}
          itemLabel="cuentas"
          variant="card"
        />
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
                <div><label className="label">Nombre (banco o caja)</label><input type="text" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="input w-full" required /></div>
                <div>
                  <label className="label">Clase</label>
                  <select
                    value={formData.accountKind}
                    onChange={(e) => setFormData({ ...formData, accountKind: e.target.value as 'bank' | 'cash' | 'wallet' })}
                    className="input w-full"
                  >
                    <option value="bank">🏦 Banco</option>
                    <option value="cash">💵 Efectivo</option>
                    <option value="wallet">👛 Billetera / digital</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Tipo de cuenta / etiqueta</label><input type="text" value={formData.accountType} onChange={(e) => setFormData({ ...formData, accountType: e.target.value })} className="input w-full" placeholder="Ahorro, Corriente, caja chica…" required /></div>
                <div><label className="label">Número (opcional)</label><input type="text" value={formData.accountNumber} onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })} className="input w-full" /></div>
              </div>
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

      {showTransferModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowTransferModal(false)}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-lg w-full"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-white mb-4">Transferencia entre cuentas</h2>
            <p className="text-dark-400 text-sm mb-4">No registra ingreso ni gasto: solo mueve saldo.</p>
            <form onSubmit={submitTransfer} className="space-y-3">
              <div>
                <label className="label">Desde</label>
                <select
                  value={transferForm.fromAccountId}
                  onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">Seleccionar</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Hacia</label>
                <select
                  value={transferForm.toAccountId}
                  onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">Seleccionar</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={transferForm.amount}
                    onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">Moneda</label>
                  <select
                    value={transferForm.currency}
                    onChange={(e) =>
                      setTransferForm({ ...transferForm, currency: e.target.value as 'DOP' | 'USD' })
                    }
                    className="input w-full"
                  >
                    <option value="DOP">DOP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Nota (opcional)</label>
                <input
                  type="text"
                  value={transferForm.note}
                  onChange={(e) => setTransferForm({ ...transferForm, note: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  Transferir
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowTransferModal(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {showAdjustModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAdjustModal(false)}
          role="presentation"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-lg w-full"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-white mb-2">Ajuste de caja</h2>
            <p className="text-dark-400 text-sm mb-4">
              Corrige diferencias (positivo suma, negativo resta). Suele usarse en efectivo tras contar.
            </p>
            <form onSubmit={submitAdjust} className="space-y-3">
              <div>
                <label className="label">Cuenta</label>
                <select
                  value={adjustForm.bankAccountId}
                  onChange={(e) => setAdjustForm({ ...adjustForm, bankAccountId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">Seleccionar</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Delta (+ / −)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={adjustForm.amountDelta}
                    onChange={(e) => setAdjustForm({ ...adjustForm, amountDelta: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">Moneda</label>
                  <select
                    value={adjustForm.currency}
                    onChange={(e) =>
                      setAdjustForm({ ...adjustForm, currency: e.target.value as 'DOP' | 'USD' })
                    }
                    className="input w-full"
                  >
                    <option value="DOP">DOP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Motivo (opcional)</label>
                <input
                  type="text"
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  className="input w-full"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary flex-1">
                  Registrar ajuste
                </button>
                <button type="button" className="btn-secondary flex-1" onClick={() => setShowAdjustModal(false)}>
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

export default Accounts;
