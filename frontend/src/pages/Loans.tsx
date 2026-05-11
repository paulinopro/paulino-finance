import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { BankAccount, Loan, LoanPayment } from '../types';
import { Plus, Edit, Trash2, Receipt, DollarSign, Search, X, Table, List } from 'lucide-react';
import toast from 'react-hot-toast';
import AmortizationTable from '../components/AmortizationTable';
import { TABLE_PAGE_SIZE_LOANS } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import {
  LIST_CARD_SHELL,
  listCardAccentFromPercent,
  listCardAccentLoan,
  listCardBtnEdit,
  listCardBtnDanger,
  listCardProgressColor,
} from '../utils/listCard';
import { todayYmdLocal } from '../utils/dateUtils';
import { bankAccountSupportsLedgerCurrency, formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';
import { useAuth } from '../context/AuthContext';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';
import { usePersistedIdOrder } from '../hooks/usePersistedIdOrder';
import { useListOrderPageDnd } from '../hooks/useListOrderPageDnd';
import ListOrderDragHandle from '../components/ListOrderDragHandle';
import ListOrderDragGhostPortal from '../components/ListOrderDragGhostPortal';
import SummaryBarToggleButton from '../components/SummaryBarToggleButton';
import { usePersistedSummaryBarVisible } from '../hooks/usePersistedSummaryBarVisible';

function loanListAccent(loan: Loan): string {
  if (loan.status === 'PAID') return listCardAccentLoan('PAID');
  if (loan.status === 'DEFAULTED') return listCardAccentLoan('DEFAULTED');
  return listCardAccentFromPercent(Math.min(100, loan.progress || 0));
}

const Loans: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    formatCurrency: fc,
    formatDatePresetLocalized,
    currencySelectLabel,
    defaultTransactionCurrency,
    transactionCurrencyOptions,
    primaryCurrency,
    secondaryCurrency,
  } = useIntlFormatting();
  const { pageSize: loanListPageSize, setPageSize: setLoanListPageSize, pageSizeOptions: loanListPageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:loans', TABLE_PAGE_SIZE_LOANS);
  const {
    pageSize: loanPaymentHistoryPageSize,
    setPageSize: setLoanPaymentHistoryPageSize,
    pageSizeOptions: loanPaymentHistoryPageSizeOptions,
  } = usePersistedTablePageSize('pf:pageSize:loanPayments', TABLE_PAGE_SIZE_LOANS);
  const { visible: summaryBarVisible, toggle: toggleSummaryBar } = usePersistedSummaryBarVisible(
    user?.id,
    'loans'
  );
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
    paymentDate: todayYmdLocal(),
    amount: '',
    notes: '',
    bankAccountId: '',
  });
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const fetchLoans = useCallback(async () => {
    try {
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      if (bankFilter) params.bank = bankFilter;

      const response = await api.get('/loans', { params });
      setLoans(response.data.loans);
      setSummary(response.data.summary || { totalRemaining: 0, totalInstallment: 0, totalLoans: 0 });
    } catch (error: any) {
      toast.error(t('toast.loans.loadError'));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, bankFilter, t]);

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

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

  const { ordered: orderedLoans, setOrderByIds: setLoanOrderByIds } = usePersistedIdOrder<Loan>({
    module: 'loans',
    userId: user?.id,
    sourceItems: loans,
  });
  const commitLoanOrder = useCallback(
    (next: Loan[]) => {
      setLoanOrderByIds(next.map((l) => l.id));
    },
    [setLoanOrderByIds]
  );

  const [loanListPage, setLoanListPage] = useState(1);
  useEffect(() => {
    setLoanListPage(1);
  }, [searchTerm, bankFilter, loanListPageSize]);
  const loanTotalPages = Math.max(1, Math.ceil(orderedLoans.length / loanListPageSize));
  const loanPageSafe = Math.min(loanListPage, loanTotalPages);
  useEffect(() => {
    setLoanListPage((p) => Math.min(p, loanTotalPages));
  }, [loanTotalPages]);
  const pagedLoans = useMemo(() => {
    const start = (loanPageSafe - 1) * loanListPageSize;
    return orderedLoans.slice(start, start + loanListPageSize);
  }, [orderedLoans, loanPageSafe, loanListPageSize]);
  const loanListStart = (loanPageSafe - 1) * loanListPageSize;

  useEffect(() => {
    setPaymentHistoryPage(1);
  }, [loanPaymentHistoryPageSize]);
  const listDnd = useListOrderPageDnd(pagedLoans, loanListStart, orderedLoans, commitLoanOrder, {
    ghostLabel: (l) => l.loanName,
  });

  const accountsForLoanPayment = useMemo(() => {
    if (!selectedLoan) return [];
    const c = (selectedLoan.currency && String(selectedLoan.currency).trim()) || primaryCurrency;
    return bankAccounts.filter((a: BankAccount) =>
      bankAccountSupportsLedgerCurrency(a, c, primaryCurrency, secondaryCurrency)
    );
  }, [bankAccounts, selectedLoan, primaryCurrency, secondaryCurrency]);

  const bankAccountNameById = useMemo(() => {
    const m = new Map<number, string>();
    bankAccounts.forEach((a) => m.set(a.id, formatBankAccountOptionLabel(a)));
    return m;
  }, [bankAccounts]);

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
        toast.success(t('toast.loans.updated'));
      } else {
        await api.post('/loans', data);
        toast.success(t('toast.loans.created'));
      }

      setShowModal(false);
      resetForm();
      fetchLoans();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.loans.saveError'));
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan) return;

    try {
      const payload: Record<string, unknown> = {
        paymentDate: paymentData.paymentDate,
        amount: parseFloat(paymentData.amount),
        notes: paymentData.notes,
      };
      if (paymentData.bankAccountId) {
        payload.bankAccountId = parseInt(paymentData.bankAccountId, 10);
      } else {
        payload.bankAccountId = null;
      }
      await api.post(`/loans/${selectedLoan.id}/payment`, payload);
      toast.success(t('toast.loans.paymentRegistered'));
      setShowPaymentModal(false);
      setPaymentData({ paymentDate: todayYmdLocal(), amount: '', notes: '', bankAccountId: '' });
      fetchLoans();
      if (selectedLoan) {
        const loanRes = await api.get(`/loans/${selectedLoan.id}`);
        setSelectedLoan(loanRes.data.loan);
      }
    } catch (error: any) {
      toast.error(t('toast.loans.paymentRegisterError'));
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!window.confirm(t('confirm.deleteLoanPayment'))) return;
    try {
      if (!selectedLoan) return;
      await api.delete(`/loans/${selectedLoan.id}/payments/${paymentId}`);
      toast.success(t('toast.loans.paymentDeleted'));
      if (selectedLoan) {
        const loanRes = await api.get(`/loans/${selectedLoan.id}`);
        setSelectedLoan(loanRes.data.loan);
      }
      fetchLoans();
    } catch (error: any) {
      toast.error(t('toast.loans.paymentDeleteError'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('confirm.deleteLoan'))) return;
    try {
      await api.delete(`/loans/${id}`);
      toast.success(t('toast.loans.deleted'));
      fetchLoans();
    } catch (error: any) {
      toast.error(t('toast.loans.deleteError'));
    }
  };

  const handleViewDetails = async (loan: Loan) => {
    try {
      const response = await api.get(`/loans/${loan.id}`);
      setSelectedLoan(response.data.loan);
      setShowLoanDetails(true);
    } catch (error: any) {
      toast.error(t('toast.loans.detailLoadError'));
    }
  };

  const handleViewPaymentHistory = async (loan: Loan) => {
    try {
      const response = await api.get(`/loans/${loan.id}`);
      setSelectedLoan(response.data.loan);
      setPaymentHistoryPage(1); // Reset to first page
      setShowPaymentHistory(true);
    } catch (error: any) {
      toast.error(t('toast.loans.paymentsHistoryLoadError'));
    }
  };

  const parseLoanDate = (dateString: string | null | undefined): Date | null => {
    if (!dateString) return null;
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
      if (isNaN(date.getTime())) return null;
      return date;
    } catch {
      return null;
    }
  };

  const formatDate = (dateString: string | null | undefined): string => {
    const date = parseLoanDate(dateString);
    return date ? formatDatePresetLocalized(date, 'short') : '';
  };

  const formatDateFull = (dateString: string | null | undefined): string => {
    const date = parseLoanDate(dateString);
    return date ? formatDatePresetLocalized(date, 'long') : '';
  };

  const formatDateShort = (dateString: string | null | undefined): string => {
    const date = parseLoanDate(dateString);
    return date ? formatDatePresetLocalized(date, 'weekdayMedium') : '';
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
      currency: defaultTransactionCurrency,
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
      toast.error(t('toast.loans.editLoadError'));
    }
  };

  const uniqueBanks = Array.from(new Set(orderedLoans.filter((l) => l.bankName).map((l) => l.bankName)));

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return t('pages.loans.status.active');
      case 'PAID':
        return t('pages.loans.status.paid');
      case 'DEFAULTED':
        return t('pages.loans.status.defaulted');
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
      <PageHeader
        className="mb-4"
        title={t('pages.loans.title')}
        subtitle={t('pages.loans.subtitle')}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
            <SummaryBarToggleButton visible={summaryBarVisible} onToggle={toggleSummaryBar} />
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto sm:flex-initial"
            >
              <Plus size={20} />
              <span>{t('pages.loans.addLoan')}</span>
            </button>
          </div>
        }
      />

      {/* Summary */}
      {summaryBarVisible && summary && (
        <div className="card-view">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.loans.totalRemaining')}</p>
              <p className="text-2xl font-bold text-white">{fc(summary.totalRemaining, primaryCurrency)}</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.loans.totalInstallmentsSummary')}</p>
              <p className="text-2xl font-bold text-white">{fc(summary.totalInstallment, primaryCurrency)}</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.loans.totalLoans')}</p>
              <p className="text-2xl font-bold text-white">{summary.totalLoans}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-view">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
            <input
              type="text"
              placeholder={t('pages.loans.searchPlaceholder')}
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
              <option value="">{t('pages.loans.allBanks')}</option>
              {uniqueBanks.map((bank) => (
                <option key={bank} value={bank}>{bank}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loans.length === 0 ? (
        <div className="card-view text-center py-12 sm:py-16">
          <Receipt className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">{t('pages.loans.emptyState')}</p>
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowModal(true);
            }}
            className="btn-primary"
          >
            {t('pages.loans.addFirstLoan')}
          </button>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 xl:gap-6">
          {pagedLoans.map((loan) => {
            const prog = Math.min(100, loan.progress || 0);
            return (
              <motion.article
                key={loan.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                {...listDnd.droppableAttr(loan.id)}
                className={[
                  LIST_CARD_SHELL,
                  loanListAccent(loan),
                  listDnd.dragId === loan.id ? 'opacity-[0.22]' : '',
                  listDnd.dragId !== null &&
                  listDnd.pointerOverItemId === loan.id &&
                  listDnd.dragId !== loan.id
                    ? 'ring-2 ring-primary-400/75 z-[1]'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between xl:gap-3">
                  <div className="order-2 min-w-[min(100%,12rem)] flex-1 space-y-2 xl:order-1 xl:pr-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                        <Receipt className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                        {t('pages.loans.loanBadge')}
                      </span>
                      <span className={`text-xs font-medium sm:text-sm ${getStatusColor(loan.status)}`}>{getStatusText(loan.status)}</span>
                    </div>
                    <h3 className="break-words text-lg font-bold leading-snug text-white sm:text-xl">{loan.loanName}</h3>
                    {loan.bankName && <p className="text-sm text-dark-400">{loan.bankName}</p>}
                  </div>
                  <div className="order-1 flex w-full shrink-0 flex-wrap items-center justify-end gap-0.5 xl:order-2 xl:w-auto">
                    <ListOrderDragHandle
                      itemId={loan.id}
                      gripBinder={listDnd.gripBinder}
                      disabled={pagedLoans.length < 2}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLoan(loan);
                        setShowAmortizationTable(true);
                      }}
                      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-violet-400 transition-colors hover:bg-violet-500/15"
                      title={t('pages.loans.amortizationTitle')}
                      aria-label={t('pages.loans.amortizationAria')}
                    >
                      <Table className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewDetails(loan)}
                      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-sky-400 transition-colors hover:bg-sky-500/15"
                      title={t('pages.loans.viewDetails')}
                      aria-label={t('pages.loans.viewDetails')}
                    >
                      <Receipt className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleViewPaymentHistory(loan)}
                      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-amber-400 transition-colors hover:bg-amber-500/15"
                      title={t('pages.loans.paymentsHistoryTitle')}
                      aria-label={t('pages.loans.paymentsHistoryAria')}
                    >
                      <List className="h-[18px] w-[18px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLoan(loan);
                        setPaymentData({
                          paymentDate: todayYmdLocal(),
                          amount: loan.installmentAmount.toString(),
                          notes: '',
                          bankAccountId: '',
                        });
                        setShowPaymentModal(true);
                      }}
                      className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl text-emerald-400 transition-colors hover:bg-emerald-500/15"
                      title={t('pages.loans.registerPayment')}
                      aria-label={t('pages.loans.registerPayment')}
                    >
                      <DollarSign className="h-[18px] w-[18px]" />
                    </button>
                    <button type="button" onClick={() => handleEdit(loan)} className={listCardBtnEdit} title={t('pages.loans.editTitle')} aria-label={t('pages.loans.editAria')}>
                      <Edit className="h-5 w-5" />
                    </button>
                    <button type="button" onClick={() => handleDelete(loan.id)} className={listCardBtnDanger} title={t('pages.loans.deleteTitle')} aria-label={t('pages.loans.deleteAria')}>
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-4 border-t border-dark-700/80 pt-4">
                  <div className="metrics-cq">
                    <div className="metrics-row-2">
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.loans.totalAmount')}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                        {fc(loan.totalAmount, loan.currency)}
                      </p>
                    </div>
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.loans.rate')}</p>
                      <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">
                        {loan.interestRate}% <span className="text-xs font-normal text-dark-400">{loan.interestRateType === 'ANNUAL' ? t('pages.loans.annual') : t('pages.loans.monthly')}</span>
                      </p>
                    </div>
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.loans.installments')}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                        {loan.paidInstallments}/{loan.totalInstallments}
                      </p>
                    </div>
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.loans.installment')}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                        {fc(loan.installmentAmount, loan.currency)}
                      </p>
                    </div>
                    {loan.remainingBalance !== undefined && (
                      <div className="metrics-cell-span-2 rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.loans.remaining')}</p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                          {fc(loan.remainingBalance, loan.currency)}
                        </p>
                      </div>
                    )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex justify-between gap-2 text-xs text-dark-400">
                      <span>{t('pages.loans.amortizationProgress')}</span>
                      <span className="tabular-nums text-dark-300">{prog.toFixed(0)}%</span>
                    </div>
                    <div
                      className="h-2.5 w-full overflow-hidden rounded-full bg-dark-700/90 ring-1 ring-dark-600/80 sm:h-3"
                      role="progressbar"
                      aria-valuenow={Math.round(prog)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${prog}%`,
                          backgroundColor: listCardProgressColor(prog),
                          boxShadow: `0 0 12px ${listCardProgressColor(prog)}55`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
        <ListOrderDragGhostPortal ghost={listDnd.dragGhost} />
        <TablePagination
          className="mt-4 sm:mt-5"
          currentPage={loanPageSafe}
          totalPages={loanTotalPages}
          totalItems={orderedLoans.length}
          itemsPerPage={loanListPageSize}
          onPageChange={setLoanListPage}
          itemLabel={t('pages.loans.itemsLabel')}
          variant="card"
          pageSizeOptions={loanListPageSizeOptions}
          onPageSizeChange={setLoanListPageSize}
        />
        </>
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
              {editingLoan ? t('pages.loans.editLoan') : t('pages.loans.newLoan')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div><label className="label">{t('pages.loans.loanName')}</label><input type="text" value={formData.loanName} onChange={(e) => setFormData({ ...formData, loanName: e.target.value })} className="input w-full" required /></div>
              <div><label className="label">{t('pages.loans.bankOptional')}</label><input type="text" value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} className="input w-full" placeholder={t('pages.loans.bankPlaceholder')} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">{t('pages.loans.totalAmount')}</label><input type="number" step="0.01" value={formData.totalAmount} onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">{t('pages.loans.interestRate')}</label><input type="number" step="0.01" value={formData.interestRate} onChange={(e) => setFormData({ ...formData, interestRate: e.target.value })} className="input w-full" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">{t('pages.loans.interestRateType')}</label><select value={formData.interestRateType} onChange={(e) => setFormData({ ...formData, interestRateType: e.target.value as any })} className="input w-full"><option value="ANNUAL">{t('pages.loans.annual')}</option><option value="MONTHLY">{t('pages.loans.monthly')}</option></select></div>
                <div><label className="label">{t('pages.loans.totalInstallments')}</label><input type="number" value={formData.totalInstallments} onChange={(e) => setFormData({ ...formData, totalInstallments: e.target.value })} className="input w-full" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">{t('pages.loans.startDate')}</label><input type="date" value={formData.startDate} onChange={(e) => setFormData({ ...formData, startDate: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">{t('pages.loans.endDateOptional')}</label><input type="date" value={formData.endDate} onChange={(e) => setFormData({ ...formData, endDate: e.target.value })} className="input w-full" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">{t('pages.loans.installmentAmount')}</label><input type="number" step="0.01" value={formData.installmentAmount} onChange={(e) => setFormData({ ...formData, installmentAmount: e.target.value })} className="input w-full" required /></div>
                <div><label className="label">{t('pages.loans.fixedCharge')}</label><input type="number" step="0.01" value={formData.fixedCharge} onChange={(e) => setFormData({ ...formData, fixedCharge: e.target.value })} className="input w-full" placeholder="0.00" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">{t('pages.loans.paymentDay')}</label><input type="number" min="1" max="31" value={formData.paymentDay} onChange={(e) => setFormData({ ...formData, paymentDay: e.target.value })} className="input w-full" required /></div>
                <div>
                  <label className="label">{t('pages.loans.currency')}</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="input w-full"
                  >
                    {transactionCurrencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {currencySelectLabel(code)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('pages.loans.interestBase')}</label>
                  <select 
                    value={formData.interestCalculationBase} 
                    onChange={(e) => setFormData({ ...formData, interestCalculationBase: e.target.value as any })} 
                    className="input w-full"
                  >
                  <option value="ACTUAL_360">{t('pages.loans.interestBaseActual360')}</option>
                  <option value="ACTUAL_365">{t('pages.loans.interestBaseActual365')}</option>
                    <option value="30_360">30 / 360</option>
                    <option value="30_365">30 / 365</option>
                  </select>
                </div>
                <div>
                  <label className="label">{t('pages.loans.statusLabel')}</label>
                  <select 
                    value={formData.status} 
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })} 
                    className="input w-full"
                  >
                    <option value="ACTIVE">{t('pages.loans.status.active')}</option>
                    <option value="PAID">{t('pages.loans.status.paid')}</option>
                    <option value="DEFAULTED">{t('pages.loans.status.defaulted')}</option>
                  </select>
                </div>
              </div>
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">{editingLoan ? t('pages.loans.update') : t('pages.loans.create')}</button>
                <button type="button" onClick={() => { setShowModal(false); resetForm(); }} className="btn-secondary flex-1">{t('common.actions.cancel')}</button>
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
              {t('pages.loans.registerPayment')}
            </h2>
            <form onSubmit={handlePayment} className="space-y-4">
              <div><label className="label">{t('pages.loans.paymentDate')}</label><input type="date" value={paymentData.paymentDate} onChange={(e) => setPaymentData({ ...paymentData, paymentDate: e.target.value })} className="input w-full" required /></div>
              <div><label className="label">{t('pages.loans.amount')}</label><input type="number" step="0.01" value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} className="input w-full" required /></div>
              <div>
                <label className="label">{t('pages.loans.sourceAccountOptional')}</label>
                <select
                  value={paymentData.bankAccountId}
                  onChange={(e) => setPaymentData({ ...paymentData, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">{t('pages.loans.unlinkedBalance')}</option>
                  {accountsForLoanPayment.map((a: BankAccount) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-dark-500 mt-1">{t('pages.loans.loanCurrency', { currency: selectedLoan.currency })}</p>
              </div>
              <div><label className="label">{t('pages.loans.notesOptional')}</label><textarea value={paymentData.notes} onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })} className="input w-full" rows={3} /></div>
              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">{t('pages.loans.register')}</button>
                <button type="button" onClick={() => setShowPaymentModal(false)} className="btn-secondary flex-1">{t('common.actions.cancel')}</button>
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
                {t('pages.loans.loanDetails')}
              </h2>
              <button onClick={() => setShowLoanDetails(false)} className="text-dark-400 hover:text-white">
                <X size={24} />
              </button>
            </div>
            <div className="space-y-6">
              {/* Información Principal */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">{t('pages.loans.loanInformation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-dark-400 text-sm">{t('pages.loans.name')}:</span>
                    <p className="text-white font-medium">{selectedLoan.loanName}</p>
                  </div>
                  {selectedLoan.bankName && (
                    <div>
                      <span className="text-dark-400 text-sm">{t('pages.loans.bank')}:</span>
                      <p className="text-white font-medium">{selectedLoan.bankName}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-dark-400 text-sm">{t('pages.loans.totalAmount')}:</span>
                    <p className="text-white font-medium">{fc(selectedLoan.totalAmount, selectedLoan.currency)}</p>
                  </div>
                  {selectedLoan.remainingBalance !== undefined && (
                    <div>
                      <span className="text-dark-400 text-sm">{t('pages.loans.remainingAmount')}:</span>
                      <p className="text-red-400 font-medium">{fc(selectedLoan.remainingBalance, selectedLoan.currency)}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-dark-400 text-sm">{t('pages.loans.interestRate')}:</span>
                    <p className="text-white font-medium">{selectedLoan.interestRate}% {selectedLoan.interestRateType === 'ANNUAL' ? t('pages.loans.annual') : t('pages.loans.monthly')}</p>
                  </div>
                  <div>
                    <span className="text-dark-400 text-sm">{t('pages.loans.installments')}:</span>
                    <p className="text-white font-medium">{selectedLoan.paidInstallments} / {selectedLoan.totalInstallments}</p>
                  </div>
                  <div>
                    <span className="text-dark-400 text-sm">{t('pages.loans.installmentAmount')}:</span>
                    <p className="text-white font-medium">{fc(selectedLoan.installmentAmount, selectedLoan.currency)}</p>
                  </div>
                  {selectedLoan.nextPaymentDate && (
                    <div>
                      <span className="text-dark-400 text-sm">{t('pages.loans.nextPayment')}:</span>
                      <p className="text-primary-400 font-medium">{formatDateFull(selectedLoan.nextPaymentDate)}</p>
                    </div>
                  )}
                  {selectedLoan.startDate && (
                    <div>
                      <span className="text-dark-400 text-sm">{t('pages.loans.startDate')}:</span>
                      <p className="text-white font-medium">{formatDate(selectedLoan.startDate)}</p>
                    </div>
                  )}
                  {selectedLoan.endDate && (
                    <div>
                      <span className="text-dark-400 text-sm">{t('pages.loans.endDate')}:</span>
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
                  {t('pages.loans.paymentsHistory')}
                </h2>
                <p className="text-xs text-dark-400 mt-1">{selectedLoan.loanName}</p>
              </div>
              <button onClick={() => { setShowPaymentHistory(false); setSelectedLoan(null); setPaymentHistoryPage(1); }} className="text-dark-400 hover:text-white">
                <X size={20} />
              </button>
            </div>
            {(() => {
              const payments = selectedLoan.payments || [];
              const itemsPerPage = loanPaymentHistoryPageSize;
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
                                  <span className="text-sm font-semibold text-white">{t('pages.loans.installmentNumber', { number: payment.installmentNumber || t('pages.loans.notAvailableShort') })}</span>
                                  {payment.paymentDate && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-primary-400/10 text-primary-400">
                                      {formatDateShort(payment.paymentDate) || t('pages.loans.dateUnavailable')}
                                    </span>
                                  )}
                                  {payment.paymentType && (
                                    <span className="text-xs px-2 py-0.5 rounded bg-dark-600 text-dark-300">
                                      {payment.paymentType === 'COMPLETE'
                                        ? t('pages.loans.paymentType.complete')
                                        : payment.paymentType === 'PARTIAL'
                                          ? t('pages.loans.paymentType.partial')
                                          : t('pages.loans.paymentType.advance')}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-dark-500 mb-2">
                                  {t('pages.loans.source')}:{' '}
                                  <span className="text-dark-300">
                                    {payment.bankAccountId != null
                                      ? bankAccountNameById.get(payment.bankAccountId) ?? t('pages.loans.accountNumber', { id: payment.bankAccountId })
                                      : t('pages.loans.noLinkedAccount')}
                                  </span>
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
                                  <div>
                                    <span className="text-dark-400 block mb-0.5">{t('pages.loans.total')}:</span>
                                    <p className="text-white font-medium">{fc(payment.amount, selectedLoan.currency)}</p>
                                  </div>
                                  {payment.principalAmount !== undefined && payment.principalAmount > 0 && (
                                    <div>
                                      <span className="text-dark-400 block mb-0.5">{t('pages.loans.principal')}:</span>
                                      <p className="text-green-400 font-medium">{fc(payment.principalAmount, selectedLoan.currency)}</p>
                                    </div>
                                  )}
                                  {payment.interestAmount !== undefined && payment.interestAmount > 0 && (
                                    <div>
                                      <span className="text-dark-400 block mb-0.5">{t('pages.loans.interest')}:</span>
                                      <p className="text-yellow-400 font-medium">{fc(payment.interestAmount, selectedLoan.currency)}</p>
                                    </div>
                                  )}
                                  {payment.chargeAmount !== undefined && payment.chargeAmount > 0 && (
                                    <div>
                                      <span className="text-dark-400 block mb-0.5">{t('pages.loans.charge')}:</span>
                                      <p className="text-orange-400 font-medium">{fc(payment.chargeAmount, selectedLoan.currency)}</p>
                                    </div>
                                  )}
                                  {payment.lateFee !== undefined && payment.lateFee > 0 && (
                                    <div>
                                      <span className="text-dark-400 block mb-0.5">{t('pages.loans.lateFee')}:</span>
                                      <p className="text-red-400 font-medium">{fc(payment.lateFee, selectedLoan.currency)}</p>
                                    </div>
                                  )}
                                  {payment.outstandingBalance !== undefined && (
                                    <div>
                                      <span className="text-dark-400 block mb-0.5">{t('pages.loans.balance')}:</span>
                                      <p className="text-blue-400 font-medium">{fc(payment.outstandingBalance, selectedLoan.currency)}</p>
                                    </div>
                                  )}
                                </div>
                                {payment.notes && (
                                  <div className="mt-2 pt-2 border-t border-dark-600">
                                    <span className="text-dark-400 text-xs">{t('pages.loans.note')}: </span>
                                    <span className="text-dark-300 text-xs">{payment.notes}</span>
                                  </div>
                                )}
                              </div>
                              <button
                                onClick={() => handleDeletePayment(payment.id)}
                                className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                                title={t('pages.loans.deletePayment')}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <TablePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={payments.length}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setPaymentHistoryPage}
                        itemLabel={t('pages.loans.payments')}
                        variant="embedded"
                        className="border-t border-dark-700 pt-3 mt-2"
                        pageSizeOptions={loanPaymentHistoryPageSizeOptions}
                        onPageSizeChange={setLoanPaymentHistoryPageSize}
                      />
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <List className="w-12 h-12 text-dark-600 mx-auto mb-3" />
                      <p className="text-dark-400 text-sm">{t('pages.loans.noPayments')}</p>
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
