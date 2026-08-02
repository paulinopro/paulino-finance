"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockQuery = jest.fn();
const mockFetchAgendaItem = jest.fn();
const mockLoadPush = jest.fn();
const mockLoadMaintenance = jest.fn();
const mockRecordICloudError = jest.fn();
jest.mock('../config/database', () => ({ query: mockQuery }));
jest.mock('./agendaService', () => ({ fetchAgendaItemRow: mockFetchAgendaItem }));
jest.mock('./agendaICloudCaldavService', () => ({
    loadICloudDavClientForPush: mockLoadPush,
    loadICloudDavClientForMaintenance: mockLoadMaintenance,
    recordICloudConnectionError: mockRecordICloudError,
}));
const { syncAgendaItemToICloudCalDav, removeAgendaItemFromICloudCalDav, } = require('./agendaICloudPushService');
const agendaItem = {
    id: 41,
    user_id: 7,
    kind: 'EVENT',
    title: 'Agenda item',
    description: null,
    location: null,
    starts_at: new Date('2026-05-10T14:00:00.000Z'),
    ends_at: new Date('2026-05-10T15:00:00.000Z'),
    all_day: false,
    status: 'OPEN',
    recurrence_rule: null,
    finance_link_type: null,
    finance_link_id: null,
    sync_to_external: true,
    updated_at: new Date('2026-05-10T13:00:00.000Z'),
};
function failedResponse(status, message) {
    return {
        ok: false,
        status,
        statusText: message,
        text: jest.fn().mockResolvedValue(message),
        headers: { get: jest.fn().mockReturnValue(null) },
    };
}
describe('iCloud Agenda outbound failure propagation', () => {
    let warnSpy;
    beforeEach(() => {
        jest.clearAllMocks();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });
    afterEach(() => warnSpy.mockRestore());
    it('rejects when an event push fails after recording the provider error', async () => {
        mockFetchAgendaItem.mockResolvedValue(agendaItem);
        mockQuery.mockResolvedValue({ rows: [] });
        mockLoadPush.mockResolvedValue({
            connectionId: 22,
            calendar: { url: 'https://caldav.example.test/work/' },
            client: {
                createCalendarObject: jest.fn().mockResolvedValue(failedResponse(503, 'CalDAV unavailable')),
            },
        });
        await expect(syncAgendaItemToICloudCalDav(7, 41)).rejects.toThrow('CalDAV crear objeto 503');
        expect(mockRecordICloudError).toHaveBeenCalledWith(7, expect.stringContaining('CalDAV crear objeto 503'));
    });
    it('rejects a non-404 remote delete failure', async () => {
        mockQuery.mockResolvedValue({
            rows: [{ external_uid: 'https://caldav.example.test/work/event-1.ics', etag: 'v1' }],
        });
        mockLoadMaintenance.mockResolvedValue({
            connectionId: 22,
            calendar: { url: 'https://caldav.example.test/work/' },
            client: {
                deleteObject: jest.fn().mockResolvedValue(failedResponse(503, 'CalDAV unavailable')),
            },
        });
        await expect(removeAgendaItemFromICloudCalDav(7, 41)).rejects.toThrow('CalDAV DELETE 503');
    });
});
//# sourceMappingURL=agendaICloudPushService.test.js.map