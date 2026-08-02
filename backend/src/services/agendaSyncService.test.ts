export {};

const mockQuery = jest.fn();
const mockPullGoogle = jest.fn();
const mockPullICloud = jest.fn();
const mockPushGoogle = jest.fn();
const mockPushICloud = jest.fn();
const mockDeleteGoogle = jest.fn();
const mockDeleteICloud = jest.fn();

jest.mock('../config/database', () => ({ query: mockQuery }));
jest.mock('./agendaGooglePullService', () => ({ pullGoogleAgendaEvents: mockPullGoogle }));
jest.mock('./agendaICloudPullService', () => ({ pullICloudAgendaEvents: mockPullICloud }));
jest.mock('./agendaGooglePushService', () => ({
  syncAgendaItemToGoogleCalendar: mockPushGoogle,
  removeAgendaItemFromGoogleCalendar: mockDeleteGoogle,
}));
jest.mock('./agendaICloudPushService', () => ({
  syncAgendaItemToICloudCalDav: mockPushICloud,
  removeAgendaItemFromICloudCalDav: mockDeleteICloud,
}));

const { syncAgendaForUser, syncAgendaImportRange } = require('./agendaSyncService');

const emptyPull = { events: [], errors: [] };

function normalized(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('agenda synchronization orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPullGoogle.mockResolvedValue(emptyPull);
    mockPullICloud.mockResolvedValue(emptyPull);
    mockPushGoogle.mockResolvedValue(undefined);
    mockPushICloud.mockResolvedValue(undefined);
    mockDeleteGoogle.mockResolvedValue(undefined);
    mockDeleteICloud.mockResolvedValue(undefined);
  });

  it('keeps a failed outbound item pending and reports the provider error', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      const text = normalized(sql);
      if (text.includes('SELECT provider, import_from, import_to')) return { rows: [] };
      if (text.includes('SELECT id, deleted_at')) return { rows: [{ id: 41, deleted_at: null }] };
      return { rows: [] };
    });
    mockPushGoogle.mockRejectedValue(new Error('Google quota exceeded'));

    const result = await syncAgendaForUser(7);

    expect(result.pushed).toBe(0);
    expect(result.errors).toContainEqual({
      provider: 'GOOGLE_CALENDAR',
      message: 'Google quota exceeded',
    });
    const syncedWrite = mockQuery.mock.calls.find(
      ([sql]) => normalized(sql).includes("sync_status = 'SYNCED'")
    );
    expect(syncedWrite).toBeUndefined();
  });

  it('uses each connected provider import range during a normal sync', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      const text = normalized(sql);
      if (text.includes('SELECT provider, import_from, import_to')) {
        return {
          rows: [
            {
              provider: 'GOOGLE_CALENDAR',
              import_from: new Date('2026-01-01T00:00:00.000Z'),
              import_to: new Date('2026-02-01T00:00:00.000Z'),
            },
            {
              provider: 'ICLOUD_CALDAV',
              import_from: new Date('2025-03-01T00:00:00.000Z'),
              import_to: new Date('2027-04-01T00:00:00.000Z'),
            },
          ],
        };
      }
      if (text.includes('SELECT id, deleted_at')) return { rows: [] };
      return { rows: [] };
    });

    await syncAgendaForUser(7);

    expect(mockPullGoogle).toHaveBeenCalledWith(7, {
      fromIso: '2026-01-01T00:00:00.000Z',
      toIso: '2026-02-01T00:00:00.000Z',
    });
    expect(mockPullICloud).toHaveBeenCalledWith(7, {
      fromIso: '2025-03-01T00:00:00.000Z',
      toIso: '2027-04-01T00:00:00.000Z',
    });
  });

  it('imports only the selected provider with the requested range', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      const text = normalized(sql);
      if (text.startsWith('UPDATE agenda_provider_connections SET')) return { rows: [{ id: 12 }] };
      if (text.includes('SELECT id, deleted_at')) return { rows: [] };
      return { rows: [] };
    });

    await syncAgendaImportRange(
      7,
      'ICLOUD_CALDAV',
      '2024-01-01T00:00:00.000Z',
      '2028-01-01T00:00:00.000Z'
    );

    expect(mockPullGoogle).not.toHaveBeenCalled();
    expect(mockPullICloud).toHaveBeenCalledTimes(1);
    expect(mockPullICloud).toHaveBeenCalledWith(7, {
      fromIso: '2024-01-01T00:00:00.000Z',
      toIso: '2028-01-01T00:00:00.000Z',
    });
  });
});
