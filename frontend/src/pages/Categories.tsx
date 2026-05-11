import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { ExpenseCategory } from '../types';
import { Plus, Trash2, Tag, Search, Pencil, Check, X, Palette } from 'lucide-react';
import toast from 'react-hot-toast';
import { TABLE_PAGE_SIZE } from '../constants/pagination';
import { usePersistedTablePageSize } from '../hooks/usePersistedTablePageSize';
import TablePagination from '../components/TablePagination';
import PageHeader from '../components/PageHeader';
import { useTranslation } from 'react-i18next';
import {
  EXPENSE_CATEGORY_DEFAULT_PRESETS,
  EXPENSE_CATEGORY_PRESET_ORDER,
  EXPENSE_CATEGORY_SWATCHES,
} from '../constants/expenseCategoryDefaults';
import { CategoryGlyph } from '../components/categoryIconCatalog';
import { LucideVisualIconSelect } from '../components/LucideVisualIconSelect';

function normalizeColorInput(hex: string | null | undefined): string {
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return '#64748b';
  return `#${hex.slice(1).toLowerCase()}`;
}

const Categories: React.FC = () => {
  const { t } = useTranslation();
  const { pageSize: catPageSize, setPageSize: setCatPageSize, pageSizeOptions: catPageSizeOptions } =
    usePersistedTablePageSize('pf:pageSize:categories', TABLE_PAGE_SIZE);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('Tag');
  const [newCategoryColor, setNewCategoryColor] = useState('#64748b');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('Tag');
  const [editColor, setEditColor] = useState('#64748b');
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const response = await api.get('/categories');
      setCategories(response.data.categories);
    } catch {
      toast.error(t('toast.categories.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const presetSuggestion = useMemo(() => {
    const nameLower = newCategoryName.trim().toLowerCase();
    if (!nameLower) return undefined;
    return EXPENSE_CATEGORY_DEFAULT_PRESETS.find((p) => p.name.toLowerCase() === nameLower);
  }, [newCategoryName]);

  const applyPresetToNewForm = () => {
    if (!presetSuggestion) return;
    setNewCategoryIcon(presetSuggestion.icon);
    setNewCategoryColor(normalizeColorInput(presetSuggestion.color));
    toast.success(t('toast.categories.suggestionsApplied'));
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error(t('toast.categories.nameRequired'));
      return;
    }

    try {
      await api.post('/categories', {
        name: newCategoryName.trim(),
        icon: newCategoryIcon.trim() || null,
        color: normalizeColorInput(newCategoryColor),
      });
      toast.success(t('toast.categories.created'));
      setNewCategoryName('');
      setNewCategoryIcon('Tag');
      setNewCategoryColor('#64748b');
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.categories.createError'));
    }
  };

  const startEdit = (category: ExpenseCategory) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditIcon(category.icon?.trim() || 'Tag');
    setEditColor(normalizeColorInput(category.color));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditIcon('Tag');
    setEditColor('#64748b');
  };

  const saveEdit = async (id: number) => {
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error(t('toast.categories.nameEmpty'));
      return;
    }
    setSavingId(id);
    try {
      await api.put(`/categories/${id}`, {
        name: trimmed,
        icon: editIcon.trim() || '',
        color: normalizeColorInput(editColor),
      });
      toast.success(t('toast.categories.updated'));
      cancelEdit();
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.categories.updateError'));
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteCategory = async (id: number) => {
    if (!window.confirm(t('confirm.deleteCategory'))) {
      return;
    }

    try {
      await api.delete(`/categories/${id}`);
      toast.success(t('toast.categories.deleted'));
      if (editingId === id) cancelEdit();
      fetchCategories();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('toast.categories.deleteError'));
    }
  };

  const filteredCategories = useMemo(() => {
    const f = categories.filter((category) =>
      category.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    return f.sort((a, b) => {
      const oa = EXPENSE_CATEGORY_PRESET_ORDER[a.name];
      const ob = EXPENSE_CATEGORY_PRESET_ORDER[b.name];
      if (oa !== undefined && ob !== undefined) return oa - ob;
      if (oa !== undefined) return -1;
      if (ob !== undefined) return 1;
      return a.name.localeCompare(b.name, 'es');
    });
  }, [categories, searchTerm]);

  const [listPage, setListPage] = useState(1);
  useEffect(() => {
    setListPage(1);
  }, [searchTerm, catPageSize]);
  const catTotalPages = Math.max(1, Math.ceil(filteredCategories.length / catPageSize));
  const catPageSafe = Math.min(listPage, catTotalPages);
  useEffect(() => {
    setListPage((p) => Math.min(p, catTotalPages));
  }, [catTotalPages]);
  const pagedCategories = useMemo(() => {
    const start = (catPageSafe - 1) * catPageSize;
    return filteredCategories.slice(start, start + catPageSize);
  }, [filteredCategories, catPageSafe, catPageSize]);

  const ColorToolbar = ({
    value,
    onChange,
    disabled,
  }: {
    value: string;
    onChange: (hex: string) => void;
    disabled?: boolean;
  }) => (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-2">
        {EXPENSE_CATEGORY_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            title={c}
            onClick={() => onChange(normalizeColorInput(c))}
            className={[
              'h-9 w-9 rounded-full ring-2 transition-shadow shrink-0',
              normalizeColorInput(value).toLowerCase() === normalizeColorInput(c).toLowerCase()
                ? 'ring-primary-400 shadow-lg shadow-primary-500/20 scale-105'
                : 'ring-dark-600 hover:ring-dark-400',
              disabled ? 'opacity-40' : '',
            ].join(' ')}
            style={{ backgroundColor: c }}
            aria-label={t('common.iconSelect.colorSwatchAria', { color: c })}
          />
        ))}
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-dark-300 shrink-0">
        <span className="inline-flex rounded-lg bg-dark-700 p-2 border border-dark-600">
          <Palette size={18} />
        </span>
        <input
          type="color"
          value={normalizeColorInput(value)}
          onChange={(e) => onChange(normalizeColorInput(e.target.value))}
          disabled={disabled}
          className="h-10 w-[4.25rem] cursor-pointer rounded border border-dark-600 bg-dark-800 p-1 disabled:opacity-40"
        />
      </label>
    </div>
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
      <PageHeader
        title={t('pages.categories.title')}
        subtitle={t('pages.categories.subtitle')}
      />

      <div className="card">
        <div className="flex items-center space-x-3 mb-4">
          <Tag className="w-6 h-6 text-primary-400 shrink-0" />
          <h2 className="text-lg sm:text-xl font-semibold text-white">
            {t('pages.categories.newCategoryHeading')}
          </h2>
        </div>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleAddCategory()}
              className="input flex-1 min-w-0"
              placeholder={t('pages.categories.newPlaceholder')}
            />
            <button
              type="button"
              onClick={() => void handleAddCategory()}
              className="btn-primary flex items-center justify-center gap-2 shrink-0 w-full sm:w-auto"
            >
              <Plus size={20} />
              {t('pages.categories.addButton')}
            </button>
          </div>
          {presetSuggestion && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-dark-300">
              <span>{t('pages.categories.presetSuggestion', { name: presetSuggestion.name })}</span>
              <button type="button" onClick={applyPresetToNewForm} className="btn-secondary text-xs py-1 px-2">
                {t('pages.categories.applyPreset')}
              </button>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wide text-dark-400 mb-2">{t('pages.categories.iconSection')}</p>
            <LucideVisualIconSelect value={newCategoryIcon} onChange={setNewCategoryIcon} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-dark-400 mb-2">{t('pages.categories.colorSection')}</p>
            <ColorToolbar value={newCategoryColor} onChange={setNewCategoryColor} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-dark-400" size={20} />
          <input
            type="text"
            placeholder={t('pages.categories.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>

      {filteredCategories.length === 0 ? (
        <div className="card text-center py-12">
          <Tag className="mx-auto text-dark-400 mb-4" size={48} />
          <p className="text-dark-400">{t('pages.categories.emptyState')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedCategories.map((category) => {
              const bg = normalizeColorInput(category.color);
              return (
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
                      <div>
                        <p className="text-xs uppercase tracking-wide text-dark-400 mb-2">{t('pages.categories.iconSection')}</p>
                        <LucideVisualIconSelect
                          value={editIcon}
                          onChange={setEditIcon}
                          disabled={savingId === category.id}
                        />
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-dark-400 mb-2">{t('pages.categories.colorSection')}</p>
                        <ColorToolbar value={editColor} onChange={setEditColor} disabled={savingId === category.id} />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={savingId === category.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-dark-300 hover:bg-dark-700 text-sm"
                        >
                          <X size={18} />
                          {t('common.actions.cancel')}
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit(category.id)}
                          disabled={savingId === category.id}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm"
                        >
                          <Check size={18} />
                          {t('common.actions.save')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-inner ring-2 ring-black/25"
                          style={{ backgroundColor: bg }}
                        >
                          <CategoryGlyph
                            iconKey={category.icon}
                            className="h-6 w-6 text-white drop-shadow"
                            strokeWidth={2}
                          />
                        </div>
                        <div className="min-w-0">
                          <span className="text-white font-medium truncate block">{category.name}</span>
                          {(category.icon || category.color) && (
                            <span className="text-[0.65rem] text-dark-500 font-mono truncate block">
                              {category.icon ?? t('pages.categories.noIcon')}
                              {category.color ? ` · ${category.color}` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center shrink-0 gap-0.5">
                        <button
                          type="button"
                          onClick={() => startEdit(category)}
                          className="p-2 text-primary-400 hover:bg-primary-400/10 rounded-lg transition-colors"
                          title={t('pages.categories.editTitle')}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(category.id)}
                          className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          title={t('pages.categories.deleteTitle')}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
          <TablePagination
            className="mt-4 sm:mt-5"
            currentPage={catPageSafe}
            totalPages={catTotalPages}
            totalItems={filteredCategories.length}
            itemsPerPage={catPageSize}
            onPageChange={setListPage}
            itemLabel={t('pages.categories.itemsLabel')}
            variant="card"
            pageSizeOptions={catPageSizeOptions}
            onPageSizeChange={setCatPageSize}
          />
        </>
      )}
    </div>
  );
};

export default Categories;
