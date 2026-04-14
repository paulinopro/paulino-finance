"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteVehicleExpense = exports.updateVehicleExpense = exports.createVehicleExpense = exports.getVehicleExpenses = exports.deleteVehicle = exports.updateVehicle = exports.createVehicle = exports.getVehicles = void 0;
const database_1 = require("../config/database");
const getVehicles = async (req, res) => {
    try {
        const userId = req.userId;
        const result = await (0, database_1.query)(`SELECT id, make, model, year, license_plate, color, mileage, purchase_date, purchase_price, currency, notes, created_at, updated_at
       FROM vehicles
       WHERE user_id = $1
       ORDER BY created_at DESC`, [userId]);
        // Get user's exchange rate once
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        const vehicles = await Promise.all(result.rows.map(async (vehicle) => {
            // Get total expenses for this vehicle
            const expensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
           FROM vehicle_expenses
           WHERE vehicle_id = $1
           GROUP BY currency`, [vehicle.id]);
            let totalExpenses = 0;
            expensesResult.rows.forEach((row) => {
                const amount = parseFloat(row.total || 0);
                totalExpenses += row.currency === 'USD' ? amount * exchangeRate : amount;
            });
            return {
                id: vehicle.id,
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                licensePlate: vehicle.license_plate,
                color: vehicle.color,
                mileage: parseFloat(vehicle.mileage || 0),
                purchaseDate: vehicle.purchase_date,
                purchasePrice: vehicle.purchase_price ? parseFloat(vehicle.purchase_price) : null,
                currency: vehicle.currency,
                notes: vehicle.notes,
                totalExpenses,
                createdAt: vehicle.created_at,
                updatedAt: vehicle.updated_at,
            };
        }));
        res.json({
            success: true,
            vehicles,
        });
    }
    catch (error) {
        console.error('Get vehicles error:', error);
        res.status(500).json({ message: 'Error fetching vehicles', error: error.message });
    }
};
exports.getVehicles = getVehicles;
const createVehicle = async (req, res) => {
    try {
        const userId = req.userId;
        const { make, model, year, licensePlate, color, mileage, purchaseDate, purchasePrice, currency, notes } = req.body;
        if (!make || !model) {
            return res.status(400).json({ message: 'Make and model are required' });
        }
        const result = await (0, database_1.query)(`INSERT INTO vehicles (user_id, make, model, year, license_plate, color, mileage, purchase_date, purchase_price, currency, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, make, model, year, license_plate, color, mileage, purchase_date, purchase_price, currency, notes, created_at, updated_at`, [
            userId,
            make,
            model,
            year || null,
            licensePlate || null,
            color || null,
            mileage || 0,
            purchaseDate || null,
            purchasePrice || null,
            currency || null,
            notes || null,
        ]);
        const vehicle = result.rows[0];
        res.status(201).json({
            success: true,
            vehicle: {
                id: vehicle.id,
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                licensePlate: vehicle.license_plate,
                color: vehicle.color,
                mileage: parseFloat(vehicle.mileage || 0),
                purchaseDate: vehicle.purchase_date,
                purchasePrice: vehicle.purchase_price ? parseFloat(vehicle.purchase_price) : null,
                currency: vehicle.currency,
                notes: vehicle.notes,
                totalExpenses: 0,
                createdAt: vehicle.created_at,
                updatedAt: vehicle.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Create vehicle error:', error);
        res.status(500).json({ message: 'Error creating vehicle', error: error.message });
    }
};
exports.createVehicle = createVehicle;
const updateVehicle = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { make, model, year, licensePlate, color, mileage, purchaseDate, purchasePrice, currency, notes } = req.body;
        const result = await (0, database_1.query)(`UPDATE vehicles
       SET make = COALESCE($1, make),
           model = COALESCE($2, model),
           year = COALESCE($3, year),
           license_plate = COALESCE($4, license_plate),
           color = COALESCE($5, color),
           mileage = COALESCE($6, mileage),
           purchase_date = COALESCE($7, purchase_date),
           purchase_price = COALESCE($8, purchase_price),
           currency = COALESCE($9, currency),
           notes = COALESCE($10, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND user_id = $12
       RETURNING id, make, model, year, license_plate, color, mileage, purchase_date, purchase_price, currency, notes, created_at, updated_at`, [make, model, year, licensePlate, color, mileage, purchaseDate, purchasePrice, currency, notes, id, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }
        const vehicle = result.rows[0];
        // Get user's exchange rate
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = parseFloat(userResult.rows[0]?.exchange_rate_dop_usd || 55);
        // Get total expenses
        const expensesResult = await (0, database_1.query)(`SELECT SUM(amount) as total, currency
       FROM vehicle_expenses
       WHERE vehicle_id = $1
       GROUP BY currency`, [id]);
        let totalExpenses = 0;
        expensesResult.rows.forEach((row) => {
            const amount = parseFloat(row.total || 0);
            totalExpenses += row.currency === 'USD' ? amount * exchangeRate : amount;
        });
        res.json({
            success: true,
            vehicle: {
                id: vehicle.id,
                make: vehicle.make,
                model: vehicle.model,
                year: vehicle.year,
                licensePlate: vehicle.license_plate,
                color: vehicle.color,
                mileage: parseFloat(vehicle.mileage || 0),
                purchaseDate: vehicle.purchase_date,
                purchasePrice: vehicle.purchase_price ? parseFloat(vehicle.purchase_price) : null,
                currency: vehicle.currency,
                notes: vehicle.notes,
                totalExpenses,
                createdAt: vehicle.created_at,
                updatedAt: vehicle.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update vehicle error:', error);
        res.status(500).json({ message: 'Error updating vehicle', error: error.message });
    }
};
exports.updateVehicle = updateVehicle;
const deleteVehicle = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const result = await (0, database_1.query)('DELETE FROM vehicles WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }
        res.json({
            success: true,
            message: 'Vehicle deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete vehicle error:', error);
        res.status(500).json({ message: 'Error deleting vehicle', error: error.message });
    }
};
exports.deleteVehicle = deleteVehicle;
const getVehicleExpenses = async (req, res) => {
    try {
        const userId = req.userId;
        const { vehicleId } = req.params;
        // Verify vehicle belongs to user
        const vehicleCheck = await (0, database_1.query)('SELECT id FROM vehicles WHERE id = $1 AND user_id = $2', [vehicleId, userId]);
        if (vehicleCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }
        const result = await (0, database_1.query)(`SELECT id, expense_type, description, amount, currency, date, mileage_at_expense, category, notes, created_at, updated_at
       FROM vehicle_expenses
       WHERE vehicle_id = $1
       ORDER BY date DESC, created_at DESC`, [vehicleId]);
        res.json({
            success: true,
            expenses: result.rows.map((row) => ({
                id: row.id,
                expenseType: row.expense_type,
                description: row.description,
                amount: parseFloat(row.amount),
                currency: row.currency,
                date: row.date,
                mileageAtExpense: row.mileage_at_expense ? parseFloat(row.mileage_at_expense) : null,
                category: row.category,
                notes: row.notes,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            })),
        });
    }
    catch (error) {
        console.error('Get vehicle expenses error:', error);
        res.status(500).json({ message: 'Error fetching vehicle expenses', error: error.message });
    }
};
exports.getVehicleExpenses = getVehicleExpenses;
const createVehicleExpense = async (req, res) => {
    try {
        const userId = req.userId;
        const { vehicleId } = req.params;
        const { expenseType, description, amount, currency, date, mileageAtExpense, category, notes } = req.body;
        if (!expenseType || !description || !amount || !currency || !date) {
            return res.status(400).json({ message: 'Expense type, description, amount, currency, and date are required' });
        }
        // Verify vehicle belongs to user
        const vehicleCheck = await (0, database_1.query)('SELECT id FROM vehicles WHERE id = $1 AND user_id = $2', [vehicleId, userId]);
        if (vehicleCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }
        const result = await (0, database_1.query)(`INSERT INTO vehicle_expenses (vehicle_id, user_id, expense_type, description, amount, currency, date, mileage_at_expense, category, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, expense_type, description, amount, currency, date, mileage_at_expense, category, notes, created_at, updated_at`, [
            vehicleId,
            userId,
            expenseType,
            description,
            amount,
            currency,
            date,
            mileageAtExpense || null,
            category || null,
            notes || null,
        ]);
        const expense = result.rows[0];
        res.status(201).json({
            success: true,
            expense: {
                id: expense.id,
                expenseType: expense.expense_type,
                description: expense.description,
                amount: parseFloat(expense.amount),
                currency: expense.currency,
                date: expense.date,
                mileageAtExpense: expense.mileage_at_expense ? parseFloat(expense.mileage_at_expense) : null,
                category: expense.category,
                notes: expense.notes,
                createdAt: expense.created_at,
                updatedAt: expense.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Create vehicle expense error:', error);
        res.status(500).json({ message: 'Error creating vehicle expense', error: error.message });
    }
};
exports.createVehicleExpense = createVehicleExpense;
const updateVehicleExpense = async (req, res) => {
    try {
        const userId = req.userId;
        const { vehicleId, expenseId } = req.params;
        const { expenseType, description, amount, currency, date, mileageAtExpense, category, notes } = req.body;
        // Verify vehicle and expense belong to user
        const checkResult = await (0, database_1.query)(`SELECT ve.id
       FROM vehicle_expenses ve
       JOIN vehicles v ON ve.vehicle_id = v.id
       WHERE ve.id = $1 AND ve.vehicle_id = $2 AND v.user_id = $3`, [expenseId, vehicleId, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Vehicle expense not found' });
        }
        const result = await (0, database_1.query)(`UPDATE vehicle_expenses
       SET expense_type = COALESCE($1, expense_type),
           description = COALESCE($2, description),
           amount = COALESCE($3, amount),
           currency = COALESCE($4, currency),
           date = COALESCE($5, date),
           mileage_at_expense = COALESCE($6, mileage_at_expense),
           category = COALESCE($7, category),
           notes = COALESCE($8, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND vehicle_id = $10
       RETURNING id, expense_type, description, amount, currency, date, mileage_at_expense, category, notes, created_at, updated_at`, [expenseType, description, amount, currency, date, mileageAtExpense, category, notes, expenseId, vehicleId]);
        const expense = result.rows[0];
        res.json({
            success: true,
            expense: {
                id: expense.id,
                expenseType: expense.expense_type,
                description: expense.description,
                amount: parseFloat(expense.amount),
                currency: expense.currency,
                date: expense.date,
                mileageAtExpense: expense.mileage_at_expense ? parseFloat(expense.mileage_at_expense) : null,
                category: expense.category,
                notes: expense.notes,
                createdAt: expense.created_at,
                updatedAt: expense.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Update vehicle expense error:', error);
        res.status(500).json({ message: 'Error updating vehicle expense', error: error.message });
    }
};
exports.updateVehicleExpense = updateVehicleExpense;
const deleteVehicleExpense = async (req, res) => {
    try {
        const userId = req.userId;
        const { vehicleId, expenseId } = req.params;
        // Verify vehicle and expense belong to user
        const checkResult = await (0, database_1.query)(`SELECT ve.id
       FROM vehicle_expenses ve
       JOIN vehicles v ON ve.vehicle_id = v.id
       WHERE ve.id = $1 AND ve.vehicle_id = $2 AND v.user_id = $3`, [expenseId, vehicleId, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Vehicle expense not found' });
        }
        await (0, database_1.query)('DELETE FROM vehicle_expenses WHERE id = $1', [expenseId]);
        res.json({
            success: true,
            message: 'Vehicle expense deleted successfully',
        });
    }
    catch (error) {
        console.error('Delete vehicle expense error:', error);
        res.status(500).json({ message: 'Error deleting vehicle expense', error: error.message });
    }
};
exports.deleteVehicleExpense = deleteVehicleExpense;
//# sourceMappingURL=vehicleController.js.map