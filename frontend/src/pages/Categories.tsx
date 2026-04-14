import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { ExpenseCategory } from '../types';
import { Plus, Trash2, Tag, Search, Pencil, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

const Categories: React.FC = () => {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      setCategories(response.data.categories);
    } catch (error: any) {
      toast.error('Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error('El nombre de la categoría es requerido');
      return;
    }

    try {
      await api.post('/categories', { name: newCategoryName.trim() });
      toast.success('Categoría creada');
      setNewCategoryName('');
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al crear categoría');
    }
  };

  const startEdit = (category: ExpenseCategory) => {
    setEditingId(category.id);
    setEditName(category.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEdit = async (id: number) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error('El nombre no puede estar vacío');
      return;
    }
    setSavingId(id);
    try {
      await api.put(`/categories/${id}`, { name: trimmed });
      toast.success('Categoría actualizada');
      cancelEdit();
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al actualizar categoría');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta categoría?')) {
      return;
    }

    try {
      await api.delete(`/categories/${id}`);
      toast.success('Categoría eliminada');
      if (editingId === id) cancelEdit();
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Error al eliminar categoría');
    }
  };

  const filteredCategories = categories.filter((category) =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Categorías</h1>
        <p className="text-dark-400 text-sm sm:text-base">Gestiona las categorías de gastos</p>
      </div>

      {/* Add Category */}
      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Tag className="w-6 h-6 text-primary-400 shrink-0" />
          <h2 className="text-lg sm:text-xl font-semibold text-white">Nueva Categoría</h2>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <input
            type="text"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            className="input flex-1 min-w-0"
            placeholder="Nombre de la categoría"
          />
          <button type="button" onClick={handleAddCategory} className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto">
            <Plus size={20} />
            Agregar
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
          <input
            type="text"
            placeholder="Buscar categorías..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Categories List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCategories.length === 0 ? (
          <div className="card text-center py-12 col-span-full">
            <Tag className="mx-auto text-dark-400 mb-4" size={48} />
            <p className="text-dark-400">No hay categorías</p>
          </div>
        ) : (
          filteredCategories.map((category) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="card"
            >
              {editingId === category.id ? (
                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveEdit(category.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className="input w-full"
                    autoFocus
                    disabled={savingId === category.id}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={savingId === category.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-dark-300 hover:bg-dark-700 text-sm"
                    >
                      <X size={18} />
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEdit(category.id)}
                      disabled={savingId === category.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm"
                    >
                      <Check size={18} />
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
                      <Tag className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-white font-medium truncate">{category.name}</span>
                  </div>
                  <div className="flex items-center shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => startEdit(category)}
                      className="p-2 text-primary-400 hover:bg-primary-400/10 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteCategory(category.id)}
                      className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default Categories;
