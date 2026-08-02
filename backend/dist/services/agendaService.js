"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchOutboundSyncHintsForAgendaItems = fetchOutboundSyncHintsForAgendaItems;
exports.parseAgendaKind = parseAgendaKind;
exports.parseAgendaStatus = parseAgendaStatus;
exports.listAgendaItems = listAgendaItems;
exports.fetchAgendaItemRow = fetchAgendaItemRow;
exports.getAgendaItem = getAgendaItem;
exports.createAgendaItem = createAgendaItem;
exports.updateAgendaItem = updateAgendaItem;
exports.deleteAgendaItem = deleteAgendaItem;
exports.listAgendaConnections = listAgendaConnections;
const database_1 = require("../config/database");
const agendaRecurrence_1 = require("./agendaRecurrence");
function rowToPayload(r, outboundSync) {
    const base = {
        id: r.id,
        kind: r.kind,
        title: r.title,
        description: r.description ?? undefined,
        location: r.location ?? undefined,
        startsAt: r.starts_at instanceof Date ? r.starts_at.toISOString() : new Date(String(r.starts_at)).toISOString(),
        endsAt: r.ends_at == null
            ? undefined
            : r.ends_at instanceof Date
                ? r.ends_at.toISOString()
                : new Date(String(r.ends_at)).toISOString(),
        allDay: r.all_day,
        status: r.status,
        recurrenceRule: r.recurrence_rule ?? undefined,
        timezone: r.timezone ?? undefined,
        financeLinkType: r.finance_link_type ?? undefined,
        financeLinkId: r.finance_link_id ?? undefined,
        metadata: r.metadata ?? {},
        syncToExternal: r.sync_to_external,
        externalUpdatedAt: r.external_updated_at == null
            ? undefined
            : r.external_updated_at instanceof Date
                ? r.external_updated_at.toISOString()
                : new Date(String(r.external_updated_at)).toISOString(),
        lastChangeOrigin: r.last_change_origin ?? 'LOCAL',
        syncStatus: r.sync_status ?? 'PENDING',
        deletedAt: r.deleted_at == null
            ? undefined
            : r.deleted_at instanceof Date
                ? r.deleted_at.toISOString()
                : new Date(String(r.deleted_at)).toISOString(),
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    };
    return outboundSync ? { ...base, outboundSync } : base;
}
function classifySyncRow(externalUid, lastError) {
    const err = typeof lastError === 'string' && lastError.trim().length > 0;
    if (err)
        return 'err';
    const uidOk = typeof externalUid === 'string' && externalUid.trim().length > 0;
    if (uidOk)
        return 'ok';
    return 'none';
}
/** Mapa ítem → hints para Google / iCloud a partir de `agenda_item_sync_state`. */
async function fetchOutboundSyncHintsForAgendaItems(userId, itemIds) {
    const out = new Map();
    for (const id of itemIds) {
        out.set(id, { google: 'none', icloud: 'none' });
    }
    if (itemIds.length === 0)
        return out;
    const res = await (0, database_1.query)(`
    SELECT s.agenda_item_id,
           c.provider,
           s.external_uid,
           s.last_error
    FROM agenda_item_sync_state s
    INNER JOIN agenda_provider_connections c ON c.id = s.connection_id
    WHERE c.user_id = $1
      AND s.agenda_item_id = ANY($2::int[])
      AND c.provider IN ('GOOGLE_CALENDAR','ICLOUD_CALDAV')
    `, [userId, itemIds]);
    for (const row of res.rows) {
        const hid = Number(row.agenda_item_id);
        const cur = out.get(hid) ?? { google: 'none', icloud: 'none' };
        const st = classifySyncRow(row.external_uid, row.last_error);
        if (row.provider === 'GOOGLE_CALENDAR')
            cur.google = st;
        else if (row.provider === 'ICLOUD_CALDAV')
            cur.icloud = st;
        out.set(hid, cur);
    }
    return out;
}
const KINDS = new Set(['EVENT', 'TASK', 'REMINDER', 'APPOINTMENT', 'NOTE']);
const STATUSES = new Set(['OPEN', 'DONE', 'TENTATIVE', 'CANCELLED']);
function parseAgendaKind(v) {
    if (typeof v !== 'string')
        return null;
    const u = v.toUpperCase();
    return KINDS.has(u) ? u : null;
}
function parseAgendaStatus(v) {
    if (typeof v !== 'string')
        return null;
    const u = v.toUpperCase();
    return STATUSES.has(u) ? u : null;
}
async function listAgendaItems(userId, opts) {
    const from = new Date(opts.fromIso);
    const to = new Date(opts.toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new Error('INVALID_RANGE');
    }
    const params = [userId, from.toISOString(), to.toISOString()];
    let kindFilter = '';
    if (opts.kinds?.length) {
        kindFilter = ` AND kind = ANY($4::text[])`;
        params.push(opts.kinds);
    }
    const res = await (0, database_1.query)(`
    SELECT *
    FROM agenda_items
    WHERE user_id = $1
      AND deleted_at IS NULL
      AND starts_at < $3
      AND (
        recurrence_rule IS NOT NULL
        OR COALESCE(ends_at, starts_at) >= $2
      )
      ${kindFilter}
    ORDER BY starts_at ASC, id ASC
    `, params);
    const rows = (0, agendaRecurrence_1.expandAgendaRecurrences)(res.rows, { from, to });
    const ids = rows.map((x) => x.id);
    const hints = await fetchOutboundSyncHintsForAgendaItems(userId, ids);
    return rows.map((r) => rowToPayload(r, hints.get(r.id)));
}
async function fetchAgendaItemRow(userId, id) {
    const res = await (0, database_1.query)(`SELECT * FROM agenda_items WHERE user_id = $1 AND id = $2`, [userId, id]);
    const r = res.rows[0];
    return r ?? null;
}
async function getAgendaItem(userId, id) {
    const res = await (0, database_1.query)(`SELECT * FROM agenda_items WHERE user_id = $1 AND id = $2`, [userId, id]);
    const r = res.rows[0];
    if (!r)
        return null;
    const hints = await fetchOutboundSyncHintsForAgendaItems(userId, [r.id]);
    return rowToPayload(r, hints.get(r.id));
}
async function createAgendaItem(userId, body) {
    const startsAt = new Date(body.startsAt);
    if (Number.isNaN(startsAt.getTime()))
        throw new Error('INVALID_STARTS_AT');
    let endsAt = null;
    if (body.endsAt != null && body.endsAt !== '') {
        endsAt = new Date(body.endsAt);
        if (Number.isNaN(endsAt.getTime()))
            throw new Error('INVALID_ENDS_AT');
    }
    let externalUpdatedAt = null;
    if (body.externalUpdatedAt != null && body.externalUpdatedAt !== '') {
        externalUpdatedAt = new Date(body.externalUpdatedAt);
        if (Number.isNaN(externalUpdatedAt.getTime()))
            throw new Error('INVALID_EXTERNAL_UPDATED_AT');
    }
    const res = await (0, database_1.query)(`
    INSERT INTO agenda_items (
      user_id, kind, title, description, location, starts_at, ends_at, all_day, status,
      recurrence_rule, timezone, finance_link_type, finance_link_id, metadata, sync_to_external,
      external_updated_at, last_change_origin, sync_status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17, $18)
    RETURNING *
    `, [
        userId,
        body.kind,
        body.title.trim().slice(0, 512),
        body.description ?? null,
        body.location ?? null,
        startsAt.toISOString(),
        endsAt ? endsAt.toISOString() : null,
        Boolean(body.allDay),
        body.status ?? 'OPEN',
        body.recurrenceRule ?? null,
        body.timezone ?? null,
        body.financeLinkType ?? null,
        body.financeLinkId ?? null,
        JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
        body.syncToExternal !== false,
        externalUpdatedAt ? externalUpdatedAt.toISOString() : null,
        body.lastChangeOrigin?.trim().slice(0, 40) || 'LOCAL',
        body.syncStatus?.trim().slice(0, 24) || 'PENDING',
    ]);
    const rowIns = res.rows[0];
    const hm = await fetchOutboundSyncHintsForAgendaItems(userId, [rowIns.id]);
    return rowToPayload(rowIns, hm.get(rowIns.id));
}
async function updateAgendaItem(userId, id, patch) {
    const cur = await (0, database_1.query)(`SELECT * FROM agenda_items WHERE user_id = $1 AND id = $2`, [userId, id]);
    const row = cur.rows[0];
    if (!row)
        return null;
    const kind = patch.kind ?? row.kind;
    const title = patch.title !== undefined ? patch.title.trim().slice(0, 512) : row.title;
    const description = patch.description !== undefined ? patch.description : row.description ?? null;
    const location = patch.location !== undefined ? patch.location : row.location ?? null;
    let starts_at = row.starts_at;
    if (patch.startsAt !== undefined) {
        const d = new Date(patch.startsAt);
        if (Number.isNaN(d.getTime()))
            throw new Error('INVALID_STARTS_AT');
        starts_at = d;
    }
    let ends_at = row.ends_at;
    if (patch.endsAt !== undefined) {
        if (patch.endsAt === null || patch.endsAt === '')
            ends_at = null;
        else {
            const d = new Date(patch.endsAt);
            if (Number.isNaN(d.getTime()))
                throw new Error('INVALID_ENDS_AT');
            ends_at = d;
        }
    }
    const all_day = patch.allDay !== undefined ? Boolean(patch.allDay) : row.all_day;
    const status = patch.status ?? row.status;
    const recurrence_rule = patch.recurrenceRule !== undefined ? patch.recurrenceRule : row.recurrence_rule ?? null;
    const timezone = patch.timezone !== undefined ? patch.timezone : row.timezone ?? null;
    const finance_link_type = patch.financeLinkType !== undefined ? patch.financeLinkType : row.finance_link_type ?? null;
    const finance_link_id = patch.financeLinkId !== undefined ? patch.financeLinkId : row.finance_link_id ?? null;
    let metadataObj = row.metadata ?? {};
    if (patch.metadata !== undefined && typeof patch.metadata === 'object' && patch.metadata !== null) {
        metadataObj = patch.metadata;
    }
    const sync_to_external = patch.syncToExternal !== undefined ? Boolean(patch.syncToExternal) : row.sync_to_external;
    let external_updated_at = row.external_updated_at ?? null;
    if (patch.externalUpdatedAt !== undefined) {
        if (patch.externalUpdatedAt === null || patch.externalUpdatedAt === '')
            external_updated_at = null;
        else {
            const d = new Date(patch.externalUpdatedAt);
            if (Number.isNaN(d.getTime()))
                throw new Error('INVALID_EXTERNAL_UPDATED_AT');
            external_updated_at = d;
        }
    }
    const last_change_origin = patch.lastChangeOrigin !== undefined
        ? patch.lastChangeOrigin?.trim().slice(0, 40) || 'LOCAL'
        : row.last_change_origin ?? 'LOCAL';
    const sync_status = patch.syncStatus !== undefined
        ? patch.syncStatus?.trim().slice(0, 24) || 'PENDING'
        : row.sync_status ?? 'PENDING';
    const res = await (0, database_1.query)(`
    UPDATE agenda_items SET
      kind = $3,
      title = $4,
      description = $5,
      location = $6,
      starts_at = $7,
      ends_at = $8,
      all_day = $9,
      status = $10,
      recurrence_rule = $11,
      timezone = $12,
      finance_link_type = $13,
      finance_link_id = $14,
      metadata = $15::jsonb,
      sync_to_external = $16,
      external_updated_at = $17,
      last_change_origin = $18,
      sync_status = $19,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND id = $2
    RETURNING *
    `, [
        userId,
        id,
        kind,
        title,
        description,
        location,
        starts_at instanceof Date ? starts_at.toISOString() : starts_at,
        ends_at instanceof Date ? ends_at.toISOString() : ends_at,
        all_day,
        status,
        recurrence_rule,
        timezone,
        finance_link_type,
        finance_link_id,
        JSON.stringify(metadataObj),
        sync_to_external,
        external_updated_at instanceof Date ? external_updated_at.toISOString() : external_updated_at,
        last_change_origin,
        sync_status,
    ]);
    const updated = res.rows[0];
    const hm = await fetchOutboundSyncHintsForAgendaItems(userId, [updated.id]);
    return rowToPayload(updated, hm.get(updated.id));
}
async function deleteAgendaItem(userId, id) {
    const res = await (0, database_1.query)(`
    UPDATE agenda_items SET
      deleted_at = CURRENT_TIMESTAMP,
      sync_status = 'PENDING',
      last_change_origin = 'LOCAL',
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL
    RETURNING id
    `, [userId, id]);
    return (res.rows?.length ?? 0) > 0;
}
async function listAgendaConnections(userId) {
    const res = await (0, database_1.query)(`
    SELECT id, provider, account_label, status, sync_direction, external_default_calendar_id,
           last_error, meta
    FROM agenda_provider_connections
    WHERE user_id = $1
    ORDER BY provider ASC
    `, [userId]);
    return res.rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        accountLabel: r.account_label ?? undefined,
        status: r.status,
        syncDirection: r.sync_direction,
        externalDefaultCalendarId: r.external_default_calendar_id ?? undefined,
        lastError: r.last_error ?? undefined,
        meta: typeof r.meta === 'object' && r.meta !== null ? r.meta : {},
    }));
}
//# sourceMappingURL=agendaService.js.map