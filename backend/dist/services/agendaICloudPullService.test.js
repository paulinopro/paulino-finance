"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockQuery = jest.fn();
const mockLoadICloud = jest.fn();
const mockRecordICloudError = jest.fn();
jest.mock('../config/database', () => ({ query: mockQuery }));
jest.mock('./agendaICloudCaldavService', () => ({
    loadICloudDavClientForMaintenance: mockLoadICloud,
    recordICloudConnectionError: mockRecordICloudError,
}));
const { pullICloudAgendaEvents } = require('./agendaICloudPullService');
const validIcs = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:event-1@example.test',
    'SUMMARY:Consulta',
    'DTSTART:20260525T140000Z',
    'DTEND:20260525T150000Z',
    'LAST-MODIFIED:20260525T130000Z',
    'END:VEVENT',
    'END:VCALENDAR',
].join('\r\n');
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
        mockQuery.mockImplementation(async (sql) => {
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
        mockQuery.mockImplementation(async (sql) => {
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
    it('uses the CalDAV resource URL as the external write/delete locator', async () => {
        mockLoadICloud.mockResolvedValue({
            connectionId: 22,
            calendar: { url: 'https://caldav.example.test/calendars/work/' },
            client: {
                fetchCalendarObjects: jest.fn().mockResolvedValue([
                    {
                        url: 'https://caldav.example.test/calendars/work/event-1.ics',
                        data: validIcs,
                        etag: 'v1',
                    },
                ]),
            },
        });
        mockQuery.mockImplementation(async (sql) => {
            if (sql.includes('FROM agenda_item_sync_state s') && sql.includes('INNER JOIN agenda_items')) {
                return { rows: [] };
            }
            return { rows: [] };
        });
        const result = await pullICloudAgendaEvents(7, {
            fromIso: '2026-05-01T00:00:00.000Z',
            toIso: '2026-06-01T00:00:00.000Z',
        });
        expect(result.events[0].externalUid).toBe('https://caldav.example.test/calendars/work/event-1.ics');
    });
    it('migrates a legacy UID mapping to the fetched CalDAV resource URL', async () => {
        const writes = [];
        mockLoadICloud.mockResolvedValue({
            connectionId: 22,
            calendar: { url: 'https://caldav.example.test/calendars/work/' },
            client: {
                fetchCalendarObjects: jest.fn().mockResolvedValue([
                    {
                        url: 'https://caldav.example.test/calendars/work/event-1.ics',
                        data: validIcs,
                        etag: 'v1',
                    },
                ]),
            },
        });
        mockQuery.mockImplementation(async (sql, params) => {
            if (sql.includes('FROM agenda_item_sync_state s') && sql.includes('INNER JOIN agenda_items')) {
                return {
                    rows: [
                        {
                            agenda_item_id: 55,
                            external_uid: 'event-1@example.test',
                            title: 'Consulta',
                            description: null,
                            location: null,
                            starts_at: new Date('2026-05-25T14:00:00.000Z'),
                            ends_at: new Date('2026-05-25T15:00:00.000Z'),
                            all_day: false,
                            recurrence_rule: null,
                        },
                    ],
                };
            }
            if (sql.includes('UPDATE agenda_item_sync_state SET external_uid'))
                writes.push({ sql, params });
            return { rows: [] };
        });
        const result = await pullICloudAgendaEvents(7, {
            fromIso: '2026-05-01T00:00:00.000Z',
            toIso: '2026-06-01T00:00:00.000Z',
        });
        expect(result.events[0].externalUid).toBe('https://caldav.example.test/calendars/work/event-1.ics');
        expect(writes[0]?.params).toEqual([55, 22, 'https://caldav.example.test/calendars/work/event-1.ics']);
    });
});
//# sourceMappingURL=agendaICloudPullService.test.js.map