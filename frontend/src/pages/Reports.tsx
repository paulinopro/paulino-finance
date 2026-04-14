import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import toast from 'react-hot-toast';
import { FileText, Download, Calendar, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { TABLE_PAGE_SIZE } from '../constants/pagination';

const Reports: React.FC = () => {
  const [reportType, setReportType] = useState<'expenses' | 'loans' | 'cards' | 'accounts' | 'comprehensive'>('expenses');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [status, setStatus] = useState<'all' | 'paid' | 'pending'>('all');
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [reportDetailPage, setReportDetailPage] = useState(1);

  const detailRows = useMemo(() => {
    if (!reportData) return [];
    if (reportType === 'expenses') return reportData.expenses || [];
    if (reportType === 'loans') return reportData.loans || [];
    if (reportType === 'cards') return reportData.cards || [];
    if (reportType === 'accounts') return reportData.accounts || [];
    return [];
  }, [reportData, reportType]);

  const detailTotalPages = Math.max(1, Math.ceil(detailRows.length / TABLE_PAGE_SIZE));
  const detailPageClamped = Math.min(reportDetailPage, detailTotalPages);
  const detailSlice = useMemo(() => {
    const start = (detailPageClamped - 1) * TABLE_PAGE_SIZE;
    return detailRows.slice(start, start + TABLE_PAGE_SIZE);
  }, [detailRows, detailPageClamped]);

  useEffect(() => {
    setReportDetailPage(1);
  }, [reportType, reportData]);

  useEffect(() => {
    setReportDetailPage((p) => Math.min(p, detailTotalPages));
  }, [detailTotalPages]);

  const handleGenerateReport = async (exportPDF: boolean = false) => {
    setLoading(true);
    try {
      const params: any = {};
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (status !== 'all' && reportType === 'expenses') {
        params.status = status;
      }
      if (status !== 'all' && reportType === 'loans') {
        params.status = status === 'paid' ? 'paid' : 'active';
      }
      if (exportPDF) {
        params.format = 'pdf';
      }

      let endpoint = '';
      switch (reportType) {
        case 'expenses':
          endpoint = '/reports/expenses';
          break;
        case 'loans':
          endpoint = '/reports/loans';
          break;
        case 'cards':
          endpoint = '/reports/cards';
          break;
        case 'accounts':
          endpoint = '/reports/accounts';
          break;
        case 'comprehensive':
          endpoint = '/reports/comprehensive';
          break;
      }

      if (exportPDF) {
        // For PDF, download directly
        const response = await api.get(endpoint, {
          params,
          responseType: 'blob',
        });

        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `reporte-${reportType}-${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast.success('Reporte PDF descargado exitosamente');
      } else {
        // For JSON, show data
        const response = await api.get(endpoint, { params });
        setReportData(response.data);
        toast.success('Reporte generado exitosamente');
      }
    } catch (error: any) {
      toast.error('Error al generar reporte');
      console.error('Report error:', error);
    } finally {
      setLoading(false);
    }
  };

  const getReportTitle = () => {
    switch (reportType) {
      case 'expenses':
        return 'Reporte de Gastos';
      case 'loans':
        return 'Reporte de Préstamos';
      case 'cards':
        return 'Reporte de Tarjetas';
      case 'accounts':
        return 'Reporte de Cuentas';
      case 'comprehensive':
        return 'Reporte Completo';
      default:
        return 'Reporte';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title mb-2">Reportes</h1>
        <p className="text-dark-400 text-sm sm:text-base">Genera y exporta reportes financieros</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card">
        <div className="space-y-6">
          {/* Report Type Selection */}
          <div>
            <label className="label">Tipo de Reporte</label>
            <select
              value={reportType}
              onChange={(e) => {
                setReportType(e.target.value as any);
                setReportData(null);
              }}
              className="input w-full"
            >
              <option value="expenses">Gastos (Pagados y Pendientes)</option>
              <option value="loans">Préstamos (Pagados y Pendientes)</option>
              <option value="cards">Tarjetas de Crédito</option>
              <option value="accounts">Cuentas Bancarias</option>
              <option value="comprehensive">Reporte Completo</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Fecha Desde</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="input w-full"
              />
            </div>
            <div>
              <label className="label">Fecha Hasta</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          {/* Status Filter (only for expenses and loans) */}
          {(reportType === 'expenses' || reportType === 'loans') && (
            <div>
              <label className="label">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="input w-full"
              >
                <option value="all">Todos</option>
                <option value="paid">{reportType === 'expenses' ? 'Pagados' : 'Pagados'}</option>
                <option value="pending">{reportType === 'expenses' ? 'Pendientes' : 'Activos'}</option>
              </select>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => handleGenerateReport(false)}
              disabled={loading}
              className="btn-primary flex-1 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></span>
                  <span>Generando...</span>
                </>
              ) : (
                <>
                  <Filter size={20} />
                  <span>Generar Reporte</span>
                </>
              )}
            </button>
            <button
              onClick={() => handleGenerateReport(true)}
              disabled={loading}
              className="btn-secondary flex-1 flex items-center justify-center space-x-2"
            >
              <Download size={20} />
              <span>Exportar PDF</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Report Results */}
      {reportData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            <h2 className="text-xl sm:text-2xl font-bold text-white break-words">{getReportTitle()}</h2>
            <button
              type="button"
              onClick={() => handleGenerateReport(true)}
              className="btn-secondary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto"
            >
              <Download size={18} />
              <span>Exportar PDF</span>
            </button>
          </div>

          {/* Summary */}
          {reportData.summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {Object.entries(reportData.summary).map(([key, value]: [string, any]) => (
                <div key={key} className="bg-dark-700 rounded-lg p-4">
                  <p className="text-dark-400 text-sm mb-1">
                    {key === 'total' && 'Total'}
                    {key === 'paid' && 'Pagados'}
                    {key === 'pending' && 'Pendientes'}
                    {key === 'active' && 'Activos'}
                    {key === 'totalPaid' && 'Total Pagado'}
                    {key === 'totalPending' && 'Total Pendiente'}
                    {key === 'totalActive' && 'Total Activo'}
                    {key === 'totalDebt' && 'Deuda Total'}
                    {key === 'totalLimit' && 'Límite Total'}
                    {key === 'totalBalance' && 'Balance Total'}
                    {key === 'totalBalanceDop' && 'Balance Total DOP'}
                    {key === 'totalBalanceUsd' && 'Balance Total USD'}
                    {key === 'savings' && 'Cuentas de Ahorro'}
                    {key === 'checking' && 'Cuentas Corrientes'}
                    {key === 'totalCardDebt' && 'Deuda en Tarjetas'}
                    {key === 'totalLoanDebt' && 'Deuda en Préstamos'}
                    {key === 'netWorth' && 'Patrimonio Neto'}
                  </p>
                  <p className="text-white font-bold text-lg">
                    {typeof value === 'number'
                      ? value.toLocaleString('es-DO', {
                          style: 'currency',
                          currency: 'DOP',
                        })
                      : value}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Detailed Data */}
          <div className="table-responsive table-stack">
            {reportType === 'expenses' && reportData.expenses && (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Descripción</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Monto</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Categoría</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detailSlice.map((expense: any) => (
                    <tr key={expense.id} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                      <td data-label="Descripción" data-stack="hero" className="py-3 px-4 text-white">
                        {expense.description}
                      </td>
                      <td data-label="Monto" className="py-3 px-4">
                        <span className="table-stack-value">
                          {expense.amount.toLocaleString('es-DO', {
                            style: 'currency',
                            currency: expense.currency,
                          })}
                        </span>
                      </td>
                      <td data-label="Categoría" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{expense.category || 'N/A'}</span>
                      </td>
                      <td data-label="Estado" className="py-3 px-4">
                        <span className="table-stack-value">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              expense.isPaid
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                            }`}
                          >
                            {expense.isPaid ? 'Pagado' : 'Pendiente'}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'loans' && reportData.loans && (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Préstamo</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Banco</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Monto Total</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Progreso</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detailSlice.map((loan: any) => (
                    <tr key={loan.id} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                      <td data-label="Préstamo" className="py-3 px-4">
                        <span className="table-stack-value">{loan.loanName}</span>
                      </td>
                      <td data-label="Banco" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{loan.bankName || 'N/A'}</span>
                      </td>
                      <td data-label="Monto total" className="py-3 px-4">
                        <span className="table-stack-value">
                          {loan.totalAmount.toLocaleString('es-DO', {
                            style: 'currency',
                            currency: loan.currency,
                          })}
                        </span>
                      </td>
                      <td data-label="Progreso" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{loan.progress?.toFixed(1) || 0}%</span>
                      </td>
                      <td data-label="Estado" className="py-3 px-4">
                        <span className="table-stack-value">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              loan.status === 'PAID'
                                ? 'bg-green-500/20 text-green-400'
                                : loan.status === 'ACTIVE'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {loan.status === 'PAID' ? 'Pagado' : loan.status === 'ACTIVE' ? 'Activo' : 'En Mora'}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'cards' && reportData.cards && (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Tarjeta</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Banco</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Límite</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Deuda</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Disponible</th>
                  </tr>
                </thead>
                <tbody>
                  {detailSlice.map((card: any) => (
                    <tr key={card.id} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                      <td data-label="Tarjeta" className="py-3 px-4">
                        <span className="table-stack-value">{card.cardName}</span>
                      </td>
                      <td data-label="Banco" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{card.bankName}</span>
                      </td>
                      <td data-label="Límite" className="py-3 px-4">
                        <span className="table-stack-value">
                          {card.currencyType === 'DOP' && card.creditLimitDop.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                          {card.currencyType === 'USD' && card.creditLimitUsd.toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
                          {card.currencyType === 'DUAL' && `${card.creditLimitDop.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })} / ${card.creditLimitUsd.toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}`}
                        </span>
                      </td>
                      <td data-label="Deuda" className="py-3 px-4">
                        <span className="table-stack-value text-red-400">
                          {card.currencyType === 'DOP' && card.currentDebtDop.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                          {card.currencyType === 'USD' && card.currentDebtUsd.toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
                          {card.currencyType === 'DUAL' && `${card.currentDebtDop.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })} / ${card.currentDebtUsd.toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}`}
                        </span>
                      </td>
                      <td data-label="Disponible" className="py-3 px-4">
                        <span className="table-stack-value text-green-400">
                          {card.currencyType === 'DOP' && (card.creditLimitDop - card.currentDebtDop).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                          {card.currencyType === 'USD' && (card.creditLimitUsd - card.currentDebtUsd).toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
                          {card.currencyType === 'DUAL' && `${(card.creditLimitDop - card.currentDebtDop).toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })} / ${(card.creditLimitUsd - card.currentDebtUsd).toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'accounts' && reportData.accounts && (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-dark-700">
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Banco</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Tipo</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Número</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Balance DOP</th>
                    <th className="text-left py-3 px-4 text-dark-400 font-medium">Balance USD</th>
                  </tr>
                </thead>
                <tbody>
                  {detailSlice.map((account: any) => (
                    <tr key={account.id} className="border-b border-dark-700 hover:bg-dark-700 max-md:border-0">
                      <td data-label="Banco" className="py-3 px-4">
                        <span className="table-stack-value">{account.bankName}</span>
                      </td>
                      <td data-label="Tipo" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">
                          {account.accountType === 'SAVINGS' ? 'Ahorro' : 'Corriente'}
                        </span>
                      </td>
                      <td data-label="Número" className="py-3 px-4">
                        <span className="table-stack-value text-dark-300">{account.accountNumber || 'N/A'}</span>
                      </td>
                      <td data-label="Balance DOP" className="py-3 px-4">
                        <span className="table-stack-value">
                          {(account.currencyType === 'DOP' || account.currencyType === 'DUAL') &&
                            account.balanceDop.toLocaleString('es-DO', { style: 'currency', currency: 'DOP' })}
                          {account.currencyType === 'USD' && '-'}
                        </span>
                      </td>
                      <td data-label="Balance USD" className="py-3 px-4">
                        <span className="table-stack-value">
                          {(account.currencyType === 'USD' || account.currencyType === 'DUAL') &&
                            account.balanceUsd.toLocaleString('es-DO', { style: 'currency', currency: 'USD' })}
                          {account.currencyType === 'DOP' && '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {reportType === 'comprehensive' && reportData.data && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Resumen General</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-dark-700 rounded-lg p-4">
                      <p className="text-dark-400 text-sm mb-1">Balance Total</p>
                      <p className="text-white font-bold text-lg">
                        {reportData.summary?.totalBalance?.toLocaleString('es-DO', {
                          style: 'currency',
                          currency: 'DOP',
                        })}
                      </p>
                    </div>
                    <div className="bg-dark-700 rounded-lg p-4">
                      <p className="text-dark-400 text-sm mb-1">Deuda en Tarjetas</p>
                      <p className="text-red-400 font-bold text-lg">
                        {reportData.summary?.totalCardDebt?.toLocaleString('es-DO', {
                          style: 'currency',
                          currency: 'DOP',
                        })}
                      </p>
                    </div>
                    <div className="bg-dark-700 rounded-lg p-4">
                      <p className="text-dark-400 text-sm mb-1">Deuda en Préstamos</p>
                      <p className="text-red-400 font-bold text-lg">
                        {reportData.summary?.totalLoanDebt?.toLocaleString('es-DO', {
                          style: 'currency',
                          currency: 'DOP',
                        })}
                      </p>
                    </div>
                    <div className="bg-dark-700 rounded-lg p-4">
                      <p className="text-dark-400 text-sm mb-1">Patrimonio Neto</p>
                      <p className="text-green-400 font-bold text-lg">
                        {(
                          (reportData.summary?.totalBalance || 0) -
                          (reportData.summary?.totalCardDebt || 0) -
                          (reportData.summary?.totalLoanDebt || 0)
                        ).toLocaleString('es-DO', {
                          style: 'currency',
                          currency: 'DOP',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {reportType !== 'comprehensive' && detailTotalPages > 1 && (
              <div className="border-t border-dark-700 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-dark-400">
                    Mostrando {(detailPageClamped - 1) * TABLE_PAGE_SIZE + 1} –{' '}
                    {Math.min(detailPageClamped * TABLE_PAGE_SIZE, detailRows.length)} de {detailRows.length} filas
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReportDetailPage((p) => Math.max(1, p - 1))}
                      disabled={detailPageClamped <= 1}
                      className="px-3 py-2 bg-dark-700 text-white rounded-lg hover:bg-dark-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                      <ChevronLeft size={18} />
                      Anterior
                    </button>
                    <span className="text-sm text-dark-400 px-2 tabular-nums">
                      Página {detailPageClamped} de {detailTotalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReportDetailPage((p) => Math.min(detailTotalPages, p + 1))}
                      disabled={detailPageClamped >= detailTotalPages}
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
        </motion.div>
      )}
    </div>
  );
};

export default Reports;
