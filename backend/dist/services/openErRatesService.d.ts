export type OpenErLatestResponse = {
    result: string;
    base_code?: string;
    rates?: Record<string, number>;
};
export declare function fetchOpenErLatest(baseCode: string): Promise<Record<string, number>>;
/** Tasas con base `baseCode`: `rates[C]` = unidades de C por 1 unidad de base (según open.er-api). */
export declare function getOrRefreshSnapshot(baseCode: string): Promise<{
    rates: Record<string, number>;
    fetchedAt: Date;
}>;
/** Refresca snapshots para todas las bases que usamos en preferencias (una vez al día por base en BD). */
export declare function refreshAllAllowedCurrencySnapshots(): Promise<void>;
//# sourceMappingURL=openErRatesService.d.ts.map