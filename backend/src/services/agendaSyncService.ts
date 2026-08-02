import { query } from '../config/database';
import { syncAgendaItemToGoogleCalendar, removeAgendaItemFromGoogleCalendar } from './agendaGooglePushService';
import { syncAgendaItemToICloudCalDav, removeAgendaItemFromICloudCalDav } from './agendaICloudPushService';
import { pullGoogleAgendaEvents } from './agendaGooglePullService';
import { pullICloudAgendaEvents } from './agendaICloudPullService';
import type { AgendaExternalEventDraft } from './agendaSyncTypes';

export interface AgendaSyncResult {
  imported: number;
  updated: number;
  pushed: number;
  deleted: number;
  errors: Array<{ provider: string; message: string }>;
}

type ExternalProvider = 'GOOGLE_CALENDAR' | 'ICLOUD_CALDAV';
type SyncRange = { fromIso: string; toIso: string };

function dateOrNull(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function externalStampMs(draft: AgendaExternalEventDraft): number {
  const d = dateOrNull(draft.externalUpdatedAt) ?? dateOrNull(draft.startsAt);
  return d ? d.getTime() : 0;
}

function fallbackRange(): SyncRange {
  const now = new Date();
  return {
    fromIso: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()).toISOString(),
    toIso: new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()).toISOString(),
  };
}

async function rangesForUser(userId: number): Promise<Record<ExternalProvider, SyncRange>> {
  const res = await query(
    `
    SELECT provider, import_from, import_to
    FROM agenda_provider_connections
    WHERE user_id = $1
    `,
    [userId]
  );
  const ranges: Record<ExternalProvider, SyncRange> = {
    GOOGLE_CALENDAR: fallbackRange(),
    ICLOUD_CALDAV: fallbackRange(),
  };
  for (const row of res.rows as Array<{
    provider: string;
    import_from: Date | string | null;
    import_to: Date | string | null;
  }>) {
    if (row.provider !== 'GOOGLE_CALENDAR' && row.provider !== 'ICLOUD_CALDAV') continue;
    const from = row.import_from instanceof Date ? row.import_from : dateOrNull(row.import_from);
    const to = row.import_to instanceof Date ? row.import_to : dateOrNull(row.import_to);
    if (from && to) ranges[row.provider] = { fromIso: from.toISOString(), toIso: to.toISOString() };
  }
  return ranges;
}

async function upsertSyncState(draft: AgendaExternalEventDraft, agendaItemId: number): Promise<void> {
  await query(
    `
    INSERT INTO agenda_item_sync_state (
      agenda_item_id, connection_id, external_uid, etag, external_updated_at, last_pulled_at,
      deleted_at, last_error
    )
    VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, NULL)
    ON CONFLICT (agenda_item_id, connection_id) DO UPDATE SET
      external_uid = EXCLUDED.external_uid,
      etag = EXCLUDED.etag,
      external_updated_at = EXCLUDED.external_updated_at,
      last_pulled_at = CURRENT_TIMESTAMP,
      deleted_at = EXCLUDED.deleted_at,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    `,
    [
      agendaItemId,
      draft.connectionId,
      draft.externalUid,
      draft.etag ?? null,
      draft.externalUpdatedAt ?? null,
      draft.deleted ? new Date().toISOString() : null,
    ]
  );
}

async function findMappedAgendaItem(draft: AgendaExternalEventDraft): Promise<{
  agendaItemId: number;
  updatedAt: Date;
  deletedAt: Date | null;
} | null> {
  const res = await query(
    `
    SELECT a.id, a.updated_at, a.deleted_at
    FROM agenda_item_sync_state s
    INNER JOIN agenda_items a ON a.id = s.agenda_item_id
    WHERE s.connection_id = $1 AND s.external_uid = $2
    LIMIT 1
    `,
    [draft.connectionId, draft.externalUid]
  );
  const row = res.rows[0] as { id: number; updated_at: Date; deleted_at: Date | null } | undefined;
  if (!row) return null;
  return {
    agendaItemId: row.id,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

async function insertExternalEvent(userId: number, draft: AgendaExternalEventDraft): Promise<number> {
  const res = await query(
    `
    INSERT INTO agenda_items (
      user_id, kind, title, description, location, starts_at, ends_at, all_day, status,
      recurrence_rule, metadata, sync_to_external, external_updated_at, last_change_origin,
      sync_status, deleted_at
    )
    VALUES (
      $1, 'EVENT', $2, $3, $4, $5, $6, $7, $8,
      $9, '{}'::jsonb, true, $10, $11, 'PENDING', $12
    )
    RETURNING id
    `,
    [
      userId,
      draft.title.trim().slice(0, 512) || '(Sin titulo)',
      draft.description ?? null,
      draft.location ?? null,
      new Date(draft.startsAt).toISOString(),
      draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      draft.allDay,
      draft.status ?? 'OPEN',
      draft.recurrenceRule ?? null,
      draft.externalUpdatedAt ?? null,
      draft.provider,
      draft.deleted ? new Date().toISOString() : null,
    ]
  );
  return Number(res.rows[0].id);
}

async function applyExternalEvent(userId: number, draft: AgendaExternalEventDraft): Promise<'imported' | 'updated' | 'skipped' | 'deleted'> {
  const existing = await findMappedAgendaItem(draft);
  if (!existing) {
    if (draft.deleted) return 'skipped';
    const id = await insertExternalEvent(userId, draft);
    await upsertSyncState(draft, id);
    return 'imported';
  }

  await upsertSyncState(draft, existing.agendaItemId);

  const externalMs = externalStampMs(draft);
  const localMs = existing.updatedAt instanceof Date ? existing.updatedAt.getTime() : new Date(existing.updatedAt).getTime();
  if (externalMs <= localMs) return 'skipped';

  if (draft.deleted) {
    await query(
      `
      UPDATE agenda_items SET
        deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
        sync_status = 'PENDING',
        last_change_origin = $3,
        external_updated_at = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND id = $2
      `,
      [userId, existing.agendaItemId, draft.provider, draft.externalUpdatedAt ?? null]
    );
    return 'deleted';
  }

  await query(
    `
    UPDATE agenda_items SET
      title = $3,
      description = $4,
      location = $5,
      starts_at = $6,
      ends_at = $7,
      all_day = $8,
      status = $9,
      recurrence_rule = $10,
      external_updated_at = $11,
      last_change_origin = $12,
      sync_status = 'PENDING',
      deleted_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND id = $2
    `,
    [
      userId,
      existing.agendaItemId,
      draft.title.trim().slice(0, 512) || '(Sin titulo)',
      draft.description ?? null,
      draft.location ?? null,
      new Date(draft.startsAt).toISOString(),
      draft.endsAt ? new Date(draft.endsAt).toISOString() : null,
      draft.allDay,
      draft.status ?? 'OPEN',
      draft.recurrenceRule ?? null,
      draft.externalUpdatedAt ?? null,
      draft.provider,
    ]
  );
  return 'updated';
}

function errorMessage(error: unknown): string {
  return typeof (error as { message?: unknown })?.message === 'string'
    ? (error as { message: string }).message
    : String(error);
}

async function markOutboundFailure(
  userId: number,
  agendaItemId: number,
  provider: ExternalProvider,
  message: string
): Promise<void> {
  await Promise.all([
    query(
      `
      UPDATE agenda_item_sync_state s SET
        last_error = $4,
        updated_at = CURRENT_TIMESTAMP
      FROM agenda_provider_connections c
      WHERE s.connection_id = c.id
        AND c.user_id = $1
        AND s.agenda_item_id = $2
        AND c.provider = $3
      `,
      [userId, agendaItemId, provider, message.slice(0, 750)]
    ),
    query(
      `
      UPDATE agenda_provider_connections SET
        last_error = $3,
        status = CASE WHEN status = 'CONNECTED' THEN 'ERROR' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND provider = $2 AND status IN ('CONNECTED','ERROR')
      `,
      [userId, provider, message.slice(0, 1000)]
    ),
  ]);
}

async function pushPending(
  userId: number
): Promise<{ pushed: number; deleted: number; errors: AgendaSyncResult['errors'] }> {
  const res = await query(
    `
    SELECT id, deleted_at
    FROM agenda_items
    WHERE user_id = $1 AND sync_to_external = true AND sync_status = 'PENDING'
    ORDER BY updated_at ASC
    LIMIT 100
    `,
    [userId]
  );

  let pushed = 0;
  let deleted = 0;
  const errors: AgendaSyncResult['errors'] = [];
  for (const row of res.rows as { id: number; deleted_at: Date | null }[]) {
    const operations: Array<{ provider: ExternalProvider; operation: Promise<void> }> = row.deleted_at
      ? [
          { provider: 'GOOGLE_CALENDAR', operation: removeAgendaItemFromGoogleCalendar(userId, row.id) },
          { provider: 'ICLOUD_CALDAV', operation: removeAgendaItemFromICloudCalDav(userId, row.id) },
        ]
      : [
          { provider: 'GOOGLE_CALENDAR', operation: syncAgendaItemToGoogleCalendar(userId, row.id) },
          { provider: 'ICLOUD_CALDAV', operation: syncAgendaItemToICloudCalDav(userId, row.id) },
        ];
    const settled = await Promise.allSettled(operations.map(({ operation }) => operation));
    let failed = false;
    for (let index = 0; index < settled.length; index += 1) {
      const outcome = settled[index];
      if (outcome.status === 'fulfilled') continue;
      failed = true;
      const provider = operations[index].provider;
      const message = errorMessage(outcome.reason);
      errors.push({ provider, message });
      await markOutboundFailure(userId, row.id, provider, message);
    }
    if (failed) {
      continue;
    }
    await query(`UPDATE agenda_items SET sync_status = 'SYNCED' WHERE user_id = $1 AND id = $2`, [
      userId,
      row.id,
    ]);
    if (row.deleted_at) deleted += 1;
    else pushed += 1;
  }

  return { pushed, deleted, errors };
}

async function syncAgendaWithRanges(
  userId: number,
  providerRanges: Partial<Record<ExternalProvider, SyncRange>>
): Promise<AgendaSyncResult> {
  const result: AgendaSyncResult = {
    imported: 0,
    updated: 0,
    pushed: 0,
    deleted: 0,
    errors: [],
  };

  const [google, icloud] = await Promise.all([
    providerRanges.GOOGLE_CALENDAR
      ? pullGoogleAgendaEvents(userId, providerRanges.GOOGLE_CALENDAR)
      : Promise.resolve({ events: [], errors: [] }),
    providerRanges.ICLOUD_CALDAV
      ? pullICloudAgendaEvents(userId, providerRanges.ICLOUD_CALDAV)
      : Promise.resolve({ events: [], errors: [] }),
  ]);

  for (const message of google.errors) {
    result.errors.push({ provider: 'GOOGLE_CALENDAR', message });
  }
  for (const message of icloud.errors) {
    result.errors.push({ provider: 'ICLOUD_CALDAV', message });
  }

  for (const draft of [...google.events, ...icloud.events]) {
    const applied = await applyExternalEvent(userId, draft);
    if (applied === 'imported') result.imported += 1;
    if (applied === 'updated') result.updated += 1;
    if (applied === 'deleted') result.deleted += 1;
  }

  const pushed = await pushPending(userId);
  result.pushed += pushed.pushed;
  result.deleted += pushed.deleted;
  result.errors.push(...pushed.errors);

  return result;
}

export async function syncAgendaForUser(userId: number): Promise<AgendaSyncResult> {
  return syncAgendaWithRanges(userId, await rangesForUser(userId));
}

export async function syncAgendaImportRange(
  userId: number,
  provider: 'GOOGLE_CALENDAR' | 'ICLOUD_CALDAV',
  fromIso: string,
  toIso: string
): Promise<AgendaSyncResult> {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to.getTime() <= from.getTime()) {
    throw new Error('INVALID_IMPORT_RANGE');
  }

  const res = await query(
    `
    UPDATE agenda_provider_connections SET
      import_from = $3,
      import_to = $4,
      sync_token = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = $1 AND provider = $2 AND status IN ('CONNECTED','ERROR')
    RETURNING id
    `,
    [userId, provider, from.toISOString(), to.toISOString()]
  );
  if (res.rows.length === 0) throw new Error('PROVIDER_NOT_CONNECTED');

  return syncAgendaWithRanges(userId, {
    [provider]: { fromIso: from.toISOString(), toIso: to.toISOString() },
  });
}
