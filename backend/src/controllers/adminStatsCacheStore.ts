/** Caché en memoria para `GET /admin/stats` (TTL corto + invalidación manual). */

export const ADMIN_STATS_TTL_MS = 15_000;

let adminStatsCache: { t: number; payload: Record<string, unknown> } | null = null;

export function getAdminStatsCacheEntry() {
  return adminStatsCache;
}

export function setAdminStatsCacheEntry(entry: { t: number; payload: Record<string, unknown> }): void {
  adminStatsCache = entry;
}

export function invalidateAdminStatsCache(): void {
  adminStatsCache = null;
}
