"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mockQuery = jest.fn();
const mockFetchAgendaItem = jest.fn();
const mockLoadGoogle = jest.fn();
const mockRecordGoogleError = jest.fn();
const mockInsert = jest.fn();
const mockPatch = jest.fn();
const mockDelete = jest.fn();
jest.mock('../config/database', () => ({ query: mockQuery }));
jest.mock('./agendaService', () => ({ fetchAgendaItemRow: mockFetchAgendaItem }));
jest.mock('./agendaGoogleOAuthService', () => ({
    loadGoogleOAuthForUser: mockLoadGoogle,
    recordGoogleConnectionError: mockRecordGoogleError,
}));
jest.mock('googleapis', () => ({
    google: {
        calendar: () => ({
            events: { insert: mockInsert, patch: mockPatch, delete: mockDelete },
        }),
    },
}));
const { syncAgendaItemToGoogleCalendar, removeAgendaItemFromGoogleCalendar, } = require('./agendaGooglePushService');
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
describe('Google Agenda outbound failure propagation', () => {
    let warnSpy;
    beforeEach(() => {
        jest.clearAllMocks();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        mockLoadGoogle.mockResolvedValue({
            connectionId: 31,
            calendarId: 'primary',
            client: {},
        });
    });
    afterEach(() => warnSpy.mockRestore());
    it('rejects when an event push fails after recording the provider error', async () => {
        mockFetchAgendaItem.mockResolvedValue(agendaItem);
        mockQuery.mockResolvedValue({ rows: [] });
        mockInsert.mockRejectedValue(new Error('Google quota exceeded'));
        await expect(syncAgendaItemToGoogleCalendar(7, 41)).rejects.toThrow('Google quota exceeded');
        expect(mockRecordGoogleError).toHaveBeenCalledWith(7, 'Google quota exceeded');
    });
    it('rejects a non-404 remote delete failure', async () => {
        mockQuery.mockResolvedValue({
            rows: [{ external_uid: 'google-event-1', calendar_id: 'primary' }],
        });
        mockDelete.mockRejectedValue(Object.assign(new Error('Google unavailable'), { code: 503 }));
        await expect(removeAgendaItemFromGoogleCalendar(7, 41)).rejects.toThrow('Google unavailable');
    });
});
//# sourceMappingURL=agendaGooglePushService.test.js.map