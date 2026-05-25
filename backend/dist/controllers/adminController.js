"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserAdmin = exports.stopImpersonation = exports.impersonateUser = exports.updateSystemSettings = exports.getSystemSettings = exports.getUserSubscriptionPayments = exports.getUserById = exports.listUsers = exports.listAdminAuditLog = exports.getAdminHealth = exports.getAdminNotificationScheduler = exports.getAdminSubscriptionDataQuality = exports.getAdminStats = void 0;
const database_1 = require("../config/database");
const jwt_1 = require("../utils/jwt");
const subscriptionService_1 = require("../services/subscriptionService");
const notificationService_1 = require("../services/notificationService");
const adminAuditService_1 = require("../services/adminAuditService");
const maintenanceMode_1 = require("../middleware/maintenanceMode");
const exchangeRatePayload_1 = require("../services/exchangeRatePayload");
const adminStatsCacheStore_1 = require("./adminStatsCacheStore");
const userCurrencyPair_1 = require("../utils/userCurrencyPair");
const SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'cancelled', 'expired', 'past_due']);
const USERS_EXPORT_MAX = 10000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function parseUserListFilters(req) {
    const search = String(req.query.search || '').trim();
    const isActive = req.query.isActive === 'true' ? 'true' : req.query.isActive === 'false' ? 'false' : null;
    const planRaw = req.query.planId;
    let planId = null;
    if (planRaw === 'none')
        planId = 'none';
    else if (planRaw != null && String(planRaw) !== '') {
        const n = parseInt(String(planRaw), 10);
        if (!Number.isNaN(n) && n > 0)
            planId = n;
    }
    const st = String(req.query.subscriptionStatus || '').trim().toLowerCase();
    const subscriptionStatus = st && SUBSCRIPTION_STATUSES.has(st) ? st : null;
    const cf = String(req.query.createdFrom || '').trim();
    const ct = String(req.query.createdTo || '').trim();
    const createdFrom = ISO_DATE.test(cf) ? cf : null;
    const createdTo = ISO_DATE.test(ct) ? ct : null;
    const bpf = String(req.query.billingPeriodFrom || '').trim();
    const bpt = String(req.query.billingPeriodTo || '').trim();
    const billingPeriodFrom = ISO_DATE.test(bpf) ? bpf : null;
    const billingPeriodTo = ISO_DATE.test(bpt) ? bpt : null;
    return {
        search,
        isActive,
        planId,
        subscriptionStatus,
        createdFrom,
        createdTo,
        billingPeriodFrom,
        billingPeriodTo,
    };
}
/**
 * Construye WHERE y valores para el listado/export de usuarios (misma lógica que listUsers).
 * Siempre incluye FROM ... JOIN; devuelve `whereSql` con "WHERE" o cadena vacía.
 */
function buildUserListWhere(f) {
    const cond = [];
    const values = [];
    let p = 1;
    if (f.search) {
        cond.push(`(u.email ILIKE $${p} OR COALESCE(u.first_name,'') ILIKE $${p} OR COALESCE(u.last_name,'') ILIKE $${p})`);
        values.push(`%${f.search}%`);
        p++;
    }
    if (f.isActive != null) {
        cond.push(`u.is_active = $${p}`);
        values.push(f.isActive === 'true');
        p++;
    }
    if (f.planId === 'none') {
        cond.push('us.id IS NULL');
    }
    else if (typeof f.planId === 'number') {
        cond.push(`us.plan_id = $${p}`);
        values.push(f.planId);
        p++;
    }
    if (f.subscriptionStatus) {
        cond.push(`us.status = $${p}`);
        values.push(f.subscriptionStatus);
        p++;
    }
    if (f.createdFrom) {
        cond.push(`u.created_at >= $${p}::date`);
        values.push(f.createdFrom);
        p++;
    }
    if (f.createdTo) {
        cond.push(`u.created_at < ($${p}::date + INTERVAL '1 day')`);
        values.push(f.createdTo);
        p++;
    }
    if (f.billingPeriodFrom || f.billingPeriodTo) {
        cond.push('us.id IS NOT NULL');
        cond.push('us.current_period_start IS NOT NULL');
        cond.push('us.current_period_end IS NOT NULL');
        const startUtc = `(us.current_period_start AT TIME ZONE 'UTC')::date`;
        const endUtc = `(us.current_period_end AT TIME ZONE 'UTC')::date`;
        if (f.billingPeriodFrom && f.billingPeriodTo) {
            cond.push(`${startUtc} <= $${p}::date`);
            values.push(f.billingPeriodTo);
            p++;
            cond.push(`${endUtc} >= $${p}::date`);
            values.push(f.billingPeriodFrom);
            p++;
        }
        else if (f.billingPeriodFrom) {
            cond.push(`${endUtc} >= $${p}::date`);
            values.push(f.billingPeriodFrom);
            p++;
        }
        else if (f.billingPeriodTo) {
            cond.push(`${startUtc} <= $${p}::date`);
            values.push(f.billingPeriodTo);
            p++;
        }
    }
    const whereSql = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    return { whereSql, values };
}
function mapUserListRow(u) {
    const t0 = u.current_period_start;
    const t1 = u.current_period_end;
    return {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        createdAt: u.created_at,
        isSuperAdmin: u.is_super_admin === true,
        isActive: u.is_active !== false,
        planId: u.plan_id != null ? Number(u.plan_id) : null,
        subscriptionPlan: u.plan_slug || 'free',
        subscriptionPlanName: u.plan_name || null,
        subscriptionStatus: u.subscription_status || (u.is_super_admin ? 'n/a' : 'sin suscripción'),
        currentPeriodStart: t0 ? new Date(t0).toISOString() : null,
        currentPeriodEnd: t1 ? new Date(t1).toISOString() : null,
    };
}
function csvEscape(s) {
    if (/[",\n\r]/.test(s))
        return `"${s.replace(/"/g, '""')}"`;
    return s;
}
const getAdminStats = async (_req, res) => {
    try {
        const cached = (0, adminStatsCacheStore_1.getAdminStatsCacheEntry)();
        if (cached && Date.now() - cached.t < adminStatsCacheStore_1.ADMIN_STATS_TTL_MS) {
            return res.json(cached.payload);
        }
        const r = await (0, database_1.query)(`SELECT
        (SELECT COUNT(*)::int FROM users) AS total_users,
        (SELECT COUNT(*)::int FROM users WHERE is_active IS NOT FALSE) AS active_users,
        (SELECT COUNT(*)::int FROM users WHERE is_active = false) AS disabled_users,
        (SELECT COUNT(*)::int FROM user_subscriptions) AS with_subscription,
        (SELECT COUNT(*)::int FROM users WHERE is_super_admin = true) AS super_admins,
        (SELECT COUNT(*)::int FROM users WHERE created_at >= (CURRENT_TIMESTAMP - INTERVAL '7 days')) AS new_last_7d,
        (SELECT COUNT(*)::int FROM users WHERE created_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')) AS new_last_30d,
        (SELECT COUNT(*)::int FROM admin_audit_log WHERE created_at >= (CURRENT_TIMESTAMP - INTERVAL '24 hours')) AS audit_last_24h,
        (SELECT COUNT(*)::int FROM user_subscriptions WHERE LOWER(COALESCE(status, '')) = 'active') AS sub_active,
        (SELECT COUNT(*)::int FROM user_subscriptions WHERE LOWER(COALESCE(status, '')) = 'trialing') AS sub_trialing,
        (SELECT COUNT(*)::int FROM user_subscriptions WHERE LOWER(COALESCE(status, '')) = 'cancelled') AS sub_cancelled,
        (SELECT COUNT(*)::int FROM user_subscriptions WHERE LOWER(COALESCE(status, '')) = 'expired') AS sub_expired,
        (SELECT COUNT(*)::int FROM user_subscriptions WHERE LOWER(COALESCE(status, '')) = 'past_due') AS sub_past_due,
        (SELECT COUNT(*)::int FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_subscriptions s WHERE s.user_id = u.id)) AS users_no_subscription
      `);
        const row = r.rows[0];
        const pr = await (0, database_1.query)(`SELECT sp.id, sp.name, COUNT(us.user_id)::int AS user_count
       FROM subscription_plans sp
       LEFT JOIN user_subscriptions us ON us.plan_id = sp.id
       GROUP BY sp.id, sp.name
       ORDER BY sp.sort_order ASC, sp.id ASC`);
        const paySummary = await (0, database_1.query)(`SELECT
         COUNT(*)::int AS total_count,
         COUNT(*) FILTER (WHERE paid_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days'))::int AS count_30d
       FROM subscription_payments
       WHERE LOWER(COALESCE(status, '')) = 'completed'`);
        const payRow = paySummary.rows[0];
        const payByCur = await (0, database_1.query)(`SELECT currency, COALESCE(SUM(amount), 0)::numeric AS total
       FROM subscription_payments
       WHERE paid_at >= (CURRENT_TIMESTAMP - INTERVAL '30 days')
         AND LOWER(COALESCE(status, '')) = 'completed'
       GROUP BY currency
       ORDER BY currency ASC`);
        const payload = {
            totalUsers: row?.total_users ?? 0,
            activeUsers: row?.active_users ?? 0,
            disabledUsers: row?.disabled_users ?? 0,
            withSubscription: row?.with_subscription ?? 0,
            superAdmins: row?.super_admins ?? 0,
            newLast7d: row?.new_last_7d ?? 0,
            newLast30d: row?.new_last_30d ?? 0,
            auditEventsLast24h: row?.audit_last_24h ?? 0,
            subscriptionByStatus: {
                active: row?.sub_active ?? 0,
                trialing: row?.sub_trialing ?? 0,
                cancelled: row?.sub_cancelled ?? 0,
                expired: row?.sub_expired ?? 0,
                pastDue: row?.sub_past_due ?? 0,
            },
            usersWithoutSubscription: row?.users_no_subscription ?? 0,
            planDistribution: pr.rows.map((p) => ({
                planId: p.id,
                planName: p.name,
                userCount: p.user_count,
            })),
            subscriptionPayments: {
                totalRecorded: payRow?.total_count ?? 0,
                last30dCount: payRow?.count_30d ?? 0,
                last30dAmountByCurrency: payByCur.rows.map((c) => ({
                    currency: c.currency,
                    total: parseFloat(String(c.total)) || 0,
                })),
            },
        };
        (0, adminStatsCacheStore_1.setAdminStatsCacheEntry)({ t: Date.now(), payload });
        res.json(payload);
    }
    catch (e) {
        console.error('getAdminStats error', e);
        res.status(500).json({ message: 'Error al cargar estadísticas' });
    }
};
exports.getAdminStats = getAdminStats;
/** Identificador de despliegue opcional (CI / Docker / manual). */
function deployRefFromEnv() {
    const raw = process.env.RELEASE?.trim() ||
        process.env.GIT_COMMIT?.trim() ||
        process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
        process.env.RAILWAY_GIT_COMMIT_SHA?.trim() ||
        process.env.COMMIT_SHA?.trim() ||
        '';
    if (raw)
        return raw.length > 32 ? raw.slice(0, 7) : raw;
    return undefined;
}
/** Señal mínima para consola: BD alcanzable, hora y uptime (sin colas ni métricas de negocio). */
function adminProcessSnapshot() {
    const mem = process.memoryUsage();
    const deployRef = deployRefFromEnv();
    return {
        nodeVersion: process.version,
        memoryRssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        nodeEnv: (process.env.NODE_ENV || 'development'),
        ...(deployRef ? { deployRef } : {}),
    };
}
/**
 * Conteos ligeros para cierre del criterio de “periodo sin nulos”.
 * No modifica datos; el arreglo es SQL manual o webhooks a futuro.
 */
const getAdminSubscriptionDataQuality = async (_req, res) => {
    try {
        const r = await (0, database_1.query)(`
      SELECT
        (SELECT COUNT(*)::int FROM subscription_payments) AS total_payments,
        (SELECT COUNT(*)::int FROM subscription_payments WHERE period_start IS NULL) AS null_period_start,
        (SELECT COUNT(*)::int FROM subscription_payments WHERE period_end IS NULL) AS null_period_end,
        (SELECT COUNT(*)::int
         FROM subscription_payments
         WHERE period_start IS NULL AND period_end IS NULL) AS both_period_null,
        (SELECT COUNT(*)::int
         FROM user_subscriptions
         WHERE LOWER(COALESCE(status, '')) IN ('active', 'trialing')
           AND (current_period_start IS NULL OR current_period_end IS NULL)
        ) AS active_subs_incomplete_window
    `);
        const row = r.rows[0];
        res.json({
            totalPayments: row?.total_payments ?? 0,
            paymentsNullPeriodStart: row?.null_period_start ?? 0,
            paymentsNullPeriodEnd: row?.null_period_end ?? 0,
            paymentsBothPeriodNull: row?.both_period_null ?? 0,
            activeSubscriptionsIncompleteWindow: row?.active_subs_incomplete_window ?? 0,
        });
    }
    catch (e) {
        console.error('getAdminSubscriptionDataQuality', e);
        res.status(500).json({ message: 'Error al leer calidad de datos' });
    }
};
exports.getAdminSubscriptionDataQuality = getAdminSubscriptionDataQuality;
/** Estado del cron de notificaciones (node-cron) — sólo lectura. */
const getAdminNotificationScheduler = (_req, res) => {
    res.json((0, notificationService_1.getNotificationSchedulerStatus)());
};
exports.getAdminNotificationScheduler = getAdminNotificationScheduler;
const getAdminHealth = async (_req, res) => {
    const t0 = Date.now();
    const snap = adminProcessSnapshot();
    try {
        await (0, database_1.query)('SELECT 1');
        res.json({
            ok: true,
            database: 'up',
            serverTime: new Date().toISOString(),
            uptimeSec: Math.floor(process.uptime()),
            checkLatencyMs: Date.now() - t0,
            ...snap,
        });
    }
    catch (e) {
        console.error('getAdminHealth', e);
        res.status(503).json({
            ok: false,
            database: 'down',
            serverTime: new Date().toISOString(),
            uptimeSec: Math.floor(process.uptime()),
            checkLatencyMs: Date.now() - t0,
            ...snap,
        });
    }
};
exports.getAdminHealth = getAdminHealth;
const listAdminAuditLog = async (req, res) => {
    try {
        const asCsv = String(req.query.format || '') === 'csv';
        const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
        const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '30'), 10) || 30));
        const offset = (page - 1) * limit;
        const actionFilter = String(req.query.action || '').trim().slice(0, 80);
        const baseFrom = `FROM admin_audit_log a
      INNER JOIN users u ON u.id = a.actor_id`;
        if (asCsv) {
            const cap = 5000;
            const { whereSql, values: wv } = actionFilter
                ? { whereSql: 'WHERE a.action = $1', values: [actionFilter] }
                : { whereSql: '', values: [] };
            const r = await (0, database_1.query)(`SELECT a.id, a.created_at, a.action, a.target_type, a.target_id, a.details, u.email AS actor_email
         ${baseFrom}
         ${whereSql}
         ORDER BY a.created_at DESC
         LIMIT ${cap}`, wv);
            const header = 'id,created_at,action,actor_email,target_type,target_id,details\n';
            const lines = r.rows.map((row) => {
                const det = row.details == null
                    ? ''
                    : typeof row.details === 'object'
                        ? JSON.stringify(row.details)
                        : String(row.details);
                return [
                    String(row.id),
                    row.created_at ? new Date(row.created_at).toISOString() : '',
                    String(row.action || ''),
                    String(row.actor_email || ''),
                    row.target_type != null ? String(row.target_type) : '',
                    row.target_id != null ? String(row.target_id) : '',
                    det,
                ]
                    .map((c) => csvEscape(c))
                    .join(',');
            });
            const bom = '\uFEFF';
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', 'attachment; filename="auditoria.csv"');
            return res.send(bom + header + lines.join('\n'));
        }
        const countQ = actionFilter
            ? await (0, database_1.query)(`SELECT COUNT(*)::int AS c ${baseFrom} WHERE a.action = $1`, [actionFilter])
            : await (0, database_1.query)(`SELECT COUNT(*)::int AS c ${baseFrom}`);
        const total = countQ.rows[0]?.c ?? 0;
        const data = actionFilter
            ? await (0, database_1.query)(`SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at, u.email AS actor_email
           ${baseFrom}
           WHERE a.action = $1
           ORDER BY a.created_at DESC
           LIMIT $2 OFFSET $3`, [actionFilter, limit, offset])
            : await (0, database_1.query)(`SELECT a.id, a.action, a.target_type, a.target_id, a.details, a.created_at, u.email AS actor_email
           ${baseFrom}
           ORDER BY a.created_at DESC
           LIMIT $1 OFFSET $2`, [limit, offset]);
        res.json({
            events: data.rows.map((e) => ({
                id: e.id,
                action: e.action,
                targetType: e.target_type,
                targetId: e.target_id,
                details: e.details,
                createdAt: e.created_at,
                actorEmail: e.actor_email,
            })),
            page,
            limit,
            total,
        });
    }
    catch (e) {
        console.error('listAdminAuditLog error', e);
        res.status(500).json({ message: 'Error al cargar auditoría' });
    }
};
exports.listAdminAuditLog = listAdminAuditLog;
const listUsers = async (req, res) => {
    try {
        if (String(req.query.format || '') === 'csv') {
            return listUsersAsCsv(req, res);
        }
        const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
        const offset = (page - 1) * limit;
        const f = parseUserListFilters(req);
        const { whereSql, values } = buildUserListWhere(f);
        const baseFrom = `FROM users u
           LEFT JOIN user_subscriptions us ON us.user_id = u.id
           LEFT JOIN subscription_plans sp ON sp.id = us.plan_id`;
        const countResult = await (0, database_1.query)(`SELECT COUNT(*)::int AS c ${baseFrom} ${whereSql}`, values);
        const total = countResult.rows[0]?.c ?? 0;
        const pl = values.length;
        const baseSelect = `SELECT u.id, u.email, u.first_name, u.last_name, u.created_at, u.is_super_admin, u.is_active,
                  us.plan_id AS plan_id,
                  sp.slug AS plan_slug, sp.name AS plan_name, us.status AS subscription_status,
                  us.current_period_start, us.current_period_end`;
        const dataValues = [...values, limit, offset];
        const result = await (0, database_1.query)(`${baseSelect}
       ${baseFrom}
       ${whereSql}
       ORDER BY u.created_at DESC
       LIMIT $${pl + 1} OFFSET $${pl + 2}`, dataValues);
        res.json({
            users: result.rows.map((u) => mapUserListRow(u)),
            page,
            limit,
            total,
        });
    }
    catch (error) {
        console.error('listUsers error:', error);
        res.status(500).json({ message: 'Error al listar usuarios' });
    }
};
exports.listUsers = listUsers;
async function listUsersAsCsv(req, res) {
    const f = parseUserListFilters(req);
    const { whereSql, values } = buildUserListWhere(f);
    const baseFrom = `FROM users u
         LEFT JOIN user_subscriptions us ON us.user_id = u.id
         LEFT JOIN subscription_plans sp ON sp.id = us.plan_id`;
    const result = await (0, database_1.query)(`SELECT u.id, u.email, u.first_name, u.last_name, u.created_at, u.is_super_admin, u.is_active,
            us.plan_id AS plan_id,
            sp.slug AS plan_slug, sp.name AS plan_name, us.status AS subscription_status,
            us.current_period_start, us.current_period_end
     ${baseFrom}
     ${whereSql}
     ORDER BY u.created_at DESC
     LIMIT $${values.length + 1}`, [...values, USERS_EXPORT_MAX]);
    const header = 'id,email,firstName,lastName,createdAt,isSuperAdmin,isActive,planId,plan_slug,plan_name,subscription_status,currentPeriodStart,currentPeriodEnd\n';
    const lines = result.rows.map((u) => {
        const o = mapUserListRow(u);
        return [
            String(o.id),
            o.email,
            o.firstName || '',
            o.lastName || '',
            o.createdAt ? new Date(o.createdAt).toISOString() : '',
            o.isSuperAdmin ? 'true' : 'false',
            o.isActive ? 'true' : 'false',
            o.planId != null ? String(o.planId) : '',
            o.subscriptionPlan,
            o.subscriptionPlanName || '',
            o.subscriptionStatus,
            o.currentPeriodStart || '',
            o.currentPeriodEnd || '',
        ]
            .map((c) => csvEscape(String(c)))
            .join(',');
    });
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="usuarios.csv"');
    return res.status(200).send(bom + header + lines.join('\n'));
}
const getUserById = async (req, res) => {
    try {
        const targetId = parseInt(req.params.userId, 10);
        if (Number.isNaN(targetId)) {
            return res.status(400).json({ message: 'ID inválido' });
        }
        const u = await (0, database_1.query)(`SELECT id, email, first_name, last_name, created_at, is_active, is_super_admin
       FROM users WHERE id = $1`, [targetId]);
        if (u.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        const row = u.rows[0];
        const subscription = await (0, subscriptionService_1.getSubscriptionDetailsForUser)(targetId);
        res.json({
            user: {
                id: row.id,
                email: row.email,
                firstName: row.first_name,
                lastName: row.last_name,
                createdAt: row.created_at,
                isActive: row.is_active !== false,
                isSuperAdmin: row.is_super_admin === true,
            },
            subscription,
        });
    }
    catch (e) {
        console.error('getUserById error', e);
        res.status(500).json({ message: 'Error al cargar usuario' });
    }
};
exports.getUserById = getUserById;
const getUserSubscriptionPayments = async (req, res) => {
    try {
        const targetId = parseInt(req.params.userId, 10);
        if (Number.isNaN(targetId)) {
            return res.status(400).json({ message: 'ID inválido' });
        }
        const ex = await (0, database_1.query)(`SELECT 1 FROM users WHERE id = $1`, [targetId]);
        if (ex.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        const payments = await (0, subscriptionService_1.getSubscriptionPaymentHistoryByUserId)(targetId);
        res.json({ payments });
    }
    catch (e) {
        console.error('getUserSubscriptionPayments error', e);
        res.status(500).json({ message: 'Error al cargar pagos' });
    }
};
exports.getUserSubscriptionPayments = getUserSubscriptionPayments;
const getSystemSettings = async (_req, res) => {
    try {
        const r = await (0, database_1.query)(`SELECT key, value FROM system_settings WHERE key IN ('registration_enabled', 'maintenance_mode')`);
        const map = new Map(r.rows.map((row) => [row.key, row.value]));
        const registrationEnabled = !map.has('registration_enabled') || map.get('registration_enabled') === 'true';
        const maintenanceMode = map.get('maintenance_mode') === 'true';
        res.json({ registrationEnabled, maintenanceMode });
    }
    catch (error) {
        console.error('getSystemSettings error:', error);
        res.status(500).json({ message: 'Error' });
    }
};
exports.getSystemSettings = getSystemSettings;
const updateSystemSettings = async (req, res) => {
    try {
        const { registrationEnabled, maintenanceMode } = req.body;
        if (registrationEnabled === undefined && maintenanceMode === undefined) {
            return res.status(400).json({ message: 'Indique registrationEnabled y/o maintenanceMode' });
        }
        if (registrationEnabled !== undefined && typeof registrationEnabled !== 'boolean') {
            return res.status(400).json({ message: 'registrationEnabled debe ser boolean' });
        }
        if (maintenanceMode !== undefined && typeof maintenanceMode !== 'boolean') {
            return res.status(400).json({ message: 'maintenanceMode debe ser boolean' });
        }
        if (registrationEnabled !== undefined) {
            await (0, database_1.query)(`INSERT INTO system_settings (key, value, updated_at) VALUES ('registration_enabled', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`, [registrationEnabled ? 'true' : 'false']);
            void (0, adminAuditService_1.logAdminAction)(req.userId, 'settings.registration', 'system', null, { registrationEnabled });
        }
        if (maintenanceMode !== undefined) {
            await (0, database_1.query)(`INSERT INTO system_settings (key, value, updated_at) VALUES ('maintenance_mode', $1, CURRENT_TIMESTAMP)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`, [maintenanceMode ? 'true' : 'false']);
            void (0, adminAuditService_1.logAdminAction)(req.userId, 'settings.maintenance', 'system', null, { maintenanceMode });
            (0, maintenanceMode_1.invalidateMaintenanceModeCache)();
        }
        const r = await (0, database_1.query)(`SELECT key, value FROM system_settings WHERE key IN ('registration_enabled', 'maintenance_mode')`);
        const map = new Map(r.rows.map((row) => [row.key, row.value]));
        res.json({
            registrationEnabled: !map.has('registration_enabled') || map.get('registration_enabled') === 'true',
            maintenanceMode: map.get('maintenance_mode') === 'true',
        });
    }
    catch (error) {
        console.error('updateSystemSettings error:', error);
        res.status(500).json({ message: 'Error al guardar configuración' });
    }
};
exports.updateSystemSettings = updateSystemSettings;
const impersonateUser = async (req, res) => {
    try {
        const adminId = req.userId;
        const targetId = parseInt(req.params.userId, 10);
        if (Number.isNaN(targetId)) {
            return res.status(400).json({ message: 'ID inválido' });
        }
        const target = await (0, database_1.query)(`SELECT u.id, u.email, u.first_name, u.last_name, u.telegram_chat_id, u.currency_preference, u.secondary_currency_preference,
              u.exchange_rate_dop_usd, u.exchange_rate_manual, u.timezone, u.locale_preference, u.is_super_admin, u.is_active, u.subscription_plan, u.subscription_status,
              (SELECT EXISTS(SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id)) AS has_user_subscription_row
       FROM users u WHERE u.id = $1`, [targetId]);
        if (target.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        const u = target.rows[0];
        if (u.is_super_admin === true) {
            return res.status(403).json({ message: 'No se puede suplantar a otro super administrador' });
        }
        if (u.is_active === false) {
            return res.status(403).json({ message: 'El usuario está deshabilitado' });
        }
        const token = (0, jwt_1.signAuthToken)({
            userId: u.id,
            impersonatedBy: adminId,
        });
        void (0, adminAuditService_1.logAdminAction)(adminId, 'user.impersonate', 'user', targetId, { targetEmail: u.email });
        const rateTarget = await (0, exchangeRatePayload_1.exchangeRatePayloadForUser)(u.id, u);
        res.json({
            token,
            user: {
                id: u.id,
                email: u.email,
                firstName: u.first_name,
                lastName: u.last_name,
                telegramChatId: u.telegram_chat_id,
                ...(0, userCurrencyPair_1.userCurrencyPreferencePayload)(u),
                localePreference: u.locale_preference || 'es',
                ...rateTarget,
                timezone: u.timezone || 'America/Santo_Domingo',
                isSuperAdmin: false,
                subscriptionPlan: u.subscription_plan || 'free',
                subscriptionStatus: u.subscription_status || 'active',
                hasUserSubscriptionRecord: u.has_user_subscription_row === true,
            },
            impersonatedBy: adminId,
        });
    }
    catch (error) {
        console.error('impersonateUser error:', error);
        res.status(500).json({ message: 'Error al suplantar usuario' });
    }
};
exports.impersonateUser = impersonateUser;
const stopImpersonation = async (req, res) => {
    try {
        const impersonatedBy = req.impersonatedBy;
        if (impersonatedBy == null) {
            return res.status(400).json({ message: 'No estás en modo suplantación' });
        }
        const admin = await (0, database_1.query)(`SELECT u.id, u.email, u.first_name, u.last_name, u.telegram_chat_id, u.currency_preference, u.secondary_currency_preference,
              u.exchange_rate_dop_usd, u.exchange_rate_manual, u.timezone, u.locale_preference, u.is_super_admin, u.subscription_plan, u.subscription_status,
              (SELECT EXISTS(SELECT 1 FROM user_subscriptions us WHERE us.user_id = u.id)) AS has_user_subscription_row
       FROM users u WHERE u.id = $1 AND u.is_super_admin = true`, [impersonatedBy]);
        if (admin.rows.length === 0) {
            return res.status(403).json({ message: 'Sesión de administrador inválida' });
        }
        const u = admin.rows[0];
        const token = (0, jwt_1.signAuthToken)({
            userId: u.id,
            isSuperAdmin: true,
        });
        const viewed = await (0, database_1.query)(`SELECT email FROM users WHERE id = $1`, [req.userId]);
        void (0, adminAuditService_1.logAdminAction)(impersonatedBy, 'user.impersonate_end', 'user', req.userId, {
            viewedEmail: viewed.rows[0]?.email ?? null,
        });
        const rateAdmin = await (0, exchangeRatePayload_1.exchangeRatePayloadForUser)(u.id, u);
        res.json({
            token,
            user: {
                id: u.id,
                email: u.email,
                firstName: u.first_name,
                lastName: u.last_name,
                telegramChatId: u.telegram_chat_id,
                ...(0, userCurrencyPair_1.userCurrencyPreferencePayload)(u),
                localePreference: u.locale_preference || 'es',
                ...rateAdmin,
                timezone: u.timezone || 'America/Santo_Domingo',
                isSuperAdmin: true,
                subscriptionPlan: u.subscription_plan || 'free',
                subscriptionStatus: u.subscription_status || 'active',
                hasUserSubscriptionRecord: u.has_user_subscription_row === true,
            },
        });
    }
    catch (error) {
        console.error('stopImpersonation error:', error);
        res.status(500).json({ message: 'Error al volver a la cuenta de administrador' });
    }
};
exports.stopImpersonation = stopImpersonation;
const updateUserAdmin = async (req, res) => {
    try {
        const targetId = parseInt(req.params.userId, 10);
        if (Number.isNaN(targetId)) {
            return res.status(400).json({ message: 'ID inválido' });
        }
        const { isActive, subscriptionPlan, subscriptionStatus, planId, billingInterval } = req.body;
        const existing = await (0, database_1.query)(`SELECT id, is_super_admin FROM users WHERE id = $1`, [targetId]);
        if (existing.rows.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }
        if (existing.rows[0].is_super_admin === true) {
            return res.status(403).json({ message: 'No se puede modificar un super administrador desde aquí' });
        }
        const updates = [];
        const values = [];
        let i = 1;
        if (typeof isActive === 'boolean') {
            updates.push(`is_active = $${i++}`);
            values.push(isActive);
        }
        if (subscriptionPlan !== undefined) {
            updates.push(`subscription_plan = $${i++}`);
            values.push(String(subscriptionPlan).slice(0, 50));
        }
        if (subscriptionStatus !== undefined) {
            updates.push(`subscription_status = $${i++}`);
            values.push(String(subscriptionStatus).slice(0, 50));
        }
        if (planId !== undefined && planId !== null) {
            const pid = parseInt(String(planId), 10);
            if (Number.isNaN(pid)) {
                return res.status(400).json({ message: 'planId inválido' });
            }
            if (billingInterval !== undefined && billingInterval !== null) {
                if (billingInterval !== 'monthly' && billingInterval !== 'yearly') {
                    return res.status(400).json({ message: 'billingInterval debe ser monthly o yearly' });
                }
            }
            await (0, subscriptionService_1.assignPlanToUser)(targetId, pid, {
                billingInterval: billingInterval === 'yearly' ? 'yearly' : billingInterval === 'monthly' ? 'monthly' : undefined,
            });
        }
        else if (billingInterval !== undefined && billingInterval !== null) {
            return res.status(400).json({ message: 'billingInterval requiere planId' });
        }
        if (updates.length === 0 && planId === undefined) {
            return res.status(400).json({ message: 'Nada que actualizar' });
        }
        if (updates.length > 0) {
            updates.push('updated_at = CURRENT_TIMESTAMP');
            values.push(targetId);
            await (0, database_1.query)(`UPDATE users SET ${updates.join(', ')} WHERE id = $${i}`, values);
        }
        const userAudit = {};
        if (typeof isActive === 'boolean')
            userAudit.isActive = isActive;
        if (subscriptionPlan !== undefined) {
            userAudit.subscriptionPlan = String(subscriptionPlan).slice(0, 50);
        }
        if (subscriptionStatus !== undefined) {
            userAudit.subscriptionStatus = String(subscriptionStatus).slice(0, 50);
        }
        if (planId !== undefined && planId !== null) {
            userAudit.planId = parseInt(String(planId), 10);
            if (billingInterval === 'yearly' || billingInterval === 'monthly') {
                userAudit.billingInterval = billingInterval;
            }
        }
        void (0, adminAuditService_1.logAdminAction)(req.userId, 'user.update', 'user', targetId, userAudit);
        (0, adminStatsCacheStore_1.invalidateAdminStatsCache)();
        res.json({ success: true });
    }
    catch (error) {
        console.error('updateUserAdmin error:', error);
        res.status(500).json({ message: 'Error al actualizar usuario' });
    }
};
exports.updateUserAdmin = updateUserAdmin;
//# sourceMappingURL=adminController.js.map