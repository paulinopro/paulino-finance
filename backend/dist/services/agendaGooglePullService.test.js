"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockQuery = jest.fn();
const mockList = jest.fn();
const mockLoadGoogle = jest.fn();
const mockRecordGoogleError = jest.fn();
jest.mock('../config/database', () => ({ query: mockQuery }));
jest.mock('./agendaGoogleOAuthService', () => ({
    loadGoogleOAuthForUser: mockLoadGoogle,
    recordGoogleConnectionError: mockRecordGoogleError,
}));
jest.mock('googleapis', () => ({
    google: {
        calendar: () => ({ events: { list: mockList } }),
    },
}));
const { pullGoogleAgendaEvents } = require('./agendaGooglePullService');
function googleEvent(id, updated) {
    return {
        id,
        summary: id,
        start: { dateTime: '2026-05-10T14:00:00.000Z' },
        end: { dateTime: '2026-05-10T15:00:00.000Z' },
        updated,
        status: 'confirmed',
    };
}
describe('Google Agenda pull pagination', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLoadGoogle.mockResolvedValue({
            connectionId: 31,
            calendarId: 'primary',
            client: {},
        });
    });
    it('collects every page and stores the sync token only after the final page', async () => {
        const writes = [];
        mockQuery.mockImplementation(async (sql, params) => {
            if (sql.includes('SELECT sync_token'))
                return { rows: [{ sync_token: null }] };
            if (sql.includes('UPDATE agenda_provider_connections SET'))
                writes.push(params || []);
            return { rows: [] };
        });
        mockList
            .mockResolvedValueOnce({
            data: {
                items: [googleEvent('first', '2026-05-10T16:00:00.000Z')],
                nextPageToken: 'page-2',
            },
        })
            .mockResolvedValueOnce({
            data: {
                items: [googleEvent('second', '2026-05-10T17:00:00.000Z')],
                nextSyncToken: 'sync-final',
            },
        });
        const result = await pullGoogleAgendaEvents(7, {
            fromIso: '2026-05-01T00:00:00.000Z',
            toIso: '2026-06-01T00:00:00.000Z',
        });
        expect(result.events.map((event) => event.externalUid)).toEqual([
            'first',
            'second',
        ]);
        expect(mockList).toHaveBeenNthCalledWith(2, expect.objectContaining({ pageToken: 'page-2' }));
        expect(writes).toEqual([[31, 'sync-final']]);
    });
    it('clears an invalid sync token and immediately retries once with the configured range', async () => {
        mockQuery.mockImplementation(async (sql) => {
            if (sql.includes('SELECT sync_token'))
                return { rows: [{ sync_token: 'stale-token' }] };
            return { rows: [] };
        });
        const invalidTokenError = Object.assign(new Error('Sync token is no longer valid'), { code: 410 });
        mockList
            .mockRejectedValueOnce(invalidTokenError)
            .mockResolvedValueOnce({
            data: {
                items: [googleEvent('recovered', '2026-05-10T18:00:00.000Z')],
                nextSyncToken: 'fresh-token',
            },
        });
        const result = await pullGoogleAgendaEvents(7, {
            fromIso: '2026-05-01T00:00:00.000Z',
            toIso: '2026-06-01T00:00:00.000Z',
        });
        expect(result.errors).toEqual([]);
        expect(result.events).toHaveLength(1);
        expect(mockList).toHaveBeenNthCalledWith(1, expect.objectContaining({ syncToken: 'stale-token' }));
        expect(mockList).toHaveBeenNthCalledWith(2, expect.objectContaining({
            timeMin: '2026-05-01T00:00:00.000Z',
            timeMax: '2026-06-01T00:00:00.000Z',
        }));
        expect(mockRecordGoogleError).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=agendaGooglePullService.test.js.map