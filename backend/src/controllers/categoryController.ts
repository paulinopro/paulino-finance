import { Response } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import {
  resolveCategoryIconCreate,
  resolveCategoryColorCreate,
  resolveCategoryIconUpdate,
  resolveCategoryColorUpdate,
} from '../services/categoryFieldValidation';

export const getCategories = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const result = await query(
      `SELECT id, name, icon, color, created_at
       FROM expense_categories
       WHERE user_id = $1
       ORDER BY name ASC`,
      [userId]
    );

    res.json({
      success: true,
      categories: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        icon: row.icon != null ? String(row.icon) : null,
        color: row.color != null ? String(row.color) : null,
        createdAt: row.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Get categories error:', error);
    res.status(500).json({ message: 'Error fetching categories', error: error.message });
  }
};

export const createCategory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { name } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({ message: 'Category name is required' });
    }

    let icon: string | null;
    let color: string | null;
    try {
      icon = resolveCategoryIconCreate(req.body.icon);
      color = resolveCategoryColorCreate(req.body.color);
    } catch (e: any) {
      return res.status(400).json({ message: e.message || 'Datos inválidos' });
    }

    const result = await query(
      `INSERT INTO expense_categories (user_id, name, icon, color)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, name) DO NOTHING
       RETURNING id, name, icon, color, created_at`,
      [userId, name.trim(), icon, color]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ message: 'Category already exists' });
    }

    res.status(201).json({
      success: true,
      message: 'Category created successfully',
      category: {
        id: result.rows[0].id,
        name: result.rows[0].name,
        icon: result.rows[0].icon != null ? String(result.rows[0].icon) : null,
        color: result.rows[0].color != null ? String(result.rows[0].color) : null,
        createdAt: result.rows[0].created_at,
      },
    });
  } catch (error: any) {
    console.error('Create category error:', error);
    res.status(500).json({ message: 'Error creating category', error: error.message });
  }
};

export const updateCategory = async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const categoryId = parseInt(req.params.id, 10);
  const { name } = req.body;

  if (Number.isNaN(categoryId)) {
    return res.status(400).json({ message: 'ID inválido' });
  }
  if (!name || String(name).trim() === '') {
    return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
  }

  const newName = String(name).trim();

  const client = await getClient();

  try {
    await client.query('BEGIN');
    const sel = await client.query<{
      name: string;
      created_at: Date;
      icon: string | null;
      color: string | null;
    }>(
      `SELECT name, created_at, icon, color FROM expense_categories WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [categoryId, userId]
    );

    if (sel.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    const row = sel.rows[0];
    const oldName = row.name;
    const createdAt = row.created_at;
    const pi = row.icon != null ? String(row.icon) : null;
    const pc = row.color != null ? String(row.color) : null;

    let nextIconResolved: string | null;
    let nextColorResolved: string | null;
    try {
      const iu = resolveCategoryIconUpdate(req.body.icon, pi);
      const cu = resolveCategoryColorUpdate(req.body.color, pc);
      nextIconResolved = iu === undefined ? pi : iu;
      nextColorResolved = cu === undefined ? pc : cu;
    } catch (e: any) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: e.message || 'Datos inválidos' });
    }

    await client.query(
      `UPDATE expense_categories
       SET name = $1,
           icon = $2,
           color = $3
       WHERE id = $4 AND user_id = $5`,
      [newName, nextIconResolved, nextColorResolved, categoryId, userId]
    );

    if (oldName !== newName) {
      await client.query(
        `UPDATE expenses SET category = $1 WHERE user_id = $2 AND category = $3`,
        [newName, userId, oldName]
      );

      await client.query(
        `UPDATE vehicle_expenses SET category = $1 WHERE user_id = $2 AND category = $3`,
        [newName, userId, oldName]
      );

      await client.query(
        `UPDATE budgets SET category = $1 WHERE user_id = $2 AND category = $3`,
        [newName, userId, oldName]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Categoría actualizada',
      category: {
        id: categoryId,
        name: newName,
        icon: nextIconResolved,
        color: nextColorResolved,
        createdAt,
      },
    });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => undefined);
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });
    }
    console.error('Update category error:', error);
    res.status(500).json({ message: 'Error al actualizar la categoría', error: error.message });
  } finally {
    client.release();
  }
};

export const deleteCategory = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const categoryId = parseInt(req.params.id);

    const result = await query(
      'DELETE FROM expense_categories WHERE id = $1 AND user_id = $2 RETURNING id',
      [categoryId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Category not found' });
    }

    res.json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete category error:', error);
    res.status(500).json({ message: 'Error deleting category', error: error.message });
  }
};
