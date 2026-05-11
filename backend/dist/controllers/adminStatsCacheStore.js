"use strict";
/** Caché en memoria para `GET /admin/stats` (TTL corto + invalidación manual). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ADMIN_STATS_TTL_MS = void 0;
exports.getAdminStatsCacheEntry = getAdminStatsCacheEntry;
exports.setAdminStatsCacheEntry = setAdminStatsCacheEntry;
exports.invalidateAdminStatsCache = invalidateAdminStatsCache;
exports.ADMIN_STATS_TTL_MS = 15000;
let adminStatsCache = null;
function getAdminStatsCacheEntry() {
    return adminStatsCache;
}
function setAdminStatsCacheEntry(entry) {
    adminStatsCache = entry;
}
function invalidateAdminStatsCache() {
    adminStatsCache = null;
}
//# sourceMappingURL=adminStatsCacheStore.js.map