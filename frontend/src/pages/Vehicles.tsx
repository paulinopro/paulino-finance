import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { BankAccount, ExpenseCategory } from '../types';
import { Plus, Edit, Trash2, Search, X, Car, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  LIST_CARD_SHELL,
  listCardAccentSubtle,
  listCardAccentNeutral,
  listCardBtnEdit,
  listCardBtnDanger,
} from '../utils/listCard';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { useIntlFormatting } from '../context/IntlFormattingContext';
import { useTranslation } from 'react-i18next';
import { todayYmdLocal, formatDateDdMmYyyy } from '../utils/dateUtils';
import { CATEGORY_CHART_COLORS } from '../constants/chartColors';
import { bankAccountSupportsLedgerCurrency, formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';

interface Vehicle {
  id: number;
  make: string;
  model: string;
  year?: number;
  licensePlate?: string;
  color?: string;
  mileage: number;
  purchaseDate?: string;
  purchasePrice?: number;
  currency?: string;
  notes?: string;
  totalExpenses: number;
  createdAt: string;
  updatedAt: string;
}

const SPEND_KIND_VALUES = ['maintenance', 'repair', 'fuel', 'insurance', 'taxes', 'parts', 'wash', 'other'] as const;
type SpendKindKey = (typeof SPEND_KIND_VALUES)[number];

/** Maps legacy Spanish preset labels saved in older rows to stable keys. */
const LEGACY_SPEND_KIND_TO_KEY: Record<string, SpendKindKey> = {
  Mantenimiento: 'maintenance',
  Reparación: 'repair',
  Combustible: 'fuel',
  Seguro: 'insurance',
  Impuestos: 'taxes',
  Piezas: 'parts',
  Lavado: 'wash',
  Otro: 'other',
};

function normalizeSpendKindAgg(raw: string | undefined | null): string {
  const s = raw != null ? String(raw).trim() : '';
  if (!s) return '__none__';
  return LEGACY_SPEND_KIND_TO_KEY[s] ?? s;
}

interface VehicleExpense {
  id: number;
  spendKind: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  mileageAtExpense?: number;
  category?: string;
  categoryId?: number | null;
  categoryName?: string | null;
  bankAccountId?: number | null;
  linkedExpenseId?: number | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const Vehicles: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    formatCurrency: fc,
    formatInt: fi,
    currencySelectLabel,
    defaultTransactionCurrency,
    transactionCurrencyOptions,
    primaryCurrency,
    secondaryCurrency,
  } = useIntlFormatting();
  const { pageSize: vehiclePageSize, setPageSize: setVehiclePageSize, pageSizeOptions: vehiclePageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:vehicles', TABLE_PAGE_SIZE);
  const vehicleModalRef = useRef<HTMLDivElement>(null);
  const expenseModalRef = useRef<HTMLDivElement>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [expenses, setExpenses] = useState<VehicleExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [editingExpense, setEditingExpense] = useState<VehicleExpense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [vehicleFormData, setVehicleFormData] = useState({
    make: '',
    model: '',
    year: '',
    licensePlate: '',
    color: '',
    mileage: '',
    purchaseDate: '',
    purchasePrice: '',
    currency: defaultTransactionCurrency,
    notes: '',
  });
  const [expenseFormData, setExpenseFormData] = useState({
    spendKind: '',
    description: '',
    amount: '',
    currency: defaultTransactionCurrency,
    date: todayYmdLocal(),
    mileageAtExpense: '',
    categoryId: '',
    notes: '',
    bankAccountId: '',
  });
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const formatSpendKindDisplay = useCallback(
    (raw: string | undefined | null) => {
      const agg = normalizeSpendKindAgg(raw);
      if (agg === '__none__') return t('pages.vehicles.unknownSpendKind');
      if ((SPEND_KIND_VALUES as readonly string[]).includes(agg))
        return t(`pages.vehicles.spendKindOptions.${agg}`);
      return agg;
    },
    [t]
  );

  useEffect(() => {
    fetchVehicles();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [catRes, accRes] = await Promise.all([api.get('/categories'), api.get('/accounts')]);
        setExpenseCategories(catRes.data.categories || []);
        setBankAccounts(accRes.data.accounts || []);
      } catch {
        setExpenseCategories([]);
        setBankAccounts([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedVehicle) {
      fetchVehicleExpenses(selectedVehicle.id);
    }
  }, [selectedVehicle]);

  const fetchVehicles = async () => {
    try {
      const response = await api.get('/vehicles');
      setVehicles(response.data.vehicles);
    } catch (error: any) {
      toast.error(t('toast.vehicles.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicleExpenses = async (vehicleId: number) => {
    try {
      const response = await api.get(`/vehicles/${vehicleId}/expenses`);
      setExpenses(response.data.expenses);
    } catch (error: any) {
      toast.error(t('toast.vehicles.expensesLoadError'));
    }
  };

  const handleVehicleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...vehicleFormData,
        year: vehicleFormData.year ? parseInt(vehicleFormData.year) : null,
        mileage: vehicleFormData.mileage ? parseFloat(vehicleFormData.mileage) : 0,
        purchasePrice: vehicleFormData.purchasePrice ? parseFloat(vehicleFormData.purchasePrice) : null,
        purchaseDate: vehicleFormData.purchaseDate || null,
      };

      if (editingVehicle) {
        await api.put(`/vehicles/${editingVehicle.id}`, data);
        toast.success(t('toast.vehicles.updated'));
      } else {
        await api.post('/vehicles', data);
        toast.success(t('toast.vehicles.created'));
      }

      setShowVehicleModal(false);
      resetVehicleForm();
      fetchVehicles();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.vehicles.saveError'));
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) return;
    if (!expenseFormData.categoryId) {
      toast.error(t('toast.generic.selectCategory'));
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        spendKind: expenseFormData.spendKind,
        description: expenseFormData.description,
        amount: parseFloat(expenseFormData.amount),
        currency: expenseFormData.currency,
        date: expenseFormData.date,
        mileageAtExpense: expenseFormData.mileageAtExpense ? parseFloat(expenseFormData.mileageAtExpense) : null,
        notes: expenseFormData.notes || null,
        categoryId: parseInt(expenseFormData.categoryId, 10),
      };
      if (expenseFormData.bankAccountId) {
        payload.bankAccountId = parseInt(expenseFormData.bankAccountId, 10);
      } else {
        payload.bankAccountId = null;
      }

      if (editingExpense) {
        await api.put(`/vehicles/${selectedVehicle.id}/expenses/${editingExpense.id}`, payload);
        toast.success(t('toast.vehicles.expenseUpdated'));
      } else {
        await api.post(`/vehicles/${selectedVehicle.id}/expenses`, payload);
        toast.success(t('toast.vehicles.expenseAdded'));
      }

      setShowExpenseModal(false);
      resetExpenseForm();
      fetchVehicleExpenses(selectedVehicle.id);
      fetchVehicles(); // Refresh to update total expenses
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.vehicles.expenseSaveError'));
    }
  };

  const handleDeleteVehicle = async (id: number) => {
    if (!window.confirm(t('confirm.deleteVehicle'))) {
      return;
    }

    try {
      await api.delete(`/vehicles/${id}`);
      toast.success(t('toast.vehicles.deleted'));
      if (selectedVehicle?.id === id) {
        setSelectedVehicle(null);
        setExpenses([]);
      }
      fetchVehicles();
    } catch (error: any) {
      toast.error(t('toast.vehicles.deleteError'));
    }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    if (!window.confirm(t('confirm.deleteVehicleExpense'))) {
      return;
    }

    if (!selectedVehicle) return;

    try {
      await api.delete(`/vehicles/${selectedVehicle.id}/expenses/${expenseId}`);
      toast.success(t('toast.vehicles.expenseDeleted'));
      fetchVehicleExpenses(selectedVehicle.id);
      fetchVehicles();
    } catch (error: any) {
      toast.error(t('toast.vehicles.expenseDeleteError'));
    }
  };

  const resetVehicleForm = () => {
    setVehicleFormData({
      make: '',
      model: '',
      year: '',
      licensePlate: '',
      color: '',
      mileage: '',
      purchaseDate: '',
      purchasePrice: '',
      currency: defaultTransactionCurrency,
      notes: '',
    });
    setEditingVehicle(null);
  };

  const resetExpenseForm = () => {
    setExpenseFormData({
      spendKind: '',
      description: '',
      amount: '',
      currency: defaultTransactionCurrency,
      date: todayYmdLocal(),
      mileageAtExpense: '',
      categoryId: '',
      notes: '',
      bankAccountId: '',
    });
    setEditingExpense(null);
  };

  const openEditVehicle = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setVehicleFormData({
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year?.toString() || '',
      licensePlate: vehicle.licensePlate || '',
      color: vehicle.color || '',
      mileage: vehicle.mileage.toString(),
      purchaseDate: vehicle.purchaseDate || '',
      purchasePrice: vehicle.purchasePrice?.toString() || '',
      currency: vehicle.currency || defaultTransactionCurrency,
      notes: vehicle.notes || '',
    });
    setShowVehicleModal(true);
  };

  const openEditExpense = (expense: VehicleExpense) => {
    setEditingExpense(expense);
    setExpenseFormData({
      spendKind: (() => {
        const rk = expense.spendKind?.trim() ?? '';
        return LEGACY_SPEND_KIND_TO_KEY[rk] ?? rk;
      })(),
      description: expense.description,
      amount: expense.amount.toString(),
      currency: expense.currency,
      date: expense.date.slice(0, 10),
      mileageAtExpense: expense.mileageAtExpense?.toString() || '',
      categoryId: expense.categoryId != null ? String(expense.categoryId) : '',
      notes: expense.notes || '',
      bankAccountId: expense.bankAccountId != null ? String(expense.bankAccountId) : '',
    });
    setShowExpenseModal(true);
  };

  const filteredVehicles = vehicles.filter((vehicle) =>
    `${vehicle.make} ${vehicle.model}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.licensePlate?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [vehicleListPage, setVehicleListPage] = useState(1);
  useEffect(() => {
    setVehicleListPage(1);
  }, [searchTerm, vehiclePageSize]);
  const vehicleTotalPages = Math.max(1, Math.ceil(filteredVehicles.length / vehiclePageSize));
  const vehiclePageSafe = Math.min(vehicleListPage, vehicleTotalPages);
  useEffect(() => {
    setVehicleListPage((p) => Math.min(p, vehicleTotalPages));
  }, [vehicleTotalPages]);
  const pagedVehicles = useMemo(() => {
    const start = (vehiclePageSafe - 1) * vehiclePageSize;
    return filteredVehicles.slice(start, start + vehiclePageSize);
  }, [filteredVehicles, vehiclePageSafe, vehiclePageSize]);

  const primaryCur = primaryCurrency;
  const secondaryCur = secondaryCurrency;
  const secPerPrimary =
    user?.exchangeRateEffective && user.exchangeRateEffective > 0
      ? user.exchangeRateEffective
      : user?.exchangeRateDopUsd && user.exchangeRateDopUsd > 0
        ? user.exchangeRateDopUsd
        : null;

  const vehicleTypeChartSorted = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((ex) => {
      const c = String(ex.currency || primaryCur).toUpperCase();
      let v = ex.amount;
      if (secPerPrimary != null && secPerPrimary > 0) {
        if (c === primaryCur) v = ex.amount;
        else if (c === secondaryCur) v = ex.amount / secPerPrimary;
      }
      const agg = normalizeSpendKindAgg(ex.spendKind);
      map[agg] = (map[agg] || 0) + v;
    });
    return Object.entries(map)
      .map(([agg, value]) => ({
        agg,
        name: formatSpendKindDisplay(agg === '__none__' ? '' : agg),
        value: Math.round(value),
      }))
      .sort((a, b) => b.value - a.value);
  }, [expenses, secPerPrimary, primaryCur, secondaryCur, formatSpendKindDisplay]);

  const vehicleTypeChartTotal = useMemo(
    () => vehicleTypeChartSorted.reduce((s, d) => s + d.value, 0),
    [vehicleTypeChartSorted]
  );

  const bankAccountNameById = useMemo(() => {
    const m = new Map<number, string>();
    bankAccounts.forEach((a) => m.set(a.id, formatBankAccountOptionLabel(a)));
    return m;
  }, [bankAccounts]);

  const accountsForVehicleExpense = useMemo(() => {
    const c = expenseFormData.currency;
    return bankAccounts.filter((a: BankAccount) =>
      bankAccountSupportsLedgerCurrency(a, c, primaryCurrency, secondaryCurrency)
    );
  }, [bankAccounts, expenseFormData.currency, primaryCurrency, secondaryCurrency]);

  useEscapeKey(showExpenseModal, () => {
    setShowExpenseModal(false);
    resetExpenseForm();
  });
  useEscapeKey(showVehicleModal && !showExpenseModal, () => {
    setShowVehicleModal(false);
    resetVehicleForm();
  });
  useModalFocusTrap(expenseModalRef, showExpenseModal);
  useModalFocusTrap(vehicleModalRef, showVehicleModal && !showExpenseModal);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('pages.vehicles.title')}
        subtitle={t('pages.vehicles.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => {
              resetVehicleForm();
              setShowVehicleModal(true);
            }}
            className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto"
          >
            <Plus size={20} />
            {t('pages.vehicles.newVehicle')}
          </button>
        }
      />

      {/* Search */}
      <div className="card-view">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
          <input
            type="text"
            placeholder={t('pages.vehicles.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
        {/* Vehicles List */}
        <div className="lg:col-span-1">
          <div className="space-y-4">
          {filteredVehicles.length === 0 ? (
            <div className="card-view text-center py-12 sm:py-16">
              <Car className="mx-auto text-dark-400 mb-4" size={48} />
              <p className="text-dark-400">{t('pages.vehicles.noVehicles')}</p>
            </div>
          ) : (
            <>
            {pagedVehicles.map((vehicle) => (
              <motion.article
                key={vehicle.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedVehicle(vehicle);
                  }
                }}
                className={[
                  LIST_CARD_SHELL,
                  selectedVehicle?.id === vehicle.id ? 'border-l-primary-500 ring-1 ring-primary-500/40' : listCardAccentSubtle(),
                  'cursor-pointer',
                ].join(' ')}
                onClick={() => setSelectedVehicle(vehicle)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-[min(100%,12rem)] flex-1 space-y-2 pr-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                        <Car className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                        {t('pages.vehicles.vehicleBadge')}
                      </span>
                      {vehicle.year && (
                        <span className="text-xs text-dark-500 sm:text-sm">{vehicle.year}</span>
                      )}
                    </div>
                    <h3 className="break-words text-lg font-bold leading-snug text-white sm:text-xl">
                      {vehicle.make} {vehicle.model}
                    </h3>
                    {vehicle.licensePlate && (
                      <span className="inline-flex max-w-full truncate rounded-md bg-primary-600/15 px-2 py-0.5 text-xs font-medium text-primary-200 ring-1 ring-primary-500/25">
                        {vehicle.licensePlate}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditVehicle(vehicle);
                      }}
                      className={listCardBtnEdit}
                      title={t('common.actions.edit')}
                      aria-label={t('pages.vehicles.editAria')}
                    >
                      <Edit className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteVehicle(vehicle.id);
                      }}
                      className={listCardBtnDanger}
                      title={t('common.actions.delete')}
                      aria-label={t('pages.vehicles.deleteAria')}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2 border-t border-dark-700/80 pt-4">
                  <div className="metrics-cq">
                    <div className="metrics-row-2">
                      <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.vehicles.mileage')}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                        {fi(vehicle.mileage)} km
                      </p>
                    </div>
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.vehicles.totalExpenses')}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                        {fc(vehicle.totalExpenses, vehicle.currency ?? primaryCurrency)}
                      </p>
                    </div>
                  </div>
                  </div>
                </div>
              </motion.article>
            ))}
            </>
          )}
          </div>
          {filteredVehicles.length > 0 && (
            <TablePagination
              className="mt-4 sm:mt-5"
              currentPage={vehiclePageSafe}
              totalPages={vehicleTotalPages}
              totalItems={filteredVehicles.length}
              itemsPerPage={vehiclePageSize}
              onPageChange={setVehicleListPage}
              itemLabel={t('pages.vehicles.itemsLabel')}
              variant="card"
              pageSizeOptions={vehiclePageSizeOptions}
              onPageSizeChange={setVehiclePageSize}
            />
          )}
        </div>

        {/* Vehicle Details and Expenses */}
        <div className="lg:col-span-2">
          {selectedVehicle ? (
            <div className="space-y-6">
              {/* Vehicle Info */}
              <div className={[LIST_CARD_SHELL, listCardAccentNeutral()].join(' ')}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-[min(100%,12rem)] space-y-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-600/80 bg-dark-700/50 px-2.5 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-dark-300 sm:text-xs">
                      <Car className="h-3.5 w-3.5 shrink-0 text-primary-400" aria-hidden />
                      {t('pages.vehicles.detailBadge')}
                    </span>
                    <h2 className="break-words text-xl font-bold text-white sm:text-2xl">
                      {selectedVehicle.make} {selectedVehicle.model}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      resetExpenseForm();
                      setShowExpenseModal(true);
                    }}
                    className="btn-primary inline-flex shrink-0 items-center gap-2 self-start"
                  >
                    <Plus size={18} />
                    {t('pages.vehicles.addExpense')}
                  </button>
                </div>
                <div className="metrics-cq mt-4 border-t border-dark-700/80 pt-4">
                  <div className="metrics-row-4">
                  {selectedVehicle.year && (
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.vehicles.year')}</p>
                      <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">{selectedVehicle.year}</p>
                    </div>
                  )}
                  {selectedVehicle.licensePlate && (
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.vehicles.plate')}</p>
                      <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">{selectedVehicle.licensePlate}</p>
                    </div>
                  )}
                  <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                    <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.vehicles.mileage')}</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                      {fi(selectedVehicle.mileage)} km
                    </p>
                  </div>
                  {selectedVehicle.purchasePrice && (
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">{t('pages.vehicles.purchasePrice')}</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                        {fc(selectedVehicle.purchasePrice, selectedVehicle.currency ?? primaryCurrency)}
                      </p>
                    </div>
                  )}
                </div>
                </div>
                {selectedVehicle.notes && (
                  <p className="mt-4 rounded-xl border border-dark-600/50 bg-dark-900/20 px-3 py-2 text-sm text-dark-300">
                    <span className="text-dark-500">{t('pages.vehicles.notes')}:</span> {selectedVehicle.notes}
                  </p>
                )}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="dashboard-panel"
              >
                <h2 className="dashboard-panel-title">{t('pages.vehicles.expensesByType')}</h2>
                <p className="text-xs text-dark-500 -mt-2 mb-4">
                  {t('pages.vehicles.chartAmountsHint', {
                    primary: primaryCurrency,
                    secondary: secondaryCurrency,
                  })}
                </p>
                {vehicleTypeChartSorted.length > 0 ? (
                  <div className="flex min-h-0 flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-6">
                    <div className="chart-box mx-auto h-[220px] w-full max-w-[320px] shrink-0 xs:h-[240px] sm:h-[260px] lg:mx-0 lg:h-[280px] lg:max-w-[min(100%,360px)]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={vehicleTypeChartSorted}
                            cx="50%"
                            cy="50%"
                            innerRadius="48%"
                            outerRadius="78%"
                            paddingAngle={2}
                            dataKey="value"
                            nameKey="name"
                            stroke="#0f172a"
                            strokeWidth={2}
                          >
                            {vehicleTypeChartSorted.map((_, index) => (
                              <Cell
                                key={`veh-type-${index}`}
                                fill={CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const p = payload[0].payload as { name: string; value: number };
                              const pct =
                                vehicleTypeChartTotal > 0
                                  ? ((p.value / vehicleTypeChartTotal) * 100).toFixed(1)
                                  : '0';
                              return (
                                <div className="rounded-lg border border-dark-600 bg-dark-800 px-3 py-2 shadow-lg">
                                  <p className="font-medium text-white">{p.name}</p>
                                  <p className="text-sm tabular-nums text-dark-300">
                                    {fc(p.value, primaryCurrency)}
                                    <span className="text-dark-500"> · {pct}%</span>
                                  </p>
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-dark-600/40 bg-dark-900/45 p-3 ring-1 ring-white/5 sm:p-4 lg:max-h-[280px]">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-dark-500">
                        {t('pages.vehicles.distribution')}
                      </p>
                      <ul className="grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2 sm:gap-x-4">
                        {vehicleTypeChartSorted.map((row, index) => {
                          const pct =
                            vehicleTypeChartTotal > 0 ? (row.value / vehicleTypeChartTotal) * 100 : 0;
                          const fill = CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length];
                          return (
                            <li key={row.agg} className="flex min-w-0 items-start gap-2.5">
                              <span
                                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-white/10"
                                style={{ backgroundColor: fill }}
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-white" title={row.name}>
                                  {row.name}
                                </p>
                                <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                                  <span className="tabular-nums text-xs text-dark-400">
                                    {fc(row.value, primaryCurrency)}
                                  </span>
                                  <span className="shrink-0 tabular-nums text-xs font-semibold text-primary-300">
                                    {pct.toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 text-dark-400">
                    {expenses.length === 0
                      ? t('pages.vehicles.chartEmptyNoExpenses')
                      : t('pages.vehicles.chartEmptyInsufficient')}
                  </div>
                )}
              </motion.div>

              {/* Expenses List */}
              <div className={[LIST_CARD_SHELL, listCardAccentNeutral()].join(' ')}>
                <h3 className="mb-4 text-lg font-bold text-white">{t('pages.vehicles.expenseHistory')}</h3>
                {expenses.length === 0 ? (
                  <div className="text-center py-8 text-dark-400">
                    <Wrench className="mx-auto mb-4" size={48} />
                    <p>{t('pages.vehicles.noExpenses')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expenses.map((expense) => (
                      <div
                        key={expense.id}
                        className="bg-dark-700 rounded-lg p-4 flex items-start justify-between"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="px-2 py-1 bg-primary-600/20 text-primary-400 rounded text-xs">
                              {formatSpendKindDisplay(expense.spendKind)}
                            </span>
                            {(expense.categoryName || expense.category) && (
                              <span className="px-2 py-1 bg-dark-600 text-dark-300 rounded text-xs">
                                {expense.categoryName || expense.category}
                              </span>
                            )}
                          </div>
                          <h4 className="text-white font-medium mb-1">{expense.description}</h4>
                          <div className="flex items-center gap-4 text-sm text-dark-400">
                            <span>
                              {fc(expense.amount, expense.currency)}
                            </span>
                            <span>{formatDateDdMmYyyy(expense.date)}</span>
                            {expense.mileageAtExpense && (
                              <span>{fi(expense.mileageAtExpense)} km</span>
                            )}
                          </div>
                          {(expense.bankAccountId != null || expense.linkedExpenseId != null) && (
                            <p className="text-xs text-dark-500 mt-1 space-y-0.5">
                              {expense.bankAccountId != null && (
                                <span className="block">
                                  {t('pages.vehicles.source')}:{' '}
                                  <span className="text-dark-300">
                                    {bankAccountNameById.get(expense.bankAccountId) ??
                                      t('pages.vehicles.accountFallback', { id: expense.bankAccountId })}
                                  </span>
                                </span>
                              )}
                              {expense.linkedExpenseId != null && (
                                <span className="block">
                                  <Link
                                    to="/expenses"
                                    className="text-primary-400 hover:text-primary-300 hover:underline"
                                  >
                                    {t('pages.expenses.linkVehicles')}
                                  </Link>
                                  <span className="text-dark-600"> · #{expense.linkedExpenseId}</span>
                                </span>
                              )}
                            </p>
                          )}
                          {expense.notes && (
                            <p className="text-xs text-dark-400 mt-2">{t('pages.vehicles.notes')}: {expense.notes}</p>
                          )}
                        </div>
                        <div className="ml-4 flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => openEditExpense(expense)}
                            className={listCardBtnEdit}
                            title={t('common.actions.edit')}
                            aria-label={t('pages.vehicles.editExpenseAria')}
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(expense.id)}
                            className={listCardBtnDanger}
                            title={t('common.actions.delete')}
                            aria-label={t('pages.vehicles.deleteExpenseAria')}
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card-view text-center py-12 sm:py-16">
              <Car className="mx-auto text-dark-400 mb-4" size={64} />
              <p className="text-dark-400">{t('pages.vehicles.selectVehicleHint')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Vehicle Modal */}
      {showVehicleModal && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowVehicleModal(false);
            resetVehicleForm();
          }}
          role="presentation"
        >
          <motion.div
            ref={vehicleModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-2xl w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vehicles-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="vehicles-modal-title" className="text-xl font-semibold text-white">
                {editingVehicle ? t('pages.vehicles.editVehicleTitle') : t('pages.vehicles.newVehicleTitle')}
              </h2>
              <button
                onClick={() => {
                  setShowVehicleModal(false);
                  resetVehicleForm();
                }}
                className="text-dark-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleVehicleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">{t('pages.vehicles.make')}</label>
                  <input
                    type="text"
                    value={vehicleFormData.make}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, make: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">{t('pages.vehicles.model')}</label>
                  <input
                    type="text"
                    value={vehicleFormData.model}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, model: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">{t('pages.vehicles.year')}</label>
                  <input
                    type="number"
                    value={vehicleFormData.year}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, year: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    min="1900"
                    max="2100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">{t('pages.vehicles.plate')}</label>
                  <input
                    type="text"
                    value={vehicleFormData.licensePlate}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, licensePlate: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">{t('pages.vehicles.color')}</label>
                  <input
                    type="text"
                    value={vehicleFormData.color}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, color: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">{t('pages.vehicles.mileage')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={vehicleFormData.mileage}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, mileage: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">{t('pages.vehicles.purchaseDate')}</label>
                  <input
                    type="date"
                    value={vehicleFormData.purchaseDate}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, purchaseDate: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">{t('pages.vehicles.purchasePrice')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={vehicleFormData.purchasePrice}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, purchasePrice: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">{t('pages.vehicles.currency')}</label>
                <select
                  value={vehicleFormData.currency}
                  onChange={(e) => setVehicleFormData({ ...vehicleFormData, currency: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {transactionCurrencyOptions.map((code) => (
                    <option key={code} value={code}>
                      {currencySelectLabel(code)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">{t('pages.vehicles.notes')}</label>
                <textarea
                  value={vehicleFormData.notes}
                  onChange={(e) => setVehicleFormData({ ...vehicleFormData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingVehicle ? t('pages.vehicles.updateVehicle') : t('pages.vehicles.createVehicle')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVehicleModal(false);
                    resetVehicleForm();
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

      {/* Expense Modal */}
      {showExpenseModal && selectedVehicle && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowExpenseModal(false);
            resetExpenseForm();
          }}
          role="presentation"
        >
          <motion.div
            ref={expenseModalRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-md w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="vehicles-expense-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 id="vehicles-expense-modal-title" className="text-xl font-semibold text-white">
                {editingExpense ? t('pages.vehicles.editExpenseTitle') : t('pages.vehicles.newExpenseTitle')}
              </h2>
              <button
                onClick={() => {
                  setShowExpenseModal(false);
                  resetExpenseForm();
                }}
                className="text-dark-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleExpenseSubmit} className="space-y-4">
              <p className="text-xs text-dark-500 rounded-lg border border-dark-600/60 bg-dark-900/40 px-3 py-2">
                {t('pages.vehicles.expenseCrossModulePrefix')}{' '}
                <Link to="/expenses" className="text-primary-400 hover:underline">
                  {t('pages.subscriptionModuleLabels.expenses')}
                </Link>{' '}
                {t('pages.vehicles.expenseCrossModuleSuffix')}
              </p>
              <div>
                <label className="label">{t('pages.vehicles.spendKind')}</label>
                <select
                  value={expenseFormData.spendKind}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, spendKind: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">{t('pages.vehicles.selectSpendKind')}</option>
                  {expenseFormData.spendKind &&
                    !(SPEND_KIND_VALUES as readonly string[]).includes(expenseFormData.spendKind as SpendKindKey) && (
                      <option value={expenseFormData.spendKind}>{expenseFormData.spendKind}</option>
                    )}
                  {SPEND_KIND_VALUES.map((k) => (
                    <option key={k} value={k}>
                      {t(`pages.vehicles.spendKindOptions.${k}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">{t('pages.vehicles.description')}</label>
                <input
                  type="text"
                  value={expenseFormData.description}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, description: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>

              <div>
                <label className="label">{t('pages.vehicles.category')}</label>
                <select
                  value={expenseFormData.categoryId}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, categoryId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">
                    {expenseCategories.length === 0
                      ? t('pages.vehicles.noCategoriesHint')
                      : t('pages.vehicles.selectCategory')}
                  </option>
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">{t('pages.vehicles.amount')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={expenseFormData.amount}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, amount: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">{t('pages.vehicles.currencyRequired')}</label>
                  <select
                    value={expenseFormData.currency}
                    onChange={(e) =>
                      setExpenseFormData({ ...expenseFormData, currency: e.target.value, bankAccountId: '' })
                    }
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
                  <label className="label">{t('pages.vehicles.date')}</label>
                  <input
                    type="date"
                    value={expenseFormData.date}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, date: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">{t('pages.vehicles.mileageAtExpense')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={expenseFormData.mileageAtExpense}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, mileageAtExpense: e.target.value })}
                    className="input w-full"
                  />
                </div>
              </div>

              <div>
                <label className="label">{t('pages.vehicles.sourceAccountOptional')}</label>
                <select
                  value={expenseFormData.bankAccountId}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">{t('pages.vehicles.unlinkedBalanceOption')}</option>
                  {accountsForVehicleExpense.map((a: BankAccount) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-dark-500 mt-1">{t('pages.vehicles.accountDebitHint')}</p>
              </div>

              <div>
                <label className="label">{t('pages.vehicles.notes')}</label>
                <textarea
                  value={expenseFormData.notes}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })}
                  rows={3}
                  className="input w-full"
                />
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingExpense ? t('pages.vehicles.updateExpense') : t('pages.vehicles.createExpense')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExpenseModal(false);
                    resetExpenseForm();
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

export default Vehicles;
