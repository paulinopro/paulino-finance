import type { PoolClient } from 'pg';
/** Actualiza la fila de gasto de vehículo cuando se edita el gasto general vinculado. */
export declare function syncVehicleExpenseFromLinkedExpense(client: PoolClient, userId: number, expenseId: number, fields: {
    description: string;
    amount: number;
    currency: string;
    category: string | null;
    date: string | null;
    bankAccountId: number | null;
}): Promise<void>;
/** Resuelve nombre de categoría por id (validación de pertenencia al usuario). */
export declare function getExpenseCategoryNameForUser(userId: number, categoryId: number): Promise<string | null>;
//# sourceMappingURL=vehicleExpenseLinkSync.d.ts.map