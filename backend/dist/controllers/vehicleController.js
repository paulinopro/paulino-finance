"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteVehicleExpense = exports.updateVehicleExpense = exports.createVehicleExpense = exports.getVehicleExpenses = exports.deleteVehicle = exports.updateVehicle = exports.createVehicle = exports.getVehicles = void 0;
const database_1 = require("../config/database");
const exchangeRate_1 = require("../utils/exchangeRate");
const accountBalance_1 = require("../services/accountBalance");
const expenseDeletionService_1 = require("../services/expenseDeletionService");
const vehicleExpenseLinkSync_1 = require("../services/vehicleExpenseLinkSync");
const incomeExpenseTaxonomy_1 = require("../constants/incomeExpenseTaxonomy");
/** Gasto de vehículo vinculado a `expenses`: puntual (variable, sin frecuencia). */
const VEHICLE_LINKED_EXPENSE_TAXONOMY = {
    nature: 'variable',
    recurrenceType: 'non_recurrent',
    frequency: null,
};
function parseBankAccountIdFromBody(body) {
    const v = body.bankAccountId;
    if (v === null || v === undefined || v === '')
        return null;
    const n = parseInt(String(v), 10);
    return Number.isNaN(n) ? null : n;
}
const getVehicles = async (req, res) => {
    try {
        const userId = req.userId;
        const result = await (0, database_1.query)(`SELECT id, make, model, year, license_plate, color, mileage, purchase_date, purchase_price, currency, notes, created_at, updated_at
       FROM vehicles
       WHERE user_id = $1
       ORDER BY created_at DESC`, [userId]);
        // Get user's exchange rate once
        const userResult = await (0, database_1.query)('SELECT exchange_rate_dop_usd FROM users WHERE id = $1', [userId]);
        const exchangeRate = (0, exchangeRate_1.resolveExchangeRateDopUsd)(userResult.rows[0]?.exchange_rate_dop_usd);
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
        const exchangeRate = (0, exchangeRate_1.resolveExchangeRateDopUsd)(userResult.rows[0]?.exchange_rate_dop_usd);
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
function mapVehicleExpenseRow(row, categoryDisplay) {
    return {
        id: row.id,
        spendKind: row.spend_kind,
        description: row.description,
        amount: parseFloat(row.amount),
        currency: row.currency,
        date: row.date,
        mileageAtExpense: row.mileage_at_expense ? parseFloat(row.mileage_at_expense) : null,
        category: row.category,
        categoryId: row.category_id != null ? row.category_id : null,
        categoryName: categoryDisplay || row.category || null,
        bankAccountId: row.bank_account_id != null ? row.bank_account_id : null,
        linkedExpenseId: row.linked_expense_id != null ? row.linked_expense_id : null,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
const getVehicleExpenses = async (req, res) => {
    try {
        const userId = req.userId;
        const { vehicleId } = req.params;
        const vehicleCheck = await (0, database_1.query)('SELECT id FROM vehicles WHERE id = $1 AND user_id = $2', [vehicleId, userId]);
        if (vehicleCheck.rows.length === 0) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }
        const result = await (0, database_1.query)(`SELECT ve.id, ve.spend_kind, ve.description, ve.amount, ve.currency, ve.date, ve.mileage_at_expense,
              ve.category, ve.notes, ve.category_id, ve.bank_account_id, ve.linked_expense_id,
              ve.created_at, ve.updated_at,
              ec.name AS category_display
       FROM vehicle_expenses ve
       LEFT JOIN expense_categories ec ON ec.id = ve.category_id
       WHERE ve.vehicle_id = $1
       ORDER BY ve.date DESC, ve.created_at DESC`, [vehicleId]);
        res.json({
            success: true,
            expenses: result.rows.map((row) => mapVehicleExpenseRow(row, row.category_display)),
        });
    }
    catch (error) {
        console.error('Get vehicle expenses error:', error);
        res.status(500).json({ message: 'Error fetching vehicle expenses', error: error.message });
    }
};
exports.getVehicleExpenses = getVehicleExpenses;
const createVehicleExpense = async (req, res) => {
    const userId = req.userId;
    const { vehicleId } = req.params;
    const body = req.body;
    const bodySpend = req.body.spendKind;
    const { description, amount, currency, date, mileageAtExpense, notes, } = req.body;
    const categoryIdRaw = body.categoryId;
    const categoryId = categoryIdRaw !== undefined && categoryIdRaw !== null && categoryIdRaw !== ''
        ? parseInt(String(categoryIdRaw), 10)
        : NaN;
    const spendKind = bodySpend != null && String(bodySpend).trim() !== '' ? String(bodySpend).trim() : '';
    if (!spendKind || !description || amount === undefined || !currency || !date) {
        return res.status(400).json({ message: 'Tipo de gasto, descripción, monto, moneda y fecha son obligatorios' });
    }
    if (!Number.isFinite(categoryId)) {
        return res.status(400).json({ message: 'Debes seleccionar una categoría' });
    }
    const categoryName = await (0, vehicleExpenseLinkSync_1.getExpenseCategoryNameForUser)(userId, categoryId);
    if (!categoryName) {
        return res.status(400).json({ message: 'Categoría no válida' });
    }
    const vehicleCheck = await (0, database_1.query)('SELECT id FROM vehicles WHERE id = $1 AND user_id = $2', [vehicleId, userId]);
    if (vehicleCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Vehicle not found' });
    }
    const amt = parseFloat(String(amount));
    const cur = String(currency);
    const bankAccountId = parseBankAccountIdFromBody(body);
    const client = await (0, database_1.getClient)();
    try {
        await client.query('BEGIN');
        const insEx = await client.query(`INSERT INTO expenses
       (user_id, description, amount, currency, nature, recurrence_type, frequency, category, payment_day, payment_month, date, bank_account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, $9, $10)
       RETURNING id`, [
            userId,
            String(description),
            amt,
            cur,
            VEHICLE_LINKED_EXPENSE_TAXONOMY.nature,
            VEHICLE_LINKED_EXPENSE_TAXONOMY.recurrenceType,
            VEHICLE_LINKED_EXPENSE_TAXONOMY.frequency,
            categoryName,
            date,
            bankAccountId,
        ]);
        const expenseRowId = insEx.rows[0].id;
        if (bankAccountId) {
            try {
                await (0, accountBalance_1.applyBalanceDelta)(userId, bankAccountId, cur, -amt, client);
            }
            catch (e) {
                await client.query('ROLLBACK');
                if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
                    return res.status(400).json({
                        message: e.message === 'CURRENCY_MISMATCH'
                            ? 'La moneda no coincide con la cuenta seleccionada'
                            : 'Cuenta no encontrada',
                    });
                }
                throw e;
            }
        }
        const insVe = await client.query(`INSERT INTO vehicle_expenses
       (vehicle_id, user_id, spend_kind, description, amount, currency, date, mileage_at_expense,
        category, category_id, notes, linked_expense_id, bank_account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, spend_kind, description, amount, currency, date, mileage_at_expense, category, notes,
                 category_id, bank_account_id, linked_expense_id, created_at, updated_at`, [
            vehicleId,
            userId,
            spendKind,
            description,
            amt,
            cur,
            date,
            mileageAtExpense ?? null,
            categoryName,
            categoryId,
            notes ?? null,
            expenseRowId,
            bankAccountId,
        ]);
        await client.query('COMMIT');
        const row = insVe.rows[0];
        res.status(201).json({
            success: true,
            expense: mapVehicleExpenseRow(row, categoryName),
        });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Create vehicle expense error:', error);
        res.status(500).json({ message: 'Error creating vehicle expense', error: error.message });
    }
    finally {
        client.release();
    }
};
exports.createVehicleExpense = createVehicleExpense;
const updateVehicleExpense = async (req, res) => {
    const userId = req.userId;
    const { vehicleId, expenseId } = req.params;
    const body = req.body;
    try {
        const prev = await (0, database_1.query)(`SELECT ve.id, ve.linked_expense_id, ve.spend_kind, ve.mileage_at_expense, ve.notes as ve_notes,
              ve.category, ve.category_id, ve.description, ve.amount, ve.currency, ve.date,
              ve.bank_account_id as ve_bank_account_id
       FROM vehicle_expenses ve
       JOIN vehicles v ON ve.vehicle_id = v.id
       WHERE ve.id = $1 AND ve.vehicle_id = $2 AND v.user_id = $3`, [expenseId, vehicleId, userId]);
        if (prev.rows.length === 0) {
            return res.status(404).json({ message: 'Vehicle expense not found' });
        }
        const p = prev.rows[0];
        const linkedId = p.linked_expense_id;
        const spendKindRaw = body.spendKind;
        const spendKind = spendKindRaw !== undefined && spendKindRaw !== null && String(spendKindRaw).trim() !== ''
            ? String(spendKindRaw).trim()
            : String(p.spend_kind ?? '');
        const mileageAtExpense = body.mileageAtExpense !== undefined ? body.mileageAtExpense : p.mileage_at_expense;
        const notes = body.notes !== undefined ? body.notes : p.ve_notes;
        let categoryId = p.category_id != null ? Number(p.category_id) : null;
        let categoryName = p.category != null ? String(p.category) : null;
        if (body.categoryId !== undefined && body.categoryId !== null && body.categoryId !== '') {
            const cid = parseInt(String(body.categoryId), 10);
            if (!Number.isFinite(cid)) {
                return res.status(400).json({ message: 'Categoría no válida' });
            }
            const nm = await (0, vehicleExpenseLinkSync_1.getExpenseCategoryNameForUser)(userId, cid);
            if (!nm) {
                return res.status(400).json({ message: 'Categoría no válida' });
            }
            categoryId = cid;
            categoryName = nm;
        }
        const newBankId = parseBankAccountIdFromBody(body);
        if (!linkedId) {
            if (!spendKind) {
                return res.status(400).json({ message: 'Tipo de gasto (spendKind) es obligatorio' });
            }
            const bankAccountId = 'bankAccountId' in body ? newBankId : p.ve_bank_account_id;
            const result = await (0, database_1.query)(`UPDATE vehicle_expenses
         SET spend_kind = $1,
             description = COALESCE($2, description),
             amount = COALESCE($3, amount),
             currency = COALESCE($4, currency),
             date = COALESCE($5, date),
             mileage_at_expense = $6,
             category = COALESCE($7, category),
             category_id = COALESCE($8, category_id),
             notes = $9,
             bank_account_id = $10,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $11 AND vehicle_id = $12
         RETURNING id, spend_kind, description, amount, currency, date, mileage_at_expense, category, notes,
                   category_id, bank_account_id, linked_expense_id, created_at, updated_at`, [
                spendKind,
                body.description ?? null,
                body.amount !== undefined ? parseFloat(String(body.amount)) : null,
                body.currency ?? null,
                body.date ?? null,
                mileageAtExpense ?? null,
                categoryName,
                categoryId,
                notes ?? null,
                bankAccountId,
                expenseId,
                vehicleId,
            ]);
            const row = result.rows[0];
            return res.json({ success: true, expense: mapVehicleExpenseRow(row, categoryName) });
        }
        const oldEx = await (0, database_1.query)(`SELECT id, description, amount, currency, recurrence_type, frequency, category, date, bank_account_id
       FROM expenses WHERE id = $1 AND user_id = $2`, [linkedId, userId]);
        if (oldEx.rows.length === 0) {
            return res.status(404).json({ message: 'Gasto vinculado no encontrado' });
        }
        const old = oldEx.rows[0];
        const newDesc = body.description !== undefined ? String(body.description) : old.description;
        const newAmt = body.amount !== undefined ? parseFloat(String(body.amount)) : parseFloat(old.amount);
        const newCur = body.currency !== undefined ? String(body.currency) : old.currency;
        const newDate = body.date !== undefined ? body.date : old.date;
        const newCat = body.categoryId !== undefined && body.categoryId !== null && body.categoryId !== ''
            ? String(categoryName)
            : old.category;
        const resolvedBank = 'bankAccountId' in body ? newBankId : old.bank_account_id;
        const client = await (0, database_1.getClient)();
        try {
            await client.query('BEGIN');
            if ((0, incomeExpenseTaxonomy_1.expenseUsesImmediateBalance)(old) && old.bank_account_id) {
                await (0, accountBalance_1.applyBalanceDelta)(userId, old.bank_account_id, old.currency, parseFloat(old.amount), client);
            }
            await client.query(`UPDATE expenses
         SET description = $1, amount = $2, currency = $3, category = $4, date = $5, bank_account_id = $6,
             nature = $7, recurrence_type = $8, frequency = $9,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $10 AND user_id = $11`, [
                newDesc,
                newAmt,
                newCur,
                newCat,
                newDate,
                resolvedBank,
                VEHICLE_LINKED_EXPENSE_TAXONOMY.nature,
                VEHICLE_LINKED_EXPENSE_TAXONOMY.recurrenceType,
                VEHICLE_LINKED_EXPENSE_TAXONOMY.frequency,
                linkedId,
                userId,
            ]);
            if ((0, incomeExpenseTaxonomy_1.expenseUsesImmediateBalance)({
                recurrence_type: 'non_recurrent',
                frequency: null,
            }) &&
                resolvedBank) {
                try {
                    await (0, accountBalance_1.applyBalanceDelta)(userId, resolvedBank, newCur, -newAmt, client);
                }
                catch (e) {
                    await client.query('ROLLBACK');
                    if (e.message === 'ACCOUNT_NOT_FOUND' || e.message === 'CURRENCY_MISMATCH') {
                        return res.status(400).json({
                            message: e.message === 'CURRENCY_MISMATCH'
                                ? 'La moneda no coincide con la cuenta seleccionada'
                                : 'Cuenta no encontrada',
                        });
                    }
                    throw e;
                }
            }
            const uv = await client.query(`UPDATE vehicle_expenses
         SET spend_kind = $1,
             description = $2,
             amount = $3,
             currency = $4,
             date = $5,
             mileage_at_expense = $6,
             category = $7,
             category_id = $8,
             notes = $9,
             bank_account_id = $10,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $11 AND vehicle_id = $12
         RETURNING id, spend_kind, description, amount, currency, date, mileage_at_expense, category, notes,
                   category_id, bank_account_id, linked_expense_id, created_at, updated_at`, [
                spendKind,
                newDesc,
                newAmt,
                newCur,
                newDate,
                mileageAtExpense ?? null,
                newCat,
                categoryId,
                notes ?? null,
                resolvedBank,
                expenseId,
                vehicleId,
            ]);
            await client.query('COMMIT');
            const row = uv.rows[0];
            res.json({ success: true, expense: mapVehicleExpenseRow(row, newCat) });
        }
        catch (error) {
            await client.query('ROLLBACK');
            console.error('Update vehicle expense error:', error);
            res.status(500).json({ message: 'Error updating vehicle expense', error: error.message });
        }
        finally {
            client.release();
        }
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
        const checkResult = await (0, database_1.query)(`SELECT ve.linked_expense_id
       FROM vehicle_expenses ve
       JOIN vehicles v ON ve.vehicle_id = v.id
       WHERE ve.id = $1 AND ve.vehicle_id = $2 AND v.user_id = $3`, [expenseId, vehicleId, userId]);
        if (checkResult.rows.length === 0) {
            return res.status(404).json({ message: 'Vehicle expense not found' });
        }
        const linked = checkResult.rows[0].linked_expense_id;
        if (linked) {
            const ok = await (0, expenseDeletionService_1.removeExpenseForUser)(userId, linked);
            if (!ok) {
                return res.status(404).json({ message: 'Gasto no encontrado' });
            }
        }
        else {
            await (0, database_1.query)('DELETE FROM vehicle_expenses WHERE id = $1 AND vehicle_id = $2', [expenseId, vehicleId]);
        }
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