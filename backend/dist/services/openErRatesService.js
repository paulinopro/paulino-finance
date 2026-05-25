"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchOpenErLatest = fetchOpenErLatest;
exports.getOrRefreshSnapshot = getOrRefreshSnapshot;
exports.refreshAllAllowedCurrencySnapshots = refreshAllAllowedCurrencySnapshots;
const database_1 = require("../config/database");
const userPreferences_1 = require("../constants/userPreferences");
const OPEN_ER_BASE = 'https://open.er-api.com/v6/latest';
const STALE_MS = 24 * 60 * 60 * 1000;
async function fetchOpenErLatest(baseCode) {
    const code = String(baseCode || '')
        .trim()
        .toUpperCase();
    const url = `${OPEN_ER_BASE}/${encodeURIComponent(code)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
        throw new Error(`open.er-api HTTP ${res.status} for ${code}`);
    }
    const data = (await res.json());
    if (data.result !== 'success' || !data.rates || typeof data.rates !== 'object') {
        throw new Error(`open.er-api invalid response for ${code}`);
    }
    return data.rates;
}
/** Tasas con base `baseCode`: `rates[C]` = unidades de C por 1 unidad de base (según open.er-api). */
async function getOrRefreshSnapshot(baseCode) {
    const code = String(baseCode || '')
        .trim()
        .toUpperCase();
    const existing = await (0, database_1.query)(`SELECT rates_json, fetched_at FROM exchange_rate_snapshots WHERE base_code = $1`, [code]);
    const row = existing.rows[0];
    const now = Date.now();
    if (row?.fetched_at) {
        const at = new Date(row.fetched_at).getTime();
        if (now - at < STALE_MS && row.rates_json && typeof row.rates_json === 'object') {
            return { rates: row.rates_json, fetchedAt: new Date(row.fetched_at) };
        }
    }
    const rates = await fetchOpenErLatest(code);
    await (0, database_1.query)(`INSERT INTO exchange_rate_snapshots (base_code, rates_json, fetched_at)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT (base_code) DO UPDATE SET rates_json = EXCLUDED.rates_json, fetched_at = EXCLUDED.fetched_at`, [code, JSON.stringify(rates)]);
    const again = await (0, database_1.query)(`SELECT fetched_at FROM exchange_rate_snapshots WHERE base_code = $1`, [code]);
    return { rates, fetchedAt: new Date(again.rows[0]?.fetched_at || now) };
}
/** Refresca snapshots para todas las bases que usamos en preferencias (una vez al día por base en BD). */
async function refreshAllAllowedCurrencySnapshots() {
    for (const b of userPreferences_1.ALLOWED_CURRENCY_CODES) {
        try {
            await getOrRefreshSnapshot(b);
        }
        catch (e) {
            console.warn(`[exchange rates] refresh failed for ${b}:`, e);
        }
    }
}
//# sourceMappingURL=openErRatesService.js.map