/** Caché en memoria para `GET /admin/stats` (TTL corto + invalidación manual). */
export declare const ADMIN_STATS_TTL_MS = 15000;
export declare function getAdminStatsCacheEntry(): {
    t: number;
    payload: Record<string, unknown>;
} | null;
export declare function setAdminStatsCacheEntry(entry: {
    t: number;
    payload: Record<string, unknown>;
}): void;
export declare function invalidateAdminStatsCache(): void;
//# sourceMappingURL=adminStatsCacheStore.d.ts.map