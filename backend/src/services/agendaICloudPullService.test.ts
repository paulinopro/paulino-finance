export {};

const mockQuery = jest.fn();
const mockLoadICloud = jest.fn();
const mockRecordICloudError = jest.fn();

jest.mock('../config/database', () => ({ query: mockQuery }));
jest.mock('./agendaICloudCaldavService', () => ({
  loadICloudDavClientForMaintenance: mockLoadICloud,
  recordICloudConnectionError: mockRecordICloudError,
}));

const { pullICloudAgendaEvents } = require('./agendaICloudPullService');

describe('iCloud Agenda pull reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('emits a tombstone when a previously mapped in-range resource is missing remotely', async () => {
    mockLoadICloud.mockResolvedValue({
      connectionId: 22,
      calendar: { url: 'https://caldav.example.test/calendars/work/' },
      client: { fetchCalendarObjects: jest.fn().mockResolvedValue([]) },
    });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM agenda_item_sync_state s') && sql.includes('INNER JOIN agenda_items')) {
        return {
          rows: [
            {
              external_uid: 'https://caldav.example.test/calendars/work/event-1.ics',
              title: 'Remote event',
              description: null,
              location: null,
              starts_at: new Date('2026-05-10T14:00:00.000Z'),
              ends_at: new Date('2026-05-10T15:00:00.000Z'),
              all_day: false,
              recurrence_rule: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await pullICloudAgendaEvents(7, {
      fromIso: '2026-05-01T00:00:00.000Z',
      toIso: '2026-06-01T00:00:00.000Z',
    });

    expect(result.errors).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      provider: 'ICLOUD_CALDAV',
      connectionId: 22,
      externalUid: 'https://caldav.example.test/calendars/work/event-1.ics',
      deleted: true,
      status: 'CANCELLED',
    });
  });

  it('does not tombstone a mapped resource that was fetched but could not be parsed', async () => {
    mockLoadICloud.mockResolvedValue({
      connectionId: 22,
      calendar: { url: 'https://caldav.example.test/calendars/work/' },
      client: {
        fetchCalendarObjects: jest.fn().mockResolvedValue([
          {
            url: 'https://caldav.example.test/calendars/work/event-1.ics',
            data: 'not an icalendar',
          },
        ]),
      },
    });
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM agenda_item_sync_state s') && sql.includes('INNER JOIN agenda_items')) {
        return {
          rows: [
            {
              external_uid: 'https://caldav.example.test/calendars/work/event-1.ics',
              title: 'Remote event',
              description: null,
              location: null,
              starts_at: new Date('2026-05-10T14:00:00.000Z'),
              ends_at: new Date('2026-05-10T15:00:00.000Z'),
              all_day: false,
              recurrence_rule: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    const result = await pullICloudAgendaEvents(7, {
      fromIso: '2026-05-01T00:00:00.000Z',
      toIso: '2026-06-01T00:00:00.000Z',
    });

    expect(result.events).toEqual([]);
  });
});
