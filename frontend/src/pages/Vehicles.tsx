import React, { useEffect, useState, useRef, useMemo } from 'react';
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
import { todayYmdLocal, formatDateDdMmYyyy } from '../utils/dateUtils';
import { CATEGORY_CHART_COLORS } from '../constants/chartColors';
import { formatBankAccountOptionLabel } from '../utils/bankAccountDisplay';

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
  const { user } = useAuth();
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
    currency: 'DOP',
    notes: '',
  });
  const [expenseFormData, setExpenseFormData] = useState({
    spendKind: '',
    description: '',
    amount: '',
    currency: 'DOP',
    date: todayYmdLocal(),
    mileageAtExpense: '',
    categoryId: '',
    notes: '',
    bankAccountId: '',
  });
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

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
      toast.error('Error al cargar vehículos');
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicleExpenses = async (vehicleId: number) => {
    try {
      const response = await api.get(`/vehicles/${vehicleId}/expenses`);
      setExpenses(response.data.expenses);
    } catch (error: any) {
      toast.error('Error al cargar gastos del vehículo');
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
        toast.success('Vehículo actualizado');
      } else {
        await api.post('/vehicles', data);
        toast.success('Vehículo creado');
      }

      setShowVehicleModal(false);
      resetVehicleForm();
      fetchVehicles();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar vehículo');
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle) return;
    if (!expenseFormData.categoryId) {
      toast.error('Selecciona una categoría');
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
        toast.success('Gasto actualizado');
      } else {
        await api.post(`/vehicles/${selectedVehicle.id}/expenses`, payload);
        toast.success('Gasto agregado');
      }

      setShowExpenseModal(false);
      resetExpenseForm();
      fetchVehicleExpenses(selectedVehicle.id);
      fetchVehicles(); // Refresh to update total expenses
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar gasto');
    }
  };

  const handleDeleteVehicle = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este vehículo? Todos sus gastos también se eliminarán.')) {
      return;
    }

    try {
      await api.delete(`/vehicles/${id}`);
      toast.success('Vehículo eliminado');
      if (selectedVehicle?.id === id) {
        setSelectedVehicle(null);
        setExpenses([]);
      }
      fetchVehicles();
    } catch (error: any) {
      toast.error('Error al eliminar vehículo');
    }
  };

  const handleDeleteExpense = async (expenseId: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este gasto?')) {
      return;
    }

    if (!selectedVehicle) return;

    try {
      await api.delete(`/vehicles/${selectedVehicle.id}/expenses/${expenseId}`);
      toast.success('Gasto eliminado');
      fetchVehicleExpenses(selectedVehicle.id);
      fetchVehicles();
    } catch (error: any) {
      toast.error('Error al eliminar gasto');
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
      currency: 'DOP',
      notes: '',
    });
    setEditingVehicle(null);
  };

  const resetExpenseForm = () => {
    setExpenseFormData({
      spendKind: '',
      description: '',
      amount: '',
      currency: 'DOP',
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
      currency: vehicle.currency || 'DOP',
      notes: vehicle.notes || '',
    });
    setShowVehicleModal(true);
  };

  const openEditExpense = (expense: VehicleExpense) => {
    setEditingExpense(expense);
    setExpenseFormData({
      spendKind: expense.spendKind,
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

  const spendKindPresets = [
    'Mantenimiento',
    'Reparación',
    'Combustible',
    'Seguro',
    'Impuestos',
    'Piezas',
    'Lavado',
    'Otro',
  ];

  const exchangeRate =
    user?.exchangeRateDopUsd && user.exchangeRateDopUsd > 0 ? user.exchangeRateDopUsd : 58;

  const vehicleTypeChartSorted = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((ex) => {
      const v = ex.currency === 'USD' ? ex.amount * exchangeRate : ex.amount;
      const key = (ex.spendKind && String(ex.spendKind).trim()) || 'Sin tipo';
      map[key] = (map[key] || 0) + v;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);
  }, [expenses, exchangeRate]);

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
    const c = expenseFormData.currency as 'DOP' | 'USD';
    return bankAccounts.filter((a) => a.currencyType === 'DUAL' || a.currencyType === c);
  }, [bankAccounts, expenseFormData.currency]);

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
        title="Vehículos"
        subtitle="Gestiona tus vehículos y sus gastos"
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
            Nuevo Vehículo
          </button>
        }
      />

      {/* Search */}
      <div className="card-view">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
          <input
            type="text"
            placeholder="Buscar vehículos..."
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
              <p className="text-dark-400">No hay vehículos</p>
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
                        Vehículo
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
                      title="Editar"
                      aria-label="Editar vehículo"
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
                      title="Eliminar"
                      aria-label="Eliminar vehículo"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2 border-t border-dark-700/80 pt-4">
                  <div className="metrics-cq">
                    <div className="metrics-row-2">
                      <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Kilometraje</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                        {vehicle.mileage.toLocaleString('es-DO')} km
                      </p>
                    </div>
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Gastos totales</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-red-400 sm:text-base">
                        ${vehicle.totalExpenses.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP
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
              itemLabel="vehículos"
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
                      Detalle
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
                    Agregar Gasto
                  </button>
                </div>
                <div className="metrics-cq mt-4 border-t border-dark-700/80 pt-4">
                  <div className="metrics-row-4">
                  {selectedVehicle.year && (
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Año</p>
                      <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">{selectedVehicle.year}</p>
                    </div>
                  )}
                  {selectedVehicle.licensePlate && (
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Placa</p>
                      <p className="mt-0.5 text-sm font-semibold text-white sm:text-base">{selectedVehicle.licensePlate}</p>
                    </div>
                  )}
                  <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                    <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Kilometraje</p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                      {selectedVehicle.mileage.toLocaleString('es-DO')} km
                    </p>
                  </div>
                  {selectedVehicle.purchasePrice && (
                    <div className="metrics-cell rounded-xl border border-dark-600/60 bg-dark-900/30 px-3 py-2.5 sm:py-3">
                      <p className="text-[0.65rem] font-medium uppercase tracking-wider text-dark-500">Precio de compra</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-white sm:text-base">
                        ${selectedVehicle.purchasePrice.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                        <span className="text-xs font-normal text-dark-400">{selectedVehicle.currency}</span>
                      </p>
                    </div>
                  )}
                </div>
                </div>
                {selectedVehicle.notes && (
                  <p className="mt-4 rounded-xl border border-dark-600/50 bg-dark-900/20 px-3 py-2 text-sm text-dark-300">
                    <span className="text-dark-500">Notas:</span> {selectedVehicle.notes}
                  </p>
                )}
              </div>

              {/* Gastos por tipo — mismo estilo que Resumen > Gastos por Categoría */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="dashboard-panel"
              >
                <h2 className="dashboard-panel-title">Gastos por tipo</h2>
                <p className="text-xs text-dark-500 -mt-2 mb-4">
                  Montos expresados en DOP (USD convertidos con tu tasa de perfil).
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
                                    ${p.value.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP
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
                        Distribución
                      </p>
                      <ul className="grid grid-cols-1 gap-2.5 text-sm sm:grid-cols-2 sm:gap-x-4">
                        {vehicleTypeChartSorted.map((row, index) => {
                          const pct =
                            vehicleTypeChartTotal > 0 ? (row.value / vehicleTypeChartTotal) * 100 : 0;
                          const fill = CATEGORY_CHART_COLORS[index % CATEGORY_CHART_COLORS.length];
                          return (
                            <li key={row.name} className="flex min-w-0 items-start gap-2.5">
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
                                    ${row.value.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP
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
                      ? 'No hay datos de gastos disponibles'
                      : 'No hay datos suficientes para graficar'}
                  </div>
                )}
              </motion.div>

              {/* Expenses List */}
              <div className={[LIST_CARD_SHELL, listCardAccentNeutral()].join(' ')}>
                <h3 className="mb-4 text-lg font-bold text-white">Historial de gastos</h3>
                {expenses.length === 0 ? (
                  <div className="text-center py-8 text-dark-400">
                    <Wrench className="mx-auto mb-4" size={48} />
                    <p>No hay gastos registrados</p>
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
                              {expense.spendKind}
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
                              ${expense.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {expense.currency}
                            </span>
                            <span>{formatDateDdMmYyyy(expense.date)}</span>
                            {expense.mileageAtExpense && (
                              <span>{expense.mileageAtExpense.toLocaleString('es-DO')} km</span>
                            )}
                          </div>
                          {(expense.bankAccountId != null || expense.linkedExpenseId != null) && (
                            <p className="text-xs text-dark-500 mt-1 space-y-0.5">
                              {expense.bankAccountId != null && (
                                <span className="block">
                                  Origen:{' '}
                                  <span className="text-dark-300">
                                    {bankAccountNameById.get(expense.bankAccountId) ?? `Cuenta #${expense.bankAccountId}`}
                                  </span>
                                </span>
                              )}
                              {expense.linkedExpenseId != null && (
                                <span className="block">
                                  <Link
                                    to="/expenses"
                                    className="text-primary-400 hover:text-primary-300 hover:underline"
                                  >
                                    Ver en Gastos
                                  </Link>
                                  <span className="text-dark-600"> · #{expense.linkedExpenseId}</span>
                                </span>
                              )}
                            </p>
                          )}
                          {expense.notes && (
                            <p className="text-xs text-dark-400 mt-2">Notas: {expense.notes}</p>
                          )}
                        </div>
                        <div className="ml-4 flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => openEditExpense(expense)}
                            className={listCardBtnEdit}
                            title="Editar"
                            aria-label="Editar gasto"
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(expense.id)}
                            className={listCardBtnDanger}
                            title="Eliminar"
                            aria-label="Eliminar gasto"
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
              <p className="text-dark-400">Selecciona un vehículo para ver sus detalles y gastos</p>
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
                {editingVehicle ? 'Editar Vehículo' : 'Nuevo Vehículo'}
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
                  <label className="block text-sm font-medium text-dark-300 mb-2">Marca *</label>
                  <input
                    type="text"
                    value={vehicleFormData.make}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, make: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Modelo *</label>
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
                  <label className="block text-sm font-medium text-dark-300 mb-2">Año</label>
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
                  <label className="block text-sm font-medium text-dark-300 mb-2">Placa</label>
                  <input
                    type="text"
                    value={vehicleFormData.licensePlate}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, licensePlate: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Color</label>
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
                  <label className="block text-sm font-medium text-dark-300 mb-2">Kilometraje</label>
                  <input
                    type="number"
                    step="0.01"
                    value={vehicleFormData.mileage}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, mileage: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Fecha de Compra</label>
                  <input
                    type="date"
                    value={vehicleFormData.purchaseDate}
                    onChange={(e) => setVehicleFormData({ ...vehicleFormData, purchaseDate: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Precio de Compra</label>
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
                <label className="block text-sm font-medium text-dark-300 mb-2">Moneda</label>
                <select
                  value={vehicleFormData.currency}
                  onChange={(e) => setVehicleFormData({ ...vehicleFormData, currency: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="DOP">DOP</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Notas</label>
                <textarea
                  value={vehicleFormData.notes}
                  onChange={(e) => setVehicleFormData({ ...vehicleFormData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingVehicle ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVehicleModal(false);
                    resetVehicleForm();
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
                {editingExpense ? 'Editar Gasto' : 'Nuevo Gasto'}
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
                El gasto se registra aquí y en el módulo{' '}
                <Link to="/expenses" className="text-primary-400 hover:underline">
                  Gastos
                </Link>{' '}
                para un solo seguimiento de saldos y categorías.
              </p>
              <div>
                <label className="label">Tipo de gasto *</label>
                <select
                  value={expenseFormData.spendKind}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, spendKind: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">Seleccionar...</option>
                  {spendKindPresets.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label">Descripción *</label>
                <input
                  type="text"
                  value={expenseFormData.description}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, description: e.target.value })}
                  className="input w-full"
                  required
                />
              </div>

              <div>
                <label className="label">Categoría *</label>
                <select
                  value={expenseFormData.categoryId}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, categoryId: e.target.value })}
                  className="input w-full"
                  required
                >
                  <option value="">
                    {expenseCategories.length === 0 ? 'Sin categorías — créalas en Categorías' : 'Seleccionar categoría...'}
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
                  <label className="label">Monto *</label>
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
                  <label className="label">Moneda *</label>
                  <select
                    value={expenseFormData.currency}
                    onChange={(e) =>
                      setExpenseFormData({ ...expenseFormData, currency: e.target.value, bankAccountId: '' })
                    }
                    className="input w-full"
                  >
                    <option value="DOP">DOP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Fecha *</label>
                  <input
                    type="date"
                    value={expenseFormData.date}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, date: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">Kilometraje</label>
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
                <label className="label">Cuenta origen (opcional)</label>
                <select
                  value={expenseFormData.bankAccountId}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, bankAccountId: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Sin vincular saldo</option>
                  {accountsForVehicleExpense.map((a: BankAccount) => (
                    <option key={a.id} value={a.id}>
                      {(a.accountKind === 'cash' || a.accountKind === 'wallet' ? '💵 ' : '🏦 ')}
                      {formatBankAccountOptionLabel(a)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-dark-500 mt-1">Descontará el saldo de la cuenta en la moneda del gasto.</p>
              </div>

              <div>
                <label className="label">Notas</label>
                <textarea
                  value={expenseFormData.notes}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })}
                  rows={3}
                  className="input w-full"
                />
              </div>

              <div className="flex gap-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingExpense ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowExpenseModal(false);
                    resetExpenseForm();
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

export default Vehicles;
