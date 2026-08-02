export type AgendaSyncProvider = 'LOCAL' | 'GOOGLE_CALENDAR' | 'ICLOUD_CALDAV';

export interface AgendaVersionStamp {
  source: string;
  updatedAt: string | Date | null | undefined;
}

export interface AgendaExternalEventDraft {
  provider: Exclude<AgendaSyncProvider, 'LOCAL'>;
  connectionId: number;
  externalUid: string;
  etag?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt?: string | null;
  allDay: boolean;
  status?: 'OPEN' | 'DONE' | 'TENTATIVE' | 'CANCELLED';
  recurrenceRule?: string | null;
  externalUpdatedAt?: string | null;
  deleted?: boolean;
}

function stampMs(value: AgendaVersionStamp): number {
  const raw = value.updatedAt;
  if (!raw) return 0;
  const date = raw instanceof Date ? raw : new Date(raw);
  const time = date.getTime();
  return Number.isFinite(time) ? time : 0;
}

export function chooseLatestAgendaVersion<T extends AgendaVersionStamp>(
  local: T,
  external: T
): T {
  return stampMs(external) > stampMs(local) ? external : local;
}
