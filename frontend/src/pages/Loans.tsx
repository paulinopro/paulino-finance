import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { Loan, LoanPayment } from '../types';
import { Plus, Edit, Trash2, Receipt, DollarSign, Search, X, Table, Clock, List } from 'lucide-react';
import toast from 'react-hot-toast';
import AmortizationTable from '../components/AmortizationTable';
import { TABLE_PAGE_SIZE } from '../constants/pagination';

const Loans: React.FC = () => {
  const loanFormModalRef = useRef<HTMLDivElement>(null);
  const paymentModalRef = useRef<HTMLDivElement>(null);
  const loanDetailsModalRef = useRef<HTMLDivElement>(null);
  const paymentHistoryModalRef = useRef<HTMLDivElement>(null);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showLoanDetails, setShowLoanDetails] = useState(false);
  const [showAmortizationTable, setShowAmortizationTable] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [paymentHistoryPage, setPaymentHistoryPage] = useState(1);
  const [summary, setSummary] = useState({ totalRemaining: 0, totalInstallment: 0, totalLoans: 0 });
  const [formData, setFormData] = useState({
    loanName: '',
    bankName: '',
    totalAmount: '',
    interestRate: '',
    interestRateType: 'ANNUAL' as 'ANNUAL' | 'MONTHLY',
    totalInstallments: '',
    startDate: '',
    endDate: '',
    installmentAmount: '',
    fixedCharge: '',
    paymentDay: '',
    currency: 'DOP',
    interestCalculationBase: 'ACTUAL_360' as 'ACTUAL_360' | 'ACTUAL_365' | '30_360' | '30_365',
    status: 'ACTIVE' as 'ACTIVE' | 'PAID' | 'DEFAULTED',
  });
  const [paymentData, setPaymentData] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    amount: '',
    notes: '',
  });

  useEffect(() => {
    fetchLoans();
  }, []);

  const fetchLoans = async () => {
    try {
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      if (bankFilter) params.bank = bankFilter;
      
      const response = await api.get('/loans', { params });
      setLoans(response.data.loans);
      setSummary(response.data.summary || { totalRemaining: 0, totalInstallment: 0, totalLoans: 0 });
    } catch (error: any) {
      toast.error('Error al cargar préstamos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLoans();
  }, [searchTerm, bankFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Ensure dates are properly formatted
      const processedStartDate = formData.startDate && formData.startDate.trim() !== '' ? formData.startDate : null;
      const processedEndDate = formData.endDate && formData.endDate.trim() !== '' ? formData.endDate : null;
      
      const data = {
        loanName: formData.loanName,
        bankName: formData.bankName || null,
        totalAmount: parseFloat(formData.totalAmount),
        interestRate: parseFloat(formData.interestRate),
        interestRateType: formData.interestRateType,
        totalInstallments: parseInt(formData.totalInstallments),
        installmentAmount: parseFloat(formData.installmentAmount),
        fixedCharge: formData.fixedCharge ? parseFloat(formData.fixedCharge) : 0,
        paymentDay: formData.paymentDay ? parseInt(formData.paymentDay) : null,
        startDate: processedStartDate,
        endDate: processedEndDate,
        currency: formData.currency,
        interestCalculationBase: formData.interestCalculationBase,
        status: formData.status,
      };

      if (editingLoan) {
        await api.put(`/loans/${editingLoan.id}`, data);
        toast.success('Préstamo actualizado');
      } else {
        await api.post('/loans', data);
        toast.success('Préstamo creado');
      }

      setShowModal(false);
      resetForm();
      fetchLoans();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar préstamo');
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    try {
      await api.post(`/loans/${selectedLoan.id}/payment`, {
        paymentDate: paymentData.paymentDate,
        amount: parseFloat(paymentData.amount),
        notes: paymentData.notes,
      });
      toast.success('Pago registrado');
      setShowPaymentModal(false);
      setPaymentData({ paymentDate: new Date().toISOString().split('T')[0], amount: '', notes: '' });
      fetchLoans();
      if (selectedLoan) {
        const loanRes = await api.get(`/loans/${selectedLoan.id}`);
        setSelectedLoan(loanRes.data.loan);
      }
    } catch (error: any) {
      toast.error('Error al registrar pago');
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este pago?')) return;
    try {
      await api.delete(`/loans/payments/${paymentId}`);
      toast.success('Pago eliminado');
      if (selectedLoan) {
        const loanRes = await api.get(`/loans/${selectedLoan.id}`);
        setSelectedLoan(loanRes.data.loan);
      }
      fetchLoans();
    } catch (error: any) {
      toast.error('Error al eliminar pago');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este préstamo?')) return;
    try {
      await api.delete(`/loans/${id}`);
      toast.success('Préstamo eliminado');
      fetchLoans();
    } catch (error: any) {
      toast.error('Error al eliminar préstamo');
    }
  };

  const handleViewDetails = async (loan: Loan) => {
    try {
      const response = await api.get(`/loans/${loan.id}`);
      setSelectedLoan(response.data.loan);
      setShowLoanDetails(true);
    } catch (error: any) {
      toast.error('Error al cargar detalles');
    }
  };

  const handleViewPaymentHistory = async (loan: Loan) => {
    try {
      const response = await api.get(`/loans/${loan.id}`);
      setSelectedLoan(response.data.loan);
      setPaymentHistoryPage(1); // Reset to first page
      setShowPaymentHistory(true);
    } catch (error: any) {
      toast.error('Error al cargar historial de pagos');
    }
  };

  // Helper function to format dates without timezone issues
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    try {
      // Handle different date formats
      let date: Date;
      if (typeof dateString === 'string') {
        // If it's already a date string, try to parse it
        if (dateString.includes('T')) {
          date = new Date(dateString);
        } else {
          // If it's YYYY-MM-DD format, add time to avoid timezone issues
          date = new Date(dateString + 'T12:00:00');
        }
      } else {
        date = new Date(dateString);
      }
      
      // Check if date is valid
      if (isNaN(date.getTime())) return '';
      
      return date.toLocaleDateString('es-DO');
    } catch (error) {
      return '';
    }
  };

  const formatDateFull = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    try {
      let date: Date;
      if (typeof dateString === 'string') {
        if (dateString.includes('T')) {
          date = new Date(dateString);
        } else {
          date = new Date(dateString + 'T12:00:00');
        }
      } else {
        date = new Date(dateString);
      }
      
      if (isNaN(date.getTime())) return '';
      
      return date.toLocaleDateString('es-DO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch (error) {
      return '';
    }
  };

  const formatDateShort = (dateString: string | null | undefined): string => {
    if (!dateString) return '';
    try {
      let date: Date;
      if (typeof dateString === 'string') {
        if (dateString.includes('T')) {
          date = new Date(dateString);
        } else {
          date = new Date(dateString + 'T12:00:00');
        }
      } else {
        date = new Date(dateString);
      }
      
      if (isNaN(date.getTime())) return '';
      
      return date.toLocaleDateString('es-DO', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    } catch (error) {
      return '';
    }
  };

  const formatInterestCalculationBase = (base: string | undefined): string => {
    if (!base) return 'Mes Actual / 360';
    return base.replace('ACTUAL_', 'Mes Actual / ').replace('30_', '30 / ').replace('_', ' / ');
  };

  const resetForm = () => {
    setFormData({
      loanName: '',
      bankName: '',
      totalAmount: '',
      interestRate: '',
      interestRateType: 'ANNUAL',
      totalInstallments: '',
      startDate: '',
      endDate: '',
      installmentAmount: '',
      fixedCharge: '',
      paymentDay: '',
      currency: 'DOP',
      interestCalculationBase: 'ACTUAL_360',
      status: 'ACTIVE',
    });
    setEditingLoan(null);
  };

  const handleEdit = async (loan: Loan) => {
    try {
      const response = await api.get(`/loans/${loan.id}`);
      const loanData = response.data.loan;
      setFormData({
        loanName: loanData.loanName,
        bankName: loanData.bankName || '',
        totalAmount: loanData.totalAmount.toString(),
        interestRate: loanData.interestRate.toString(),
        interestRateType: loanData.interestRateType,
        totalInstallments: loanData.totalInstallments.toString(),
        startDate: loanData.startDate.split('T')[0],
        endDate: loanData.endDate ? loanData.endDate.split('T')[0] : '',
        installmentAmount: loanData.installmentAmount.toString(),
        fixedCharge: loanData.fixedCharge?.toString() || '0',
        paymentDay: loanData.paymentDay?.toString() || '',
        currency: loanData.currency,
        interestCalculationBase: loanData.interestCalculationBase || 'ACTUAL_360',
        status: loanData.status || 'ACTIVE',
      });
      setEditingLoan(loanData);
      setShowModal(true);
    } catch (error: any) {
      toast.error('Error al cargar préstamo para editar');
    }
  };

  const uniqueBanks = Array.from(new Set(loans.filter(l => l.bankName).map(l => l.bankName)));

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Activo';
      case 'PAID':
        return 'Pagado';
      case 'DEFAULTED':
        return 'En Mora';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'text-yellow-400';
      case 'PAID':
        return 'text-green-400';
      case 'DEFAULTED':
        return 'text-red-400';
      default:
        return 'text-dark-400';
    }
  };

  useEscapeKey(
    showModal || showPaymentModal || showLoanDetails || showPaymentHistory,
    () => {
      if (showPaymentHistory) {
        setShowPaymentHistory(false);
        setSelectedLoan(null);
        setPaymentHistoryPage(1);
      } else if (showLoanDetails) {
        setShowLoanDetails(false);
      } else if (showPaymentModal) {
        setShowPaymentModal(false);
      } else if (showModal) {
        setShowModal(false);
        resetForm();
      }
    }
  );
  useModalFocusTrap(loanFormModalRef, showModal);
  useModalFocusTrap(paymentModalRef, showPaymentModal);
  useModalFocusTrap(loanDetailsModalRef, showLoanDetails);
  useModalFocusTrap(paymentHistoryModalRef, showPaymentHistory);

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="min-w-0">
          <h1 className="page-title">Préstamos</h1>
          <p className="text-dark-400 text-sm sm:text-base">Gestiona tus préstamos activos</p>
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
          <span>Agregar Préstamo</span>
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">Restante Total</p>
              <p className="text-2xl font-bold text-white">{summary.totalRemaining.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Cuotas Totales</p>
              <p className="text-2xl font-bold text-white">{summary.totalInstallment.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Cantidad de Préstamos</p>
              <p className="text-2xl font-bold text-white">{summary.totalLoans}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por nombre o banco..."
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
              {uniqueBanks.map((bank) => (
                <option key={bank} value={bank}>{bank}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loans.length === 0 ? (
        <div className="card text-center py-12">
          <Receipt className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">No tienes préstamos registrados</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">Agregar Primer Préstamo</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loans.map((loan) => (
            <motion.div key={loan.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{loan.loanName}</h3>
                  {loan.bankName && <p className="text-sm text-dark-400">{loan.bankName}</p>}
                  <p className={`text-sm font-medium ${getStatusColor(loan.status)}`}>Estado: {getStatusText(loan.status)}</p>
                </div>
                      <div className="flex space-x-2">
                        <button onClick={() => { setSelectedLoan(loan); setShowAmortizationTable(true); }} className="p-2 text-purple-400 hover:text-purple-300" title="Tabla de Amortización">
                          <Table size={18} />
                        </button>
                        <button onClick={() => handleViewDetails(loan)} className="p-2 text-blue-400 hover:text-blue-300" title="Ver Detalles">
                          <Receipt size={18} />
                        </button>
                        <button onClick={() => handleViewPaymentHistory(loan)} className="p-2 text-yellow-400 hover:text-yellow-300" title="Historial de Pagos">
                          <List size={18} />
                        </button>
                        <button onClick={() => { setSelectedLoan(loan); setPaymentData({ ...paymentData, amount: loan.installmentAmount.toString() }); setShowPaymentModal(true); }} className="p-2 text-green-400 hover:text-green-300" title="Registrar Pago">
                          <DollarSign size={18} />
                        </button>
                        <button onClick={() => handleEdit(loan)} className="p-2 text-primary-400 hover:text-primary-300">
                          <Edit size={18} />
                        </button>
                        <button onClick={() => handleDelete(loan.id)} className="p-2 text-red-400 hover:text-red-300">
                          <Trash2 size={18} />
                        </button>
                      </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between"><span className="text-dark-400">Monto Total:</span><span className="text-white font-medium">{loan.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {loan.currency}</span></div>
                <div className="flex justify-between"><span className="text-dark-400">Tasa:</span><span className="text-white">{loan.interestRate}% {loan.interestRateType === 'ANNUAL' ? 'Anual' : 'Mensual'}</span></div>
                <div className="flex justify-between"><span className="text-dark-400">Cuotas:</span><span className="text-white">{loan.paidInstallments}/{loan.totalInstallments}</span></div>
                <div className="flex justify-between"><span className="text-dark-400">Cuota:</span><span className="text-white">{loan.installmentAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {loan.currency}</span></div>
                {loan.remainingBalance !== undefined && <div className="flex justify-between"><span className="text-dark-400">Restante:</span><span className="text-red-400 font-medium">{loan.remainingBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {loan.currency}</span></div>}
                <div className="w-full bg-dark-600 rounded-full h-2 mt-4">
                  <div className="bg-primary-600 h-2 rounded-full" style={{ width: `${loan.progress || 0}%` }} />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Loan Modal */}
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
            ref={loanFormModalRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-2xl w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="loans-form-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="loans-form-modal-title" className="text-2xl font-bold text-white mb-6">
              {editingLoan ? 'Editar Préstamo' : 'Nuevo Préstamo'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="label">Nombre del Préstamo</label><input type="text" value={formData.loanName} onChange={(e) => setFormData({ ...formData, loanName: e.target.value })} className="input w-full" required /></div>
              <div><label className="label">Banco (opcional)</label><input type="text" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="input w-full" placeholder="Nombre del banco" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Monto Total</label><input type="number" step="0.01" value={formData.totalAmount} onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">Tasa de Interés</label><input type="number" step="0.01" value={formData.interestRate} onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })} className="input w-full" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Tipo de Tasa</label><select value={formData.interestRateType} onChange={(e) => setFormData({ ...formData, interestRateType: e.target.value as any })} className="input w-full"><option value="ANNUAL">Anual</option><option value="MONTHLY">Mensual</option></select></div>
                <div><label className="label">Total de Cuotas</label><input type="number" value={formData.totalInstallments} onChange={(e) => setFormData({ ...formData, totalInstallments: e.target.value })} className="input w-full" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Fecha de Inicio</label><input type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">Fecha de Vencimiento (opcional)</label><input type="date" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} className="input w-full" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Monto de Cuota</label><input type="number" step="0.01" value={formData.installmentAmount} onChange={(e) => setFormData({ ...formData, installmentAmount: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">Cargo Fijo</label><input type="number" step="0.01" value={formData.fixedCharge} onChange={(e) => setFormData({ ...formData, fixedCharge: e.target.value })} className="input w-full" placeholder="0.00" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Día de Pago</label><input type="number" min="1" max="31" value={formData.paymentDay} onChange={(e) => setFormData({ ...formData, paymentDay: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">Moneda</label><select value={formData.currency} onChange={(e) => setFormData({ ...formData, currency: e.target.value })} className="input w-full"><option value="DOP">DOP</option><option value="USD">USD</option></select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Base de cálculo de interés</label>
                  <select 
                    value={formData.interestCalculationBase} 
                    onChange={(e) => setFormData({ ...formData, interestCalculationBase: e.target.value as any })} 
                    className="input w-full"
                  >
                  <option value="ACTUAL_360">Mes Actual / 360</option>
                  <option value="ACTUAL_365">Mes Actual / 365</option>
                    <option value="30_360">30 / 360</option>
                    <option value="30_365">30 / 365</option>
                  </select>
                </div>
                <div>
                  <label className="label">Estado</label>
                  <select 
                    value={formData.status} 
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })} 
                    className="input w-full"
                  >
                    <option value="ACTIVE">Activo</option>
                    <option value="PAID">Pagado</option>
                    <option value="DEFAULTED">En Mora</option>
                  </select>
                </div>
              </div>
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">{editingLoan ? 'Actualizar' : 'Crear'}</button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">Cancelar</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedLoan && (
        <div
          className="modal-overlay"
          onClick={() => setShowPaymentModal(false)}
          role="presentation"
        >
          <motion.div
            ref={paymentModalRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="loans-payment-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="loans-payment-modal-title" className="text-2xl font-bold text-white mb-6">
              Registrar Pago
            </h2>
            <form onSubmit={handlePayment} className="space-y-4">
              <div><label className="label">Fecha de Pago</label><input type="date" value={paymentData.paymentDate} onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })} className="input w-full" required /></div>
              <div><label className="label">Monto</label><input type="number" step="0.01" value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} className="input w-full" required /></div>
              <div><label className="label">Notas (opcional)</label><textarea value={paymentData.notes} onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })} className="input w-full" rows={3} /></div>
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">Registrar</button>
                <button type="button" onClick={() => setShowPaymentModal(false)} className="btn-secondary flex-1">Cancelar</button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Loan Details Modal */}
      {showLoanDetails && selectedLoan && (
        <div className="modal-overlay" onClick={() => setShowLoanDetails(false)} role="presentation">
          <motion.div
            ref={loanDetailsModalRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-2xl w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="loans-details-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 id="loans-details-modal-title" className="text-2xl font-bold text-white">
                Detalles del Préstamo
              </h2>
              <button onClick={() => setShowLoanDetails(false)} className="text-dark-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-6">
              {/* Información Principal */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Información del Préstamo</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-dark-400 text-sm">Nombre:</span>
                    <p className="text-white font-medium">{selectedLoan.loanName}</p>
                  </div>
                  {selectedLoan.bankName && (
                    <div>
                      <span className="text-dark-400 text-sm">Banco:</span>
                      <p className="text-white font-medium">{selectedLoan.bankName}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-dark-400 text-sm">Monto Total:</span>
                    <p className="text-white font-medium">{selectedLoan.totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {selectedLoan.currency}</p>
                  </div>
                  {selectedLoan.remainingBalance !== undefined && (
                    <div>
                      <span className="text-dark-400 text-sm">Monto Restante:</span>
                      <p className="text-red-400 font-medium">{selectedLoan.remainingBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {selectedLoan.currency}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-dark-400 text-sm">Tasa de Interés:</span>
                    <p className="text-white font-medium">{selectedLoan.interestRate}% {selectedLoan.interestRateType === 'ANNUAL' ? 'Anual' : 'Mensual'}</p>
                  </div>
                  <div>
                    <span className="text-dark-400 text-sm">Cuotas:</span>
                    <p className="text-white font-medium">{selectedLoan.paidInstallments} / {selectedLoan.totalInstallments}</p>
                  </div>
                  <div>
                    <span className="text-dark-400 text-sm">Monto de Cuota:</span>
                    <p className="text-white font-medium">{selectedLoan.installmentAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {selectedLoan.currency}</p>
                  </div>
                  {selectedLoan.nextPaymentDate && (
                    <div>
                      <span className="text-dark-400 text-sm">Próximo Pago:</span>
                      <p className="text-primary-400 font-medium">{formatDateFull(selectedLoan.nextPaymentDate)}</p>
                    </div>
                  )}
                  {selectedLoan.startDate && (
                    <div>
                      <span className="text-dark-400 text-sm">Fecha de Inicio:</span>
                      <p className="text-white font-medium">{formatDate(selectedLoan.startDate)}</p>
                    </div>
                  )}
                  {selectedLoan.endDate && (
                    <div>
                      <span className="text-dark-400 text-sm">Fecha de Vencimiento:</span>
                      <p className="text-white font-medium">{formatDate(selectedLoan.endDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Amortization Table Modal */}
      {showAmortizationTable && selectedLoan && (
        <AmortizationTable
          loanId={selectedLoan.id}
          onClose={() => {
            setShowAmortizationTable(false);
            setSelectedLoan(null);
          }}
          onPaymentUpdate={fetchLoans}
        />
      )}

      {/* Payment History Modal */}
      {showPaymentHistory && selectedLoan && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowPaymentHistory(false);
            setSelectedLoan(null);
            setPaymentHistoryPage(1);
          }}
          role="presentation"
        >
          <motion.div
            ref={paymentHistoryModalRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-4xl w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="loans-payment-history-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 id="loans-payment-history-title" className="text-xl font-bold text-white">
                  Historial de Pagos
                </h2>
                <p className="text-xs text-dark-400 mt-1">{selectedLoan.loanName}</p>
              </div>
              <button onClick={() => { setShowPaymentHistory(false); setSelectedLoan(null); setPaymentHistoryPage(1); }} className="text-dark-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            {(() => {
              const payments = selectedLoan.payments || [];
              const itemsPerPage = TABLE_PAGE_SIZE;
              const totalPages = Math.max(1, Math.ceil(payments.length / itemsPerPage));
              const currentPage = Math.min(paymentHistoryPage, totalPages);
              const startIndex = (currentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const paginatedPayments = payments.slice(startIndex, endIndex);

              return (
                <div className="space-y-2">
                  {payments.length > 0 ? (
                    <>
                      <div className="space-y-2">
                        {paginatedPayments.map((payment: LoanPayment) => (
                          <div key={payment.id} className="bg-dark-700 rounded-lg p-3 border border-dark-600">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  <span className="text-sm font-semibold text-white">Cuota #{payment.installmentNumber || 'N/A'}</span>
                                  {payment.paymentDate && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-primary-400/10 text-primary-400">
                                      {formatDateShort(payment.paymentDate) || 'Fecha no disponible'}
                                    </span>
                                  )}
                                  {payment.paymentType && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-dark-600 text-dark-300">
                                      {payment.paymentType === 'COMPLETE' ? 'Completo' : payment.paymentType === 'PARTIAL' ? 'Parcial' : 'Adelantado'}
                                    </span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                                  <div>
                                    <span className="text-dark-400 block mb-0.5">Total:</span>
                                    <p className="text-white font-medium">{payment.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {selectedLoan.currency}</p>
                                  </div>
                                  {payment.principalAmount !== undefined && payment.principalAmount > 0 && (
                                    <div>
                                      <span className="text-dark-400 block mb-0.5">Capital:</span>
                                      <p className="text-green-400 font-medium">{payment.principalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {selectedLoan.currency}</p>
                                    </div>
                                  )}
                                  {payment.interestAmount !== undefined && payment.interestAmount > 0 && (
                                    <div>
                                      <span className="text-dark-400 block mb-0.5">Interés:</span>
                                      <p className="text-yellow-400 font-medium">{payment.interestAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {selectedLoan.currency}</p>
                                    </div>
                                  )}
                                  {payment.chargeAmount !== undefined && payment.chargeAmount > 0 && (
                                    <div>
                                      <span className="text-dark-400 block mb-0.5">Cargo:</span>
                                      <p className="text-orange-400 font-medium">{payment.chargeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {selectedLoan.currency}</p>
                                    </div>
                                  )}
                                  {payment.lateFee !== undefined && payment.lateFee > 0 && (
                                    <div>
                                      <span className="text-dark-400 block mb-0.5">Mora:</span>
                                      <p className="text-red-400 font-medium">{payment.lateFee.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {selectedLoan.currency}</p>
                                    </div>
                                  )}
                                  {payment.outstandingBalance !== undefined && (
                                    <div>
                                      <span className="text-dark-400 block mb-0.5">Saldo:</span>
                                      <p className="text-blue-400 font-medium">{payment.outstandingBalance.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {selectedLoan.currency}</p>
                                    </div>
                                  )}
                                </div>
                                {payment.notes && (
                                  <div className="mt-2 pt-2 border-t border-dark-600">
                                    <span className="text-dark-400 text-xs">Nota: </span>
                                    <span className="text-dark-300 text-xs">{payment.notes}</span>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => handleDeletePayment(payment.id)}
                                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                                title="Eliminar pago"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {payments.length > itemsPerPage && (
                        <div className="flex items-center justify-between pt-3 border-t border-dark-700 text-xs text-dark-300">
                          <span>
                            Página {currentPage} de {totalPages} ({payments.length} pagos)
                          </span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={currentPage === 1}
                              onClick={() => setPaymentHistoryPage((prev) => Math.max(1, prev - 1))}
                              className={`px-3 py-1.5 rounded-lg border border-dark-600 transition-colors ${
                                currentPage === 1
                                  ? 'text-dark-500 cursor-not-allowed opacity-50'
                                  : 'text-white hover:bg-dark-700'
                              }`}
                            >
                              Anterior
                            </button>
                            <button
                              type="button"
                              disabled={currentPage === totalPages}
                              onClick={() => setPaymentHistoryPage((prev) => Math.min(totalPages, prev + 1))}
                              className={`px-3 py-1.5 rounded-lg border border-dark-600 transition-colors ${
                                currentPage === totalPages
                                  ? 'text-dark-500 cursor-not-allowed opacity-50'
                                  : 'text-white hover:bg-dark-700'
                              }`}
                            >
                              Siguiente
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <List className="w-12 h-12 text-dark-600 mx-auto mb-3" />
                      <p className="text-dark-400 text-sm">No hay pagos registrados para este préstamo</p>
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

export default Loans;
