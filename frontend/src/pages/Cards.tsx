import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useModalFocusTrap } from '../hooks/useModalFocusTrap';
import api from '../services/api';
import { CreditCard } from '../types';
import { Plus, Edit, Trash2, CreditCard as CardIcon, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';

/** Monto para línea de pago mínimo: $0 sin decimales; resto con 2 decimales (es-DO). */
function formatMinPaymentAmount(value: number | undefined | null): string {
  const n = Number(value ?? 0);
  if (n === 0) return '0';
  return n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const Cards: React.FC = () => {
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [bankFilter, setBankFilter] = useState('');
  const [summary, setSummary] = useState({ totalDebtDop: 0, totalDebtUsd: 0, totalMinPaymentDop: 0, totalMinPaymentUsd: 0, totalCards: 0 });
  const [formData, setFormData] = useState({
    bankName: '',
    cardName: '',
    creditLimitDop: '',
    creditLimitUsd: '',
    currentDebtDop: '',
    currentDebtUsd: '',
    minimumPaymentDop: '',
    minimumPaymentUsd: '',
    cutOffDay: '',
    paymentDueDay: '',
    currencyType: 'DOP' as 'DOP' | 'USD' | 'DUAL',
  });

  useEffect(() => {
    fetchCards();
  }, []);

  const fetchCards = async () => {
    try {
      const params: any = {};
      if (searchTerm) params.search = searchTerm;
      if (bankFilter) params.bank = bankFilter;
      
      const response = await api.get('/cards', { params });
      setCards(response.data.cards);
      setSummary(response.data.summary || { totalDebtDop: 0, totalDebtUsd: 0, totalMinPaymentDop: 0, totalMinPaymentUsd: 0, totalCards: 0 });
    } catch (error: any) {
      toast.error('Error al cargar tarjetas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, [searchTerm, bankFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        creditLimitDop: formData.creditLimitDop ? parseFloat(formData.creditLimitDop) : null,
        creditLimitUsd: formData.creditLimitUsd ? parseFloat(formData.creditLimitUsd) : null,
        currentDebtDop: formData.currentDebtDop ? parseFloat(formData.currentDebtDop) : 0,
        currentDebtUsd: formData.currentDebtUsd ? parseFloat(formData.currentDebtUsd) : 0,
        minimumPaymentDop: formData.minimumPaymentDop ? parseFloat(formData.minimumPaymentDop) : null,
        minimumPaymentUsd: formData.minimumPaymentUsd ? parseFloat(formData.minimumPaymentUsd) : null,
        cutOffDay: parseInt(formData.cutOffDay),
        paymentDueDay: parseInt(formData.paymentDueDay),
      };

      if (editingCard) {
        await api.put(`/cards/${editingCard.id}`, data);
        toast.success('Tarjeta actualizada');
      } else {
        await api.post('/cards', data);
        toast.success('Tarjeta creada');
      }

      setShowModal(false);
      resetForm();
      fetchCards();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al guardar tarjeta');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('¿Estás seguro de eliminar esta tarjeta?')) return;

    try {
      await api.delete(`/cards/${id}`);
      toast.success('Tarjeta eliminada');
      fetchCards();
    } catch (error: any) {
      toast.error('Error al eliminar tarjeta');
    }
  };

  const handleEdit = (card: CreditCard) => {
    setEditingCard(card);
    setFormData({
      bankName: card.bankName,
      cardName: card.cardName,
      creditLimitDop: card.creditLimitDop.toString(),
      creditLimitUsd: card.creditLimitUsd.toString(),
      currentDebtDop: card.currentDebtDop.toString(),
      currentDebtUsd: card.currentDebtUsd.toString(),
      minimumPaymentDop: (card.minimumPaymentDop || 0).toString(),
      minimumPaymentUsd: (card.minimumPaymentUsd || 0).toString(),
      cutOffDay: card.cutOffDay.toString(),
      paymentDueDay: card.paymentDueDay.toString(),
      currencyType: card.currencyType,
    });
    setShowModal(true);
  };

  const resetForm = () => {
    setFormData({
      bankName: '',
      cardName: '',
      creditLimitDop: '',
      creditLimitUsd: '',
      currentDebtDop: '',
      currentDebtUsd: '',
      minimumPaymentDop: '',
      minimumPaymentUsd: '',
      cutOffDay: '',
      paymentDueDay: '',
      currencyType: 'DOP',
    });
    setEditingCard(null);
  };

  useEscapeKey(showModal, () => {
    setShowModal(false);
    resetForm();
  });
  useModalFocusTrap(modalPanelRef, showModal);

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
    </div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="min-w-0">
          <h1 className="page-title">Tarjetas de Crédito</h1>
          <p className="text-dark-400 text-sm sm:text-base">Gestiona tus tarjetas de crédito</p>
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
          <span>Agregar Tarjeta</span>
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div className="card">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <p className="text-dark-400 text-sm mb-1">Deudas Totales DOP</p>
              <p className="text-2xl font-bold text-white">{summary.totalDebtDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Deudas Totales USD</p>
              <p className="text-2xl font-bold text-white">{summary.totalDebtUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Pagos Mínimos DOP</p>
              <p className="text-2xl font-bold text-white">{summary.totalMinPaymentDop.toLocaleString('es-DO', { minimumFractionDigits: 2 })} DOP</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Pagos Mínimos USD</p>
              <p className="text-2xl font-bold text-white">{summary.totalMinPaymentUsd.toLocaleString('es-DO', { minimumFractionDigits: 2 })} USD</p>
            </div>
            <div>
              <p className="text-dark-400 text-sm mb-1">Cantidad de Tarjetas</p>
              <p className="text-2xl font-bold text-white">{summary.totalCards}</p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      {cards.length > 0 && (
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
                {Array.from(new Set(cards.map(c => c.bankName))).map((bank) => (
                  <option key={bank} value={bank}>{bank}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="card text-center py-12">
          <CardIcon className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <p className="text-dark-400 mb-4">No tienes tarjetas registradas</p>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            Agregar Primera Tarjeta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{card.cardName}</h3>
                  <p className="text-sm text-dark-400">{card.bankName}</p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => handleEdit(card)}
                    className="p-2 text-primary-400 hover:text-primary-300"
                  >
                    <Edit size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(card.id)}
                    className="p-2 text-red-400 hover:text-red-300"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-dark-400">Límite:</span>
                  <span className="text-white font-medium">
                    {card.currencyType === 'DOP' && `$${card.creditLimitDop.toLocaleString('es-DO')} DOP`}
                    {card.currencyType === 'USD' && `$${card.creditLimitUsd.toLocaleString('es-DO')} USD`}
                    {card.currencyType === 'DUAL' && `$${card.creditLimitDop.toLocaleString('es-DO')} DOP / $${card.creditLimitUsd.toLocaleString('es-DO')} USD`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Deuda:</span>
                  <span className="text-red-400 font-medium">
                    {card.currencyType === 'DOP' && `$${card.currentDebtDop.toLocaleString('es-DO')} DOP`}
                    {card.currencyType === 'USD' && `$${card.currentDebtUsd.toLocaleString('es-DO')} USD`}
                    {card.currencyType === 'DUAL' && `$${card.currentDebtDop.toLocaleString('es-DO')} DOP / $${card.currentDebtUsd.toLocaleString('es-DO')} USD`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Pago Mínimo:</span>
                  <span className="text-yellow-400 font-medium">
                    {card.currencyType === 'DOP' &&
                      `$${formatMinPaymentAmount(card.minimumPaymentDop)} DOP`}
                    {card.currencyType === 'USD' &&
                      `$${formatMinPaymentAmount(card.minimumPaymentUsd)} USD`}
                    {card.currencyType === 'DUAL' &&
                      `$${formatMinPaymentAmount(card.minimumPaymentDop)} DOP / $${formatMinPaymentAmount(card.minimumPaymentUsd)} USD`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Corte:</span>
                  <span className="text-white">Día {card.cutOffDay}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-400">Vencimiento:</span>
                  <span className="text-white">Día {card.paymentDueDay}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card modal-sheet max-w-2xl w-full"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cards-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="cards-modal-title" className="text-2xl font-bold text-white mb-6">
              {editingCard ? 'Editar Tarjeta' : 'Nueva Tarjeta'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Banco</label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">Nombre de Tarjeta</label>
                  <input
                    type="text"
                    value={formData.cardName}
                    onChange={(e) => setFormData({ ...formData, cardName: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Tipo de Moneda</label>
                <select
                  value={formData.currencyType}
                  onChange={(e) => setFormData({ ...formData, currencyType: e.target.value as any })}
                  className="input w-full"
                  required
                >
                  <option value="DOP">DOP</option>
                  <option value="USD">USD</option>
                  <option value="DUAL">DUAL</option>
                </select>
              </div>

              {(formData.currencyType === 'DOP' || formData.currencyType === 'DUAL') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Límite de Crédito (DOP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.creditLimitDop}
                      onChange={(e) => setFormData({ ...formData, creditLimitDop: e.target.value })}
                      className="input w-full"
                      required={formData.currencyType === 'DOP'}
                    />
                  </div>
                  <div>
                    <label className="label">Deuda Actual (DOP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.currentDebtDop}
                      onChange={(e) => setFormData({ ...formData, currentDebtDop: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="label">Pago Mínimo (DOP)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.minimumPaymentDop}
                      onChange={(e) => setFormData({ ...formData, minimumPaymentDop: e.target.value })}
                      className="input w-full"
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              )}

              {(formData.currencyType === 'USD' || formData.currencyType === 'DUAL') && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Límite de Crédito (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.creditLimitUsd}
                      onChange={(e) => setFormData({ ...formData, creditLimitUsd: e.target.value })}
                      className="input w-full"
                      required={formData.currencyType === 'USD'}
                    />
                  </div>
                  <div>
                    <label className="label">Deuda Actual (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.currentDebtUsd}
                      onChange={(e) => setFormData({ ...formData, currentDebtUsd: e.target.value })}
                      className="input w-full"
                    />
                  </div>
                  <div>
                    <label className="label">Pago Mínimo (USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.minimumPaymentUsd}
                      onChange={(e) => setFormData({ ...formData, minimumPaymentUsd: e.target.value })}
                      className="input w-full"
                      placeholder="Opcional"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Día de Corte</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.cutOffDay}
                    onChange={(e) => setFormData({ ...formData, cutOffDay: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="label">Día Límite de Pago</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.paymentDueDay}
                    onChange={(e) => setFormData({ ...formData, paymentDueDay: e.target.value })}
                    className="input w-full"
                    required
                  />
                </div>
              </div>

              <div className="flex space-x-4 pt-4">
                <button type="submit" className="btn-primary flex-1">
                  {editingCard ? 'Actualizar' : 'Crear'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
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

export default Cards;
