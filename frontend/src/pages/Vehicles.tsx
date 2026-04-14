import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { Plus, Edit, Trash2, Search, X, Car, Wrench, DollarSign, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

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
  expenseType: string;
  description: string;
  amount: number;
  currency: string;
  date: string;
  mileageAtExpense?: number;
  category?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const Vehicles: React.FC = () => {
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
    expenseType: '',
    description: '',
    amount: '',
    currency: 'DOP',
    date: new Date().toISOString().split('T')[0],
    mileageAtExpense: '',
    category: '',
    notes: '',
  });

  useEffect(() => {
    fetchVehicles();
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

    try {
      const data = {
        ...expenseFormData,
        amount: parseFloat(expenseFormData.amount),
        mileageAtExpense: expenseFormData.mileageAtExpense ? parseFloat(expenseFormData.mileageAtExpense) : null,
      };

      if (editingExpense) {
        await api.put(`/vehicles/${selectedVehicle.id}/expenses/${editingExpense.id}`, data);
        toast.success('Gasto actualizado');
      } else {
        await api.post(`/vehicles/${selectedVehicle.id}/expenses`, data);
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
      expenseType: '',
      description: '',
      amount: '',
      currency: 'DOP',
      date: new Date().toISOString().split('T')[0],
      mileageAtExpense: '',
      category: '',
      notes: '',
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
      expenseType: expense.expenseType,
      description: expense.description,
      amount: expense.amount.toString(),
      currency: expense.currency,
      date: expense.date,
      mileageAtExpense: expense.mileageAtExpense?.toString() || '',
      category: expense.category || '',
      notes: expense.notes || '',
    });
    setShowExpenseModal(true);
  };

  const filteredVehicles = vehicles.filter((vehicle) =>
    `${vehicle.make} ${vehicle.model}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    vehicle.licensePlate?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const expenseTypes = [
    'Mantenimiento',
    'Reparación',
    'Combustible',
    'Seguro',
    'Impuestos',
    'Piezas',
    'Lavado',
    'Otro',
  ];

  const expensesByType = expenses.reduce((acc, expense) => {
    acc[expense.expenseType] = (acc[expense.expenseType] || 0) + expense.amount;
    return acc;
  }, {} as { [key: string]: number });

  const expensesChartData = Object.entries(expensesByType).map(([name, value]) => ({
    name,
    value: Math.round(value),
  }));

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Vehículos</h1>
          <p className="text-dark-400 text-sm sm:text-base">Gestiona tus vehículos y sus gastos</p>
        </div>
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
      </div>

      {/* Search */}
      <div className="card">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vehicles List */}
        <div className="lg:col-span-1 space-y-4">
          {filteredVehicles.length === 0 ? (
            <div className="card text-center py-12">
              <Car className="mx-auto text-dark-400 mb-4" size={48} />
              <p className="text-dark-400">No hay vehículos</p>
            </div>
          ) : (
            filteredVehicles.map((vehicle) => (
              <motion.div
                key={vehicle.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`card cursor-pointer transition-all ${
                  selectedVehicle?.id === vehicle.id ? 'ring-2 ring-primary-500' : ''
                }`}
                onClick={() => setSelectedVehicle(vehicle)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Car className="text-primary-400" size={20} />
                      <h3 className="text-lg font-semibold text-white">
                        {vehicle.make} {vehicle.model}
                      </h3>
                    </div>
                    {vehicle.year && (
                      <p className="text-sm text-dark-400 mb-1">Año: {vehicle.year}</p>
                    )}
                    {vehicle.licensePlate && (
                      <p className="text-sm text-dark-400 mb-1">Placa: {vehicle.licensePlate}</p>
                    )}
                    <p className="text-sm text-dark-400 mb-2">Kilometraje: {vehicle.mileage.toLocaleString('es-DO')} km</p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-dark-400">Gastos totales:</p>
                      <p className="text-sm font-semibold text-red-400">
                        ${vehicle.totalExpenses.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditVehicle(vehicle);
                      }}
                      className="p-2 text-primary-400 hover:bg-primary-400/10 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteVehicle(vehicle.id);
                      }}
                      className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Vehicle Details and Expenses */}
        <div className="lg:col-span-2">
          {selectedVehicle ? (
            <div className="space-y-6">
              {/* Vehicle Info */}
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-white">
                    {selectedVehicle.make} {selectedVehicle.model}
                  </h2>
                  <button
                    onClick={() => {
                      resetExpenseForm();
                      setShowExpenseModal(true);
                    }}
                    className="btn-primary flex items-center gap-2"
                  >
                    <Plus size={18} />
                    Agregar Gasto
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  {selectedVehicle.year && (
                    <div>
                      <p className="text-dark-400">Año</p>
                      <p className="text-white font-medium">{selectedVehicle.year}</p>
                    </div>
                  )}
                  {selectedVehicle.licensePlate && (
                    <div>
                      <p className="text-dark-400">Placa</p>
                      <p className="text-white font-medium">{selectedVehicle.licensePlate}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-dark-400">Kilometraje</p>
                    <p className="text-white font-medium">{selectedVehicle.mileage.toLocaleString('es-DO')} km</p>
                  </div>
                  {selectedVehicle.purchasePrice && (
                    <div>
                      <p className="text-dark-400">Precio de Compra</p>
                      <p className="text-white font-medium">
                        ${selectedVehicle.purchasePrice.toLocaleString('es-DO', { minimumFractionDigits: 2 })}{' '}
                        {selectedVehicle.currency}
                      </p>
                    </div>
                  )}
                </div>
                {selectedVehicle.notes && (
                  <div className="mt-4">
                    <p className="text-dark-400 text-sm">Notas: {selectedVehicle.notes}</p>
                  </div>
                )}
              </div>

              {/* Expenses Chart */}
              {expenses.length > 0 && (
                <div className="card">
                  <h3 className="text-lg font-semibold text-white mb-4">Gastos por Tipo</h3>
                  <div className="chart-box h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expensesChartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {expensesChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#f43f5e', '#fb923c'][index % 8]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Expenses List */}
              <div className="card">
                <h3 className="text-lg font-semibold text-white mb-4">Historial de Gastos</h3>
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
                              {expense.expenseType}
                            </span>
                            {expense.category && (
                              <span className="px-2 py-1 bg-dark-600 text-dark-300 rounded text-xs">
                                {expense.category}
                              </span>
                            )}
                          </div>
                          <h4 className="text-white font-medium mb-1">{expense.description}</h4>
                          <div className="flex items-center gap-4 text-sm text-dark-400">
                            <span>
                              ${expense.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })} {expense.currency}
                            </span>
                            <span>{new Date(expense.date).toLocaleDateString('es-DO')}</span>
                            {expense.mileageAtExpense && (
                              <span>{expense.mileageAtExpense.toLocaleString('es-DO')} km</span>
                            )}
                          </div>
                          {expense.notes && (
                            <p className="text-xs text-dark-400 mt-2">Notas: {expense.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => openEditExpense(expense)}
                            className="p-2 text-primary-400 hover:bg-primary-400/10 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Edit size={18} />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card text-center py-12">
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
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Tipo de Gasto *</label>
                <select
                  value={expenseFormData.expenseType}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, expenseType: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                >
                  <option value="">Seleccionar...</option>
                  {expenseTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Descripción *</label>
                <input
                  type="text"
                  value={expenseFormData.description}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, description: e.target.value })}
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
                    value={expenseFormData.amount}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, amount: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Moneda *</label>
                  <select
                    value={expenseFormData.currency}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, currency: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="DOP">DOP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Fecha *</label>
                  <input
                    type="date"
                    value={expenseFormData.date}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, date: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Kilometraje</label>
                  <input
                    type="number"
                    step="0.01"
                    value={expenseFormData.mileageAtExpense}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, mileageAtExpense: e.target.value })}
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Categoría</label>
                <input
                  type="text"
                  value={expenseFormData.category}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, category: e.target.value })}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Notas</label>
                <textarea
                  value={expenseFormData.notes}
                  onChange={(e) => setExpenseFormData({ ...expenseFormData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
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
