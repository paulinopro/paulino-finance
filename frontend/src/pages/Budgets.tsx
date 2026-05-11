import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import type { ExpenseCategory } from '../types';
import { Plus, Edit, Trash2, Search, X, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { LIST_CARD_SHELL, listCardAccentFromPercent, listCardProgressColor, listCardBtnEdit, listCardBtnDanger } from '../utils/listCard';
import { TABLE_PAGE_SIZE_BUDGETS } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { usePersistedIdOrder } from '../hooks/usePersistedIdOrder';
import { useListOrderPageDnd } from '../hooks/useListOrderPageDnd';
import ListOrderDragHandle from '../components/ListOrderDragHandle';
import ListOrderDragGhostPortal from '../components/ListOrderDragGhostPortal';
import SummaryBarToggleButton from '../components/SummaryBarToggleButton';
import { usePersistedSummaryBarVisible } from '../hooks/usePersistedSummaryBarVisible';

interface Budget {
  id: number;
  name: string;
  category?: string;
  amount: number;
  currency: string;
  periodType: 'MONTHLY' | 'YEARLY';
  periodMonth?: number;
  periodYear: number;
  spent: number;
  remaining: number;
  percentage: number;
  createdAt: string;
  updatedAt: string;
}

const Budgets: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    formatCurrency: fc,
    currencySelectLabel,
    defaultTransactionCurrency,
    transactionCurrencyOptions,
    primaryCurrency,
    secondaryCurrency,
  } = useIntlFormatting();
  const { pageSize: budgetPageSize, setPageSize: setBudgetPageSize, pageSizeOptions: budgetPageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:budgets', TABLE_PAGE_SIZE_BUDGETS);
  const { visible: summaryBarVisible, toggle: toggleSummaryBar } = usePersistedSummaryBarVisible(
    user?.id,
    'budgets'
  );
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    amount: '',
    currency: defaultTransactionCurrency,
    periodType: 'MONTHLY' as 'MONTHLY' | 'YEARLY',
    periodMonth: new Date().getMonth() + 1,
    periodYear: new Date().getFullYear(),
  });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await api.get('/categories');
        setCategories(response.data.categories || []);
      } catch {
        /* silencioso: el modal igual permite sin categoría */
      }
    };
    fetchCategories();
  }, []);

  const fetchBudgets = useCallback(async () => {
    try {
      const params: Record<string, string> = {};
      if (periodFilter) params.periodType = periodFilter;

      const response = await api.get('/budgets', { params });
      setBudgets(response.data.budgets);
    } catch {
      toast.error(t('toast.budgets.loadError'));
    } finally {
      setLoading(false);
    }
  }, [periodFilter, t]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        amount: parseFloat(formData.amount),
        periodMonth: formData.periodType === 'MONTHLY' ? formData.periodMonth : null,
      };

      if (editingBudget) {
        await api.put(`/budgets/${editingBudget.id}`, data);
        toast.success(t('toast.budgets.updated'));
      } else {
        await api.post('/budgets', data);
        toast.success(t('toast.budgets.created'));
      }

      setShowModal(false);
      resetForm();
      fetchBudgets();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.budgets.saveError'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t('confirm.deleteBudget'))) {
      return;
    }

    try {
      await api.delete(`/budgets/${id}`);
      toast.success(t('toast.budgets.deleted'));
      fetchBudgets();
    } catch (error: any) {
      toast.error(t('toast.budgets.deleteError'));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      category: '',
      amount: '',
      currency: defaultTransactionCurrency,
      periodType: 'MONTHLY',
      periodMonth: new Date().getMonth() + 1,
      periodYear: new Date().getFullYear(),
    });
    setEditingBudget(null);
  };

  const openEditModal = (budget: Budget) => {
    setEditingBudget(budget);
    setFormData({
      name: budget.name,
      category: budget.category || '',
      amount: budget.amount.toString(),
      currency: budget.currency,
      periodType: budget.periodType,
      periodMonth: budget.periodMonth || new Date().getMonth() + 1,
      periodYear: budget.periodYear,
    });
    setShowModal(true);
  };

  useEscapeKey(showModal, () => {
    setShowModal(false);
    resetForm();
  });
  useModalFocusTrap(modalPanelRef, showModal);

  const filteredBudgets = budgets.filter((budget) =>
    budget.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    budget.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const { ordered: orderedFiltered, setOrderByIds: setBudgetOrderByIds } = usePersistedIdOrder<Budget>({
    module: 'budgets',
    userId: user?.id,
    sourceItems: filteredBudgets,
  });
  const commitBudgetOrder = useCallback(
    (next: Budget[]) => {
      setBudgetOrderByIds(next.map((b) => b.id));
    },
    [setBudgetOrderByIds]
  );

  const [listPage, setListPage] = useState(1);
  useEffect(() => {
    setListPage(1);
  }, [searchTerm, periodFilter, budgetPageSize]);
  const budgetTotalPages = Math.max(1, Math.ceil(orderedFiltered.length / budgetPageSize));
  const budgetPageSafe = Math.min(listPage, budgetTotalPages);
  useEffect(() => {
    setListPage((p) => Math.min(p, budgetTotalPages));
  }, [budgetTotalPages]);
  const pagedBudgets = useMemo(() => {
    const start = (budgetPageSafe - 1) * budgetPageSize;
    return orderedFiltered.slice(start, start + budgetPageSize);
  }, [orderedFiltered, budgetPageSafe, budgetPageSize]);
  const budgetListStart = (budgetPageSafe - 1) * budgetPageSize;
  const listDnd = useListOrderPageDnd(pagedBudgets, budgetListStart, orderedFiltered, commitBudgetOrder, {
    ghostLabel: (b) => b.name,
  });

  const budgetSummaryKpis = useMemo(() => {
    const p = primaryCurrency;
    const s = secondaryCurrency;
    let primaryTotal = 0;
    let secondaryTotal = 0;
    for (const b of orderedFiltered) {
      const c = String(b.currency || p).toUpperCase();
      if (c === p) primaryTotal += b.amount;
      else if (c === s) secondaryTotal += b.amount;
      else if (c === 'DOP') primaryTotal += b.amount;
      else if (c === 'USD') secondaryTotal += b.amount;
      else primaryTotal += b.amount;
    }
    return { count: orderedFiltered.length, primaryTotal, secondaryTotal };
  }, [orderedFiltered, primaryCurrency, secondaryCurrency]);

  const monthName = (monthNum: number) =>
    t(`pages.budgets.month${String(monthNum).padStart(2, '0')}`);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <PageHeader
        title={t('pages.budgets.title')}
        subtitle={t('pages.budgets.subtitle')}
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
              {t('pages.budgets.newBudgetButton')}
            </button>
          </div>
        }
      />

      {summaryBarVisible && (
        <div className="card-view">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">
                {t('pages.budgets.summaryCapPrimary', { currency: primaryCurrency })}
              </p>
              <p className="text-2xl font-bold text-white">
                {fc(budgetSummaryKpis.primaryTotal, primaryCurrency)}
              </p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">
                {t('pages.budgets.summaryCapPrimary', { currency: secondaryCurrency })}
              </p>
              <p className="text-2xl font-bold text-white">
                {fc(budgetSummaryKpis.secondaryTotal, secondaryCurrency)}
              </p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">{t('pages.budgets.summaryBudgetCount')}</p>
              <p className="text-2xl font-bold text-white">{budgetSummaryKpis.count}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-view">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1 relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-dark-400" aria-hidden />
            <input
              type="search"
              placeholder={t('pages.budgets.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input w-full pl-11"
              autoComplete="off"
            />
          </div>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="input w-full shrink-0 sm:min-w-[11rem] sm:max-w-[14rem]"
          >
            <option value="">{t('pages.budgets.filterAllPeriods')}</option>
            <option value="MONTHLY">{t('pages.budgets.periodMonthly')}</option>
            <option value="YEARLY">{t('pages.budgets.periodYearly')}</option>
          </select>
        </div>
      </div>

      {/* Budgets List */}
      {orderedFiltered.length === 0 ? (
        <div className="card-view py-14 sm:py-16 text-center">
          <p className="text-dark-400 text-sm sm:text-base">{t('pages.budgets.emptyFilter')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5 xl:gap-6">
            {pagedBudgets.map((budget) => {
              const pct = Math.min(100, budget.percentage);
              const periodLabel =
                budget.periodType === 'MONTHLY'
                  ? `${monthName(budget.periodMonth!)} ${budget.periodYear}`
                  : t('pages.budgets.periodYearOnly', { year: budget.periodYear });

              return (
                <motion.article
                  key={budget.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  {...listDnd.droppableAttr(budget.id)}
                  className={[
                    LIST_CARD_SHELL,
                    listCardAccentFromPercent(budget.percentage),
                    listDnd.dragId === budget.id ? 'opacity-[0.22]' : '',
                    listDnd.dragId !== null &&
                    listDnd.pointerOverItemId === budget.id &&
                    listDnd.dragId !== budget.id
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
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                          {budget.periodType === 'MONTHLY'
                            ? t('pages.budgets.periodMonthly')
                            : t('pages.budgets.periodYearly')}
                        </span>
                        <span className="text-xs text-dark-500 sm:text-sm">{periodLabel}</span>
                      </div>
                      <h3 className="break-words text-lg font-bold leading-snug text-white sm:text-xl">
                        {budget.name}
                      </h3>
                      {budget.category && (
                        <span className="inline-flex max-w-full truncate rounded-md bg-primary-600/15 px-2 py-0.5 text-xs font-medium text-primary-200 ring-1 ring-primary-500/25">
                          {budget.category}
                        </span>
                      )}
                    </div>
                    <div className="order-1 flex w-full shrink-0 flex-wrap items-center justify-end gap-0.5 xl:order-2 xl:w-auto">
                      <ListOrderDragHandle
                        itemId={budget.id}
                        gripBinder={listDnd.gripBinder}
                        disabled={pagedBudgets.length < 2}
                      />
                      <button
                        type="button"
                        onClick={() => openEditModal(budget)}
                        className={listCardBtnEdit}
                        title={t('common.actions.edit')}
                        aria-label={t('pages.budgets.editAria')}
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(budget.id)}
                        className={listCardBtnDanger}
                        title={t('common.actions.delete')}
                        aria-label={t('pages.budgets.deleteAria')}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-col gap-4 border-t border-dark-700/80 pt-4">
                    <div className="flex flex-col gap-3 xs:flex-row xs:items-end xs:justify-between">
                      <div>
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                          {t('pages.budgets.metricCap')}
                        </p>
                        <p className="text-base font-semibold tabular-nums text-white sm:text-lg">
                          {fc(budget.amount, budget.currency)}
                        </p>
                      </div>
                      <div className="flex items-baseline gap-2 self-start xs:self-auto">
                        <span className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                          {t('pages.budgets.usage')}
                        </span>
                        <span
                          className="text-2xl font-bold tabular-nums leading-none sm:text-3xl"
                          style={{ color: listCardProgressColor(budget.percentage) }}
                        >
                          {budget.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex justify-between gap-2 text-xs text-dark-400">
                        <span>{t('pages.budgets.consumptionLabel')}</span>
                        <span className="tabular-nums text-dark-300">
                          {pct.toFixed(0)}% / 100%
                        </span>
                      </div>
                      <div
                        className="h-2.5 w-full overflow-hidden rounded-full bg-dark-700/90 ring-1 ring-dark-600/80 sm:h-3"
                        role="progressbar"
                        aria-valuenow={Math.round(pct)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500 ease-out"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: listCardProgressColor(budget.percentage),
                            boxShadow: `0 0 12px ${listCardProgressColor(budget.percentage)}55`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="metrics-cq">
                      <div className="metrics-row-2">
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                          {t('pages.budgets.spent')}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                          {fc(budget.spent, budget.currency)}
                        </p>
                      </div>
                        <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                        <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">
                          {t('pages.budgets.remaining')}
                        </p>
                        <p
                          className={`mt-0.5 text-sm font-semibold tabular-nums sm:text-base ${budget.remaining >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                        >
                          {fc(budget.remaining, budget.currency)}
                        </p>
                      </div>
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
            currentPage={budgetPageSafe}
            totalPages={budgetTotalPages}
            totalItems={orderedFiltered.length}
            itemsPerPage={budgetPageSize}
            onPageChange={setListPage}
            itemLabel={t('pages.budgets.itemsLabel')}
            variant="card"
            pageSizeOptions={budgetPageSizeOptions}
            onPageSizeChange={setBudgetPageSize}
          />
        </>
      )}

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
            aria-labelledby="budgets-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="budgets-modal-title" className="text-xl font-semibold text-white">
                {editingBudget ? t('pages.budgets.modalEditTitle') : t('pages.budgets.modalNewTitle')}
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
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  {t('pages.budgets.fieldNameRequired')}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  {t('pages.budgets.fieldCategory')}
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">
                    {categories.length === 0
                      ? t('pages.budgets.categoryEmptyHint')
                      : t('pages.budgets.categoryNone')}
                  </option>
                  {formData.category &&
                    !categories.some((c) => c.name === formData.category) && (
                      <option value={formData.category}>{formData.category}</option>
                    )}
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    {t('pages.budgets.fieldAmountRequired')}
                  </label>
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
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    {t('pages.budgets.fieldCurrencyRequired')}
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {transactionCurrencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {currencySelectLabel(code)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">
                  {t('pages.budgets.fieldPeriodTypeRequired')}
                </label>
                <select
                  value={formData.periodType}
                  onChange={(e) => setFormData({ ...formData, periodType: e.target.value as 'MONTHLY' | 'YEARLY' })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="MONTHLY">{t('pages.budgets.periodMonthly')}</option>
                  <option value="YEARLY">{t('pages.budgets.periodYearly')}</option>
                </select>
              </div>

              {formData.periodType === 'MONTHLY' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      {t('pages.budgets.fieldMonthRequired')}
                    </label>
                    <select
                      value={formData.periodMonth}
                      onChange={(e) => setFormData({ ...formData, periodMonth: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((m) => (
                        <option key={m} value={m}>
                          {monthName(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-dark-300 mb-2">
                      {t('pages.budgets.fieldYearRequired')}
                    </label>
                    <input
                      type="number"
                      value={formData.periodYear}
                      onChange={(e) => setFormData({ ...formData, periodYear: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                      min="2020"
                      max="2100"
                      required
                    />
                  </div>
                </div>
              )}

              {formData.periodType === 'YEARLY' && (
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">
                    {t('pages.budgets.fieldYearRequired')}
                  </label>
                  <input
                    type="number"
                    value={formData.periodYear}
                    onChange={(e) => setFormData({ ...formData, periodYear: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    min="2020"
                    max="2100"
                    required
                  />
                </div>
              )}

              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingBudget ? t('pages.budgets.submitUpdate') : t('pages.budgets.submitCreate')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="btn-secondary flex-1"
                >
                  {t('common.actions.cancel')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Budgets;
