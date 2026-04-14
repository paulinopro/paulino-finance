"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategories = void 0;
const database_1 = require("../config/database");
const getCategories = async (req, res) => {
    try {
        const userId = req.userId;
        const result = await (0, database_1.query)(`SELECT id, name, created_at
       FROM expense_categories
       WHERE user_id = $1
       ORDER BY name ASC`, [userId]);
        res.json({
            success: true,
            categories: result.rows.map((row) => ({
                id: row.id,
                name: row.name,
                createdAt: row.created_at,
            })),
        });
    }
    catch (error) {
        console.error('Get categories error:', error);
        res.status(500).json({ message: 'Error fetching categories', error: error.message });
    }
};
exports.getCategories = getCategories;
const createCategory = async (req, res) => {
    try {
        const userId = req.userId;
        const { name } = req.body;
        if (!name || name.trim() === '') {
            return res.status(400).json({ message: 'Category name is required' });
        }
        const result = await (0, database_1.query)(`INSERT INTO expense_categories (user_id, name)
       VALUES ($1, $2)
       ON CONFLICT (user_id, name) DO NOTHING
       RETURNING id, name, created_at`, [userId, name.trim()]);
        if (result.rows.length === 0) {
            return res.status(409).json({ message: 'Category already exists' });
        }
        res.status(201).json({
            success: true,
            message: 'Category created successfully',
            category: {
                id: result.rows[0].id,
                name: result.rows[0].name,
                createdAt: result.rows[0].created_at,
            },
        });
    }
    catch (error) {
        console.error('Create category error:', error);
        res.status(500).json({ message: 'Error creating category', error: error.message });
    }
};
exports.createCategory = createCategory;
const updateCategory = async (req, res) => {
    const userId = req.userId;
    const categoryId = parseInt(req.params.id, 10);
    const { name } = req.body;
    if (Number.isNaN(categoryId)) {
        return res.status(400).json({ message: 'ID inválido' });
    }
    if (!name || String(name).trim() === '') {
        return res.status(400).json({ message: 'El nombre de la categoría es obligatorio' });
    }
    const newName = String(name).trim();
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        const sel = await client.query(`SELECT name, created_at FROM expense_categories WHERE id = $1 AND user_id = $2 FOR UPDATE`, [categoryId, userId]);
        if (sel.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Categoría no encontrada' });
        }
        const oldName = sel.rows[0].name;
        const createdAt = sel.rows[0].created_at;
        if (oldName === newName) {
            await client.query('COMMIT');
            return res.json({
                success: true,
                category: {
                    id: categoryId,
                    name: newName,
                    createdAt,
                },
            });
        }
        await client.query(`UPDATE expense_categories SET name = $1 WHERE id = $2 AND user_id = $3`, [newName, categoryId, userId]);
        await client.query(`UPDATE expenses SET category = $1 WHERE user_id = $2 AND category = $3`, [newName, userId, oldName]);
        await client.query(`UPDATE vehicle_expenses SET category = $1 WHERE user_id = $2 AND category = $3`, [newName, userId, oldName]);
        await client.query(`UPDATE budgets SET category = $1 WHERE user_id = $2 AND category = $3`, [newName, userId, oldName]);
        await client.query('COMMIT');
        res.json({
            success: true,
            message: 'Categoría actualizada',
            category: {
                id: categoryId,
                name: newName,
                createdAt,
            },
        });
    }
    catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        if (error.code === '23505') {
            return res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });
        }
        console.error('Update category error:', error);
        res.status(500).json({ message: 'Error al actualizar la categoría', error: error.message });
    }
    finally {
        client.release();
    }
};
exports.updateCategory = updateCategory;
const deleteCategory = async (req, res) => {
    try {
        const userId = req.userId;
        const categoryId = parseInt(req.params.id);
        const result = await (0, database_1.query)('DELETE FROM expense_categories WHERE id = $1 AND user_id = $2 RETURNING id', [categoryId, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Category not found' });
        }
        res.json({
            success: true,
            message: 'Category deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ message: 'Error deleting category', error: error.message });
    }
};
exports.deleteCategory = deleteCategory;
//# sourceMappingURL=categoryController.js.map