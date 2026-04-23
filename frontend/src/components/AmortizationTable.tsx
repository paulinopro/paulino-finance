import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { AmortizationScheduleItem, BankAccount, LoanAmortizationSummary, LoanPayment } from '../types';
import { X, CheckCircle, Clock, AlertCircle, Calendar, Edit, Trash2, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { formatDateInTimezone, todayYmdLocal } from '../utils/dateUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';

interface AmortizationTableProps {
  loanId: number;
  onClose: () => void;
  onPaymentUpdate?: () => void;
}

const AmortizationTable: React.FC<AmortizationTableProps> = ({ loanId, onClose, onPaymentUpdate }) => {
  const mainPanelRef = useRef<HTMLDivElement>(null);
  const paymentPanelRef = useRef<HTMLDivElement>(null);
  const editPaymentPanelRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<LoanAmortizationSummary | null>(null);
  const [schedule, setSchedule] = useState<AmortizationScheduleItem[]>([]);
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showEditPaymentModal, setShowEditPaymentModal] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<AmortizationScheduleItem | null>(null);
  const [editingPayment, setEditingPayment] = useState<LoanPayment | null>(null);
  const [paymentData, setPaymentData] = useState({
    paymentDate: todayYmdLocal(),
    amount: '',
    paymentType: 'COMPLETE' as 'COMPLETE' | 'PARTIAL' | 'ADVANCE' | 'INTEREST',
    notes: '',
    installmentNumber: undefined as number | undefined,
    bankAccountId: '',
  });
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/accounts');
        setBankAccounts(res.data.accounts || []);
      } catch {
        setBankAccounts([]);
      }
    })();
  }, []);

  const fetchAmortizationData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get(`/loans/${loanId}/amortization`);
      setSummary(response.data.summary);
      setSchedule(response.data.schedule);

      const loanResponse = await api.get(`/loans/${loanId}`);
      setPayments(loanResponse.data.loan.payments || []);
    } catch (error: any) {
      toast.error('Error al cargar tabla de amortización');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useEffect(() => {
    fetchAmortizationData();
  }, [fetchAmortizationData]);

  const accountsForAmortPayment = useMemo(() => {
    const c = summary?.currency;
    if (!c) return [];
    return bankAccounts.filter((a) => a.currencyType === 'DUAL' || a.currencyType === c);
  }, [bankAccounts, summary?.currency]);

  const bankAccountNameById = useMemo(() => {
    const m = new Map<number, string>();
    bankAccounts.forEach((a) => m.set(a.id, formatBankAccountOptionLabel(a)));
    return m;
  }, [bankAccounts]);

  const handleRegisterPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInstallment) return;

    try {
      const payload: Record<string, unknown> = {
        paymentDate: paymentData.paymentDate,
        amount: parseFloat(paymentData.amount),
        paymentType: paymentData.paymentType,
        notes: paymentData.notes,
        installmentNumber: paymentData.installmentNumber !== undefined ? paymentData.installmentNumber : selectedInstallment.installmentNumber,
      };
      if (paymentData.bankAccountId) {
        payload.bankAccountId = parseInt(paymentData.bankAccountId, 10);
      } else {
        payload.bankAccountId = null;
      }
      await api.post(`/loans/${loanId}/payment`, payload);

      toast.success('Pago registrado exitosamente');
      setShowPaymentModal(false);
      setSelectedInstallment(null);
      setPaymentData({
        paymentDate: todayYmdLocal(),
        amount: '',
        paymentType: 'COMPLETE',
        notes: '',
        installmentNumber: undefined,
        bankAccountId: '',
      });
      fetchAmortizationData();
      if (onPaymentUpdate) onPaymentUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al registrar pago');
    }
  };

  const handleEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment) return;

    try {
      const putPayload: Record<string, unknown> = {
        paymentDate: paymentData.paymentDate,
        amount: parseFloat(paymentData.amount),
        paymentType: paymentData.paymentType,
        notes: paymentData.notes,
        installmentNumber: paymentData.installmentNumber,
      };
      if (paymentData.bankAccountId) {
        putPayload.bankAccountId = parseInt(paymentData.bankAccountId, 10);
      } else {
        putPayload.bankAccountId = null;
      }
      await api.put(`/loans/payments/${editingPayment.id}`, putPayload);

      toast.success('Pago actualizado exitosamente');
      setShowEditPaymentModal(false);
      setEditingPayment(null);
      setPaymentData({
        paymentDate: todayYmdLocal(),
        amount: '',
        paymentType: 'COMPLETE',
        notes: '',
        installmentNumber: undefined,
        bankAccountId: '',
      });
      fetchAmortizationData();
      if (onPaymentUpdate) onPaymentUpdate();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al actualizar pago');
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!window.confirm('¿Estás seguro de eliminar este pago?')) return;

    try {
      await api.delete(`/loans/${loanId}/payments/${paymentId}`);
      toast.success('Pago eliminado exitosamente');
      fetchAmortizationData();
      if (onPaymentUpdate) onPaymentUpdate();
    } catch (error: any) {
      toast.error('Error al eliminar pago');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PAID':
        return <CheckCircle className="text-green-400" size={18} />;
      case 'PENDING':
        return <Clock className="text-yellow-400" size={18} />;
      case 'OVERDUE':
        return <AlertCircle className="text-red-400" size={18} />;
      default:
        return <Calendar className="text-dark-400" size={18} />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'Pagado';
      case 'PENDING':
        return 'Pendiente';
      case 'OVERDUE':
        return 'Atrasado';
      default:
        return 'Futuro';
    }
  };

  const formatCurrency = (amount: number, currency: string = 'DOP') => {
    return new Intl.NumberFormat('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Fecha inválida';
    const timezone = user?.timezone || 'America/Santo_Domingo';
    try {
      return formatDateInTimezone(dateString, timezone);
    } catch (error) {
      console.error('Error formatting date:', dateString, error);
      return dateString; // Return original string if formatting fails
    }
  };

  const calculateProgress = (installmentNumber: number, totalInstallments: number) => {
    // Installment 0 is disbursement, so we calculate progress from installment 1
    if (installmentNumber === 0) return 0;
    return ((installmentNumber) / totalInstallments) * 100;
  };

  useEscapeKey(
    !loading && showEditPaymentModal && !!editingPayment,
    () => setShowEditPaymentModal(false)
  );
  useEscapeKey(
    !loading && showPaymentModal && !!selectedInstallment && !showEditPaymentModal,
    () => setShowPaymentModal(false)
  );
  useEscapeKey(
    !loading && !!summary && !showPaymentModal && !showEditPaymentModal,
    onClose
  );
  useModalFocusTrap(
    editPaymentPanelRef,
    !loading && showEditPaymentModal && !!editingPayment
  );
  useModalFocusTrap(
    paymentPanelRef,
    !loading && showPaymentModal && !!selectedInstallment && !showEditPaymentModal
  );
  useModalFocusTrap(
    mainPanelRef,
    !loading && !!summary && !showPaymentModal && !showEditPaymentModal
  );

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const currentInstallment = schedule.find(
    (item) => item.status === 'PENDING' || item.status === 'OVERDUE'
  );

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <motion.div
        ref={mainPanelRef}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-dark-800 border border-dark-700 max-w-7xl w-full modal-sheet shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="amortization-main-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-dark-800 border-b border-dark-700 p-6 flex items-center justify-between">
          <div>
            <h2 id="amortization-main-title" className="text-2xl font-bold text-white">
              Tabla de Amortización
            </h2>
            <p className="text-dark-400 mt-1">
              {summary.loanName} {summary.bankName && `- ${summary.bankName}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-dark-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Card */}
          <div className="bg-dark-700 rounded-lg p-6 border border-dark-600">
            <h3 className="text-lg font-semibold text-white mb-4">Resumen del Préstamo</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-dark-400">Monto Original</p>
                <p className="text-xl font-bold text-white">
                  {formatCurrency(summary.originalAmount)} {summary.currency}
                </p>
              </div>
              <div>
                <p className="text-sm text-dark-400">Saldo Actual</p>
                <p className="text-xl font-bold text-white">
                  {formatCurrency(summary.currentBalance)} {summary.currency}
                </p>
                <p className="text-xs text-dark-400">
                  ({summary.balancePercentage.toFixed(1)}% pendiente)
                </p>
              </div>
              <div>
                <p className="text-sm text-dark-400">Cuotas Pagadas</p>
                <p className="text-xl font-bold text-white">
                  {summary.paidInstallments}/{summary.totalInstallments}
                </p>
                <p className="text-xs text-dark-400">
                  ({summary.completionPercentage.toFixed(1)}% completado)
                </p>
              </div>
              <div>
                <p className="text-sm text-dark-400">Capital Pagado</p>
                <p className="text-lg font-semibold text-green-400">
                  {formatCurrency(summary.totalPrincipalPaid)} {summary.currency}
                </p>
              </div>
              <div>
                <p className="text-sm text-dark-400">Interés Pagado</p>
                <p className="text-lg font-semibold text-yellow-400">
                  {formatCurrency(summary.totalInterestPaid)} {summary.currency}
                </p>
              </div>
              {summary.nextPaymentDate && (
                <div>
                  <p className="text-sm text-dark-400">Próximo Vencimiento</p>
                  <p className="text-lg font-semibold text-white">
                    {formatDate(summary.nextPaymentDate)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Current Installment Card */}
          {currentInstallment && (
            <div className="bg-primary-900/20 border border-primary-600 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Cuota Actual #{currentInstallment.installmentNumber}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-dark-400">Vencimiento</p>
                  <p className="text-lg font-semibold text-white">
                    {formatDate(currentInstallment.dueDate)}
                  </p>
                  <p className="text-sm text-dark-400 mt-1">
                    Estado: {getStatusLabel(currentInstallment.status)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-dark-400">Total a Pagar</p>
                  <p className="text-2xl font-bold text-white">
                    {formatCurrency(currentInstallment.totalDue)} {summary.currency}
                  </p>
                </div>
              </div>
              <div className="bg-dark-700 rounded-lg p-4 mb-4">
                <p className="text-sm font-semibold text-white mb-2">Componentes de la Cuota:</p>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-dark-400">Capital Programado:</span>
                    <span className="text-white">{formatCurrency(currentInstallment.principalAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-400">Interés Programado:</span>
                    <span className="text-white">{formatCurrency(currentInstallment.interestAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-dark-400">Cargo Fijo:</span>
                    <span className="text-white">{formatCurrency(currentInstallment.chargeAmount)}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedInstallment(currentInstallment);
                  setPaymentData({
                    ...paymentData,
                    amount: currentInstallment.totalDue.toString(),
                  });
                  setShowPaymentModal(true);
                }}
                className="btn-primary w-full"
              >
                Registrar Pago
              </button>
            </div>
          )}

          {/* Amortization Table */}
          <div className="bg-dark-700 rounded-lg overflow-hidden">
            <div className="table-responsive table-stack">
              <table className="w-full">
                <thead className="bg-dark-600">
                  <tr>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">#</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Fecha</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Estado</th>
                    <th className="text-right py-3 px-4 text-dark-400 font-medium">Capital</th>
                    <th className="text-right py-3 px-4 text-dark-400 font-medium">Interés</th>
                    <th className="text-right py-3 px-4 text-dark-400 font-medium">Cargo</th>
                    <th className="text-right py-3 px-4 text-dark-400 font-medium">Total</th>
                    <th className="text-right py-3 px-4 text-dark-400 font-medium">Saldo Final</th>
                    <th className="text-center py-3 px-4 text-dark-400 font-medium">Progreso</th>
                    <th className="text-center py-3 px-4 text-dark-400 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((item) => {
                    // For installment 0, find all payments for that installment
                    // For other installments, find payment by paymentId
                    let payment: LoanPayment | null = null;
                    if (item.installmentNumber === 0) {
                      // Find all payments for installment 0, use the most recent one
                      const installment0Payments = payments.filter((p) => p.installmentNumber === 0);
                      if (installment0Payments.length > 0) {
                        payment = installment0Payments[installment0Payments.length - 1];
                      }
                    } else {
                      payment = item.paymentId
                        ? payments.find((p) => p.id === item.paymentId) || null
                        : null;
                    }
                    return (
                      <tr
                        key={item.installmentNumber}
                        className={`border-b border-dark-600 hover:bg-dark-600 max-md:border-0 ${
                          item.status === 'PAID' ? 'bg-green-900/10' : ''
                        } ${item.installmentNumber === 0 ? 'bg-blue-900/10' : ''}`}
                      >
                        <td data-label="#" className="py-3 px-4 font-medium">
                          <span className="table-stack-value text-white">
                            {item.installmentNumber === 0 ? '0 (Desembolso)' : item.installmentNumber}
                          </span>
                        </td>
                        <td data-label="Fecha" className="py-3 px-4">
                          <span className="table-stack-value text-white">{formatDate(item.dueDate)}</span>
                        </td>
                        <td data-label="Estado" className="py-3 px-4">
                          <span className="table-stack-value">
                            <div className="flex items-center justify-end gap-2">
                              {item.installmentNumber === 0 ? (
                                <span className="text-blue-400 text-sm">Desembolso</span>
                              ) : (
                                <>
                                  {getStatusIcon(item.status)}
                                  <span className="text-dark-300">{getStatusLabel(item.status)}</span>
                                </>
                              )}
                            </div>
                          </span>
                        </td>
                        <td data-label="Capital" className="py-3 px-4 text-right text-white md:text-right">
                          <span className="table-stack-value text-white">
                            {item.installmentNumber === 0 ? (
                              <span className="text-dark-400">-</span>
                            ) : (
                              formatCurrency(item.principalAmount)
                            )}
                          </span>
                        </td>
                        <td data-label="Interés" className="py-3 px-4 text-right text-white md:text-right">
                          <span className="table-stack-value text-white">
                            {item.installmentNumber === 0 ? (
                              <span className="text-dark-400">-</span>
                            ) : (
                              formatCurrency(item.interestAmount)
                            )}
                          </span>
                        </td>
                        <td data-label="Cargo" className="py-3 px-4 text-right text-white md:text-right">
                          <span className="table-stack-value text-white">
                            {item.installmentNumber === 0 ? (
                              <span className="text-dark-400">-</span>
                            ) : (
                              formatCurrency(item.chargeAmount)
                            )}
                          </span>
                        </td>
                        <td data-label="Total" className="py-3 px-4 text-right font-semibold text-white md:text-right">
                          <span className="table-stack-value font-semibold text-white">{formatCurrency(item.totalDue)}</span>
                        </td>
                        <td data-label="Saldo final" className="py-3 px-4 text-right text-white md:text-right">
                          <span className="table-stack-value text-white">{formatCurrency(item.outstandingBalance)}</span>
                        </td>
                        <td data-label="Progreso" className="py-3 px-4">
                          <span className="table-stack-value w-full max-w-[8rem]">
                            {item.installmentNumber === 0 ? (
                              <span className="text-dark-400 text-xs">-</span>
                            ) : (
                              <div className="w-full bg-dark-600 rounded-full h-2">
                                <div
                                  className="bg-primary-600 h-2 rounded-full"
                                  style={{
                                    width: `${calculateProgress(item.installmentNumber, summary.totalInstallments)}%`,
                                  }}
                                />
                              </div>
                            )}
                          </span>
                        </td>
                        <td data-label="Acciones" className="py-3 px-4">
                          <span className="table-stack-value">
                          <div className="flex items-center justify-end gap-2">
                            {(item.installmentNumber === 0 || item.status === 'PENDING' || item.status === 'OVERDUE') ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedInstallment(item);
                                  setPaymentData({
                                    paymentDate: todayYmdLocal(),
                                    amount: item.installmentNumber === 0 ? '' : item.totalDue.toString(),
                                    paymentType: 'COMPLETE',
                                    notes: '',
                                    installmentNumber: item.installmentNumber,
                                    bankAccountId: '',
                                  });
                                  setShowPaymentModal(true);
                                }}
                                className="p-2 text-primary-400 hover:text-primary-300"
                                title={item.installmentNumber === 0 ? "Registrar Pago al Capital" : "Registrar Pago"}
                              >
                                <DollarSign size={18} />
                              </button>
                            ) : null}
                            {payment ? (() => {
                              const p = payment;
                              return (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingPayment(p);
                                    setPaymentData({
                                      paymentDate: p.paymentDate.split('T')[0],
                                      amount: p.amount.toString(),
                                      paymentType: p.paymentType || 'COMPLETE',
                                      notes: p.notes || '',
                                      installmentNumber: p.installmentNumber,
                                      bankAccountId: p.bankAccountId != null ? String(p.bankAccountId) : '',
                                    });
                                    setShowEditPaymentModal(true);
                                  }}
                                  className="p-2 text-blue-400 hover:text-blue-300"
                                  title="Editar Pago"
                                >
                                  <Edit size={18} />
                                </button>
                                <button
                                  onClick={() => handleDeletePayment(p.id)}
                                  className="p-2 text-red-400 hover:text-red-300"
                                  title="Eliminar Pago"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </>
                              );
                            })() : null}
                          </div>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment History */}
          {payments.length > 0 && (
            <div className="bg-dark-700 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Historial de Pagos Realizados</h3>
              <div className="table-responsive table-stack">
                <table className="w-full">
                  <thead className="bg-dark-600">
                    <tr>
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">Fecha</th>
                      <th className="text-right py-3 px-4 text-dark-400 font-medium">Monto Pagado</th>
                      <th className="text-right py-3 px-4 text-dark-400 font-medium">Capital</th>
                      <th className="text-right py-3 px-4 text-dark-400 font-medium">Interés</th>
                      <th className="text-right py-3 px-4 text-dark-400 font-medium">Cargo</th>
                      <th className="text-right py-3 px-4 text-dark-400 font-medium">Mora</th>
                      <th className="text-right py-3 px-4 text-dark-400 font-medium">Saldo Después</th>
                      <th className="text-left py-3 px-4 text-dark-400 font-medium">Origen</th>
                      <th className="text-center py-3 px-4 text-dark-400 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-dark-600 hover:bg-dark-600 max-md:border-0">
                        <td data-label="Fecha" className="py-3 px-4">
                          <span className="table-stack-value text-white">{formatDate(payment.paymentDate)}</span>
                        </td>
                        <td data-label="Monto pagado" className="py-3 px-4 text-right font-semibold md:text-right">
                          <span className="table-stack-value font-semibold text-white">{formatCurrency(payment.amount)}</span>
                        </td>
                        <td data-label="Capital" className="py-3 px-4 text-right md:text-right">
                          <span className="table-stack-value text-white">{formatCurrency(payment.principalAmount || 0)}</span>
                        </td>
                        <td data-label="Interés" className="py-3 px-4 text-right md:text-right">
                          <span className="table-stack-value text-white">{formatCurrency(payment.interestAmount || 0)}</span>
                        </td>
                        <td data-label="Cargo" className="py-3 px-4 text-right md:text-right">
                          <span className="table-stack-value text-white">{formatCurrency(payment.chargeAmount || 0)}</span>
                        </td>
                        <td data-label="Mora" className="py-3 px-4 text-right md:text-right">
                          <span className="table-stack-value text-white">{formatCurrency(payment.lateFee || 0)}</span>
                        </td>
                        <td data-label="Saldo después" className="py-3 px-4 text-right md:text-right">
                          <span className="table-stack-value text-white">{formatCurrency(payment.outstandingBalance || 0)}</span>
                        </td>
                        <td data-label="Origen" className="py-3 px-4 text-left md:text-left max-w-[12rem]">
                          <span className="table-stack-value text-dark-300 text-sm break-words">
                            {payment.bankAccountId != null
                              ? bankAccountNameById.get(payment.bankAccountId) ?? `Cuenta #${payment.bankAccountId}`
                              : '—'}
                          </span>
                        </td>
                        <td data-label="Acciones" className="py-3 px-4">
                          <span className="table-stack-value">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setEditingPayment(payment);
                                setPaymentData({
                                  paymentDate: payment.paymentDate.split('T')[0],
                                  amount: payment.amount.toString(),
                                  paymentType: payment.paymentType || 'COMPLETE',
                                  notes: payment.notes || '',
                                  installmentNumber: payment.installmentNumber,
                                  bankAccountId: payment.bankAccountId != null ? String(payment.bankAccountId) : '',
                                });
                                setShowEditPaymentModal(true);
                              }}
                              className="p-2 text-blue-400 hover:text-blue-300"
                              title="Editar"
                            >
                              <Edit size={18} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeletePayment(payment.id)}
                              className="p-2 text-red-400 hover:text-red-300"
                              title="Eliminar"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Payment Modal */}
      {showPaymentModal && selectedInstallment && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)} role="presentation">
          <motion.div
            ref={paymentPanelRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="amortization-register-payment-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="amortization-register-payment-title" className="text-xl font-bold text-white mb-4">
              Registrar Pago
            </h3>
            <form onSubmit={handleRegisterPayment} className="space-y-4">
              <div>
                <label className="label">Fecha de Pago</label>
                <input
                  type="date"
                  value={paymentData.paymentDate}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="label">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="label">Tipo de Pago</label>
                <select
                  value={paymentData.paymentType}
                  onChange={(e) =>
                    setPaymentData({ ...paymentData, paymentType: e.target.value as any })
                  }
                  className="input w-full"
                >
                  <option value="COMPLETE">Completo</option>
                  <option value="PARTIAL">Parcial</option>
                  <option value="ADVANCE">Anticipado</option>
                  <option value="INTEREST">Intereses</option>
                </select>
              </div>
              <div>
                <label className="label">Cuenta origen (opcional)</label>
                <select
                  value={paymentData.bankAccountId}
                  onChange={(e) => setPaymentData({ ...paymentData, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Sin vincular saldo</option>
                  {accountsForAmortPayment.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                {summary && (
                  <p className="text-xs text-dark-500 mt-1">Moneda del préstamo: {summary.currency}</p>
                )}
              </div>
              <div>
                <label className="label">Notas (opcional)</label>
                <textarea
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="input w-full"
                  rows={3}
                />
              </div>
              {selectedInstallment?.installmentNumber === 0 && (
                <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-3">
                  <p className="text-sm text-blue-300">
                    Los pagos a la cuota 0 (Desembolso) se aplican directamente al capital.
                  </p>
                </div>
              )}
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  Registrar Pago
                </button>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="btn-secondary flex-1"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {showEditPaymentModal && editingPayment && (
        <div className="modal-overlay" onClick={() => setShowEditPaymentModal(false)} role="presentation">
          <motion.div
            ref={editPaymentPanelRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="amortization-edit-payment-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="amortization-edit-payment-title" className="text-xl font-bold text-white mb-4">
              Editar Pago
            </h3>
            <form onSubmit={handleEditPayment} className="space-y-4">
              <div>
                <label className="label">Fecha de Pago</label>
                <input
                  type="date"
                  value={paymentData.paymentDate}
                  onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="label">Monto</label>
                <input
                  type="number"
                  step="0.01"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="label">Tipo de Pago</label>
                <select
                  value={paymentData.paymentType}
                  onChange={(e) =>
                    setPaymentData({ ...paymentData, paymentType: e.target.value as any })
                  }
                  className="input w-full"
                >
                  <option value="COMPLETE">Completo</option>
                  <option value="PARTIAL">Parcial</option>
                  <option value="ADVANCE">Anticipado</option>
                  <option value="INTEREST">Intereses</option>
                </select>
              </div>
              <div>
                <label className="label">Cuenta origen (opcional)</label>
                <select
                  value={paymentData.bankAccountId}
                  onChange={(e) => setPaymentData({ ...paymentData, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Sin vincular saldo</option>
                  {accountsForAmortPayment.map((a) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                {summary && (
                  <p className="text-xs text-dark-500 mt-1">Moneda del préstamo: {summary.currency}</p>
                )}
              </div>
              <div>
                <label className="label">Notas (opcional)</label>
                <textarea
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                  className="input w-full"
                  rows={3}
                />
              </div>
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  Actualizar Pago
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditPaymentModal(false);
                    setEditingPayment(null);
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

export default AmortizationTable;
