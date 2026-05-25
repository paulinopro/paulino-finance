import { query } from '../config/database';

export type AgendaKind = 'EVENT' | 'TASK' | 'REMINDER' | 'APPOINTMENT' | 'NOTE';

export type AgendaStatus = 'OPEN' | 'DONE' | 'TENTATIVE' | 'CANCELLED';

export interface AgendaItemRow {
  id: number;
  user_id: number;
  kind: AgendaKind;
  title: string;
  description: string | null;
  starts_at: Date;
  ends_at: Date | null;
  all_day: boolean;
  status: AgendaStatus;
  recurrence_rule: string | null;
  finance_link_type: string | null;
  finance_link_id: number | null;
  metadata: Record<string, unknown>;
  sync_to_external: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Estado conocido por la API del último push saliente (`agenda_item_sync_state`). */
export type OutboundPushHint = 'none' | 'ok' | 'err';

export interface AgendaOutboundSyncHints {
  google: OutboundPushHint;
  icloud: OutboundPushHint;
}

function rowToPayload(r: AgendaItemRow, outboundSync?: AgendaOutboundSyncHints) {
  const base = {
    id: r.id,
    kind: r.kind,
    title: r.title,
    description: r.description ?? undefined,
    startsAt: r.starts_at instanceof Date ? r.starts_at.toISOString() : new Date(String(r.starts_at)).toISOString(),
    endsAt:
      r.ends_at == null
        ? undefined
        : r.ends_at instanceof Date
          ? r.ends_at.toISOString()
          : new Date(String(r.ends_at)).toISOString(),
    allDay: r.all_day,
    status: r.status,
    recurrenceRule: r.recurrence_rule ?? undefined,
    financeLinkType: r.finance_link_type ?? undefined,
    financeLinkId: r.finance_link_id ?? undefined,
    metadata: r.metadata ?? {},
    syncToExternal: r.sync_to_external,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
  return outboundSync ? { ...base, outboundSync } : base;
}

export type AgendaItemApiPayload = ReturnType<typeof rowToPayload>;

function classifySyncRow(externalUid: string | null | undefined, lastError: string | null | undefined): OutboundPushHint {
  const err = typeof lastError === 'string' && lastError.trim().length > 0;
  if (err) return 'err';
  const uidOk = typeof externalUid === 'string' && externalUid.trim().length > 0;
  if (uidOk) return 'ok';
  return 'none';
}

/** Mapa ítem → hints para Google / iCloud a partir de `agenda_item_sync_state`. */
export async function fetchOutboundSyncHintsForAgendaItems(
  userId: number,
  itemIds: number[]
): Promise<Map<number, AgendaOutboundSyncHints>> {
  const out = new Map<number, AgendaOutboundSyncHints>();
  for (const id of itemIds) {
    out.set(id, { google: 'none', icloud: 'none' });
  }
  if (itemIds.length === 0) return out;

  const res = await query(
    `
    SELECT s.agenda_item_id,
           c.provider,
           s.external_uid,
           s.last_error
    FROM agenda_item_sync_state s
    INNER JOIN agenda_provider_connections c ON c.id = s.connection_id
    WHERE c.user_id = $1
      AND s.agenda_item_id = ANY($2::int[])
      AND c.provider IN ('GOOGLE_CALENDAR','ICLOUD_CALDAV')
    `,
    [userId, itemIds]
  );

  for (const row of res.rows as {
    agenda_item_id: number;
    provider: string;
    external_uid: string | null;
    last_error: string | null;
  }[]) {
    const hid = Number(row.agenda_item_id);
    const cur = out.get(hid) ?? { google: 'none', icloud: 'none' };
    const st = classifySyncRow(row.external_uid, row.last_error);
    if (row.provider === 'GOOGLE_CALENDAR') cur.google = st;
    else if (row.provider === 'ICLOUD_CALDAV') cur.icloud = st;
    out.set(hid, cur);
  }

  return out;
}

const KINDS = new Set<AgendaKind>(['EVENT', 'TASK', 'REMINDER', 'APPOINTMENT', 'NOTE']);
const STATUSES = new Set<AgendaStatus>(['OPEN', 'DONE', 'TENTATIVE', 'CANCELLED']);

export function parseAgendaKind(v: unknown): AgendaKind | null {
  if (typeof v !== 'string') return null;
  const u = v.toUpperCase() as AgendaKind;
  return KINDS.has(u) ? u : null;
}

export function parseAgendaStatus(v: unknown): AgendaStatus | null {
  if (typeof v !== 'string') return null;
  const u = v.toUpperCase() as AgendaStatus;
  return STATUSES.has(u) ? u : null;
}

export async function listAgendaItems(
  userId: number,
  opts: { fromIso: string; toIso: string; kinds?: AgendaKind[] }
): Promise<AgendaItemApiPayload[]> {
  const from = new Date(opts.fromIso);
  const to = new Date(opts.toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error('INVALID_RANGE');
  }
  const params: unknown[] = [userId, from.toISOString(), to.toISOString()];
  let kindFilter = '';
  if (opts.kinds?.length) {
    kindFilter = ` AND kind = ANY($4::text[])`;
    params.push(opts.kinds);
  }
  const res = await query(
    `
    SELECT *
    FROM agenda_items
    WHERE user_id = $1
      AND starts_at < $3
      AND COALESCE(ends_at, starts_at) >= $2
      ${kindFilter}
    ORDER BY starts_at ASC, id ASC
    `,
    params
  );
  const rows = res.rows as AgendaItemRow[];
  const ids = rows.map((x) => x.id);
  const hints = await fetchOutboundSyncHintsForAgendaItems(userId, ids);
  return rows.map((r) => rowToPayload(r, hints.get(r.id)));
}

export async function fetchAgendaItemRow(userId: number, id: number): Promise<AgendaItemRow | null> {
  const res = await query(`SELECT * FROM agenda_items WHERE user_id = $1 AND id = $2`, [userId, id]);
  const r = res.rows[0] as AgendaItemRow | undefined;
  return r ?? null;
}

export async function getAgendaItem(userId: number, id: number): Promise<AgendaItemApiPayload | null> {
  const res = await query(`SELECT * FROM agenda_items WHERE user_id = $1 AND id = $2`, [userId, id]);
  const r = res.rows[0] as AgendaItemRow | undefined;
  if (!r) return null;
  const hints = await fetchOutboundSyncHintsForAgendaItems(userId, [r.id]);
  return rowToPayload(r, hints.get(r.id));
}

export async function createAgendaItem(
  userId: number,
  body: {
    kind: AgendaKind;
    title: string;
    description?: string | null;
    startsAt: string;
    endsAt?: string | null;
    allDay?: boolean;
    status?: AgendaStatus;
    recurrenceRule?: string | null;
    financeLinkType?: string | null;
    financeLinkId?: number | null;
    metadata?: Record<string, unknown>;
    syncToExternal?: boolean;
  }
): Promise<AgendaItemApiPayload> {
  const startsAt = new Date(body.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new Error('INVALID_STARTS_AT');
  let endsAt: Date | null = null;
  if (body.endsAt != null && body.endsAt !== '') {
    endsAt = new Date(body.endsAt);
    if (Number.isNaN(endsAt.getTime())) throw new Error('INVALID_ENDS_AT');
  }
  const res = await query(
    `
    INSERT INTO agenda_items (
      user_id, kind, title, description, starts_at, ends_at, all_day, status,
      recurrence_rule, finance_link_type, finance_link_id, metadata, sync_to_external
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
    RETURNING *
    `,
    [
      userId,
      body.kind,
      body.title.trim().slice(0, 512),
      body.description ?? null,
      startsAt.toISOString(),
      endsAt ? endsAt.toISOString() : null,
      Boolean(body.allDay),
      body.status ?? 'OPEN',
      body.recurrenceRule ?? null,
      body.financeLinkType ?? null,
      body.financeLinkId ?? null,
      JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      body.syncToExternal !== false,
    ]
  );
  const rowIns = res.rows[0] as AgendaItemRow;
  const hm = await fetchOutboundSyncHintsForAgendaItems(userId, [rowIns.id]);
  return rowToPayload(rowIns, hm.get(rowIns.id));
}

export async function updateAgendaItem(
  userId: number,
  id: number,
  patch: Partial<{
    kind: AgendaKind;
    title: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
    allDay: boolean;
    status: AgendaStatus;
    recurrenceRule: string | null;
    financeLinkType: string | null;
    financeLinkId: number | null;
    metadata: Record<string, unknown>;
    syncToExternal: boolean;
  }>
): Promise<AgendaItemApiPayload | null> {
  const cur = await query(`SELECT * FROM agenda_items WHERE user_id = $1 AND id = $2`, [userId, id]);
  const row = cur.rows[0] as AgendaItemRow | undefined;
  if (!row) return null;

  const kind = patch.kind ?? row.kind;
  const title =
    patch.title !== undefined ? patch.title.trim().slice(0, 512) : row.title;
  const description =
    patch.description !== undefined ? patch.description : row.description ?? null;
  let starts_at = row.starts_at;
  if (patch.startsAt !== undefined) {
    const d = new Date(patch.startsAt);
    if (Number.isNaN(d.getTime())) throw new Error('INVALID_STARTS_AT');
    starts_at = d;
  }
  let ends_at: Date | null = row.ends_at;
  if (patch.endsAt !== undefined) {
    if (patch.endsAt === null || patch.endsAt === '') ends_at = null;
    else {
      const d = new Date(patch.endsAt);
      if (Number.isNaN(d.getTime())) throw new Error('INVALID_ENDS_AT');
      ends_at = d;
    }
  }
  const all_day = patch.allDay !== undefined ? Boolean(patch.allDay) : row.all_day;
  const status = patch.status ?? row.status;
  const recurrence_rule =
    patch.recurrenceRule !== undefined ? patch.recurrenceRule : row.recurrence_rule ?? null;
  const finance_link_type =
    patch.financeLinkType !== undefined ? patch.financeLinkType : row.finance_link_type ?? null;
  const finance_link_id =
    patch.financeLinkId !== undefined ? patch.financeLinkId : row.finance_link_id ?? null;
  let metadataObj = row.metadata ?? {};
  if (patch.metadata !== undefined && typeof patch.metadata === 'object' && patch.metadata !== null) {
    metadataObj = patch.metadata as Record<string, unknown>;
  }
  const sync_to_external =
    patch.syncToExternal !== undefined ? Boolean(patch.syncToExternal) : row.sync_to_external;

  const res = await query(
    `
    UPDATE agenda_items SET
      kind = $3,
      title = $4,
      description = $5,
      starts_at = $6,
      ends_at = $7,
      all_day = $8,
      status = $9,
      recurrence_rule = $10,
      finance_link_type = $11,
      finance_link_id = $12,
      metadata = $13::jsonb,
      sync_to_external = $14,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND id = $2
    RETURNING *
    `,
    [
      userId,
      id,
      kind,
      title,
      description,
      starts_at instanceof Date ? starts_at.toISOString() : starts_at,
      ends_at instanceof Date ? ends_at.toISOString() : ends_at,
      all_day,
      status,
      recurrence_rule,
      finance_link_type,
      finance_link_id,
      JSON.stringify(metadataObj),
      sync_to_external,
    ]
  );
  const updated = res.rows[0] as AgendaItemRow;
  const hm = await fetchOutboundSyncHintsForAgendaItems(userId, [updated.id]);
  return rowToPayload(updated, hm.get(updated.id));
}

export async function deleteAgendaItem(userId: number, id: number): Promise<boolean> {
  const res = await query(`DELETE FROM agenda_items WHERE user_id = $1 AND id = $2 RETURNING id`, [userId, id]);
  return (res.rows?.length ?? 0) > 0;
}

export interface AgendaConnectionSafe {
  id: number;
  provider: string;
  accountLabel: string | undefined;
  status: string;
  syncDirection: string;
  externalDefaultCalendarId: string | undefined;
  lastError: string | undefined;
  meta: Record<string, unknown>;
}

export async function listAgendaConnections(userId: number): Promise<AgendaConnectionSafe[]> {
  const res = await query(
    `
    SELECT id, provider, account_label, status, sync_direction, external_default_calendar_id,
           last_error, meta
    FROM agenda_provider_connections
    WHERE user_id = $1
    ORDER BY provider ASC
    `,
    [userId]
  );
  return res.rows.map((r: any) => ({
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
