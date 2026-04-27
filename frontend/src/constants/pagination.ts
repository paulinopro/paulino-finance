/** Tamaño de página por defecto para tablas listadas (10 filas). */
export const TABLE_PAGE_SIZE = 10;

/** Opciones estándar del selector «por página» (se puede ampliar con el default del módulo). */
export const TABLE_PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50, 100];

export function mergeTablePageSizeOptions(
  defaultSize: number,
  base: readonly number[] = TABLE_PAGE_SIZE_OPTIONS
): number[] {
  const set = new Set<number>(base);
  set.add(defaultSize);
  return Array.from(set).sort((a, b) => a - b);
}

/** Tamaño de página por módulo (listas principales en la app). */
export const TABLE_PAGE_SIZE_ACCOUNTS = 12;
export const TABLE_PAGE_SIZE_CARDS = 12;
export const TABLE_PAGE_SIZE_LOANS = 8;
export const TABLE_PAGE_SIZE_ACCOUNTS_PAYABLE = 12;
export const TABLE_PAGE_SIZE_ACCOUNTS_RECEIVABLE = 12;
export const TABLE_PAGE_SIZE_BUDGETS = 12;
export const TABLE_PAGE_SIZE_GOALS = 8;
