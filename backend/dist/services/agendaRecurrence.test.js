"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const agendaRecurrence_1 = require("./agendaRecurrence");
function row(patch) {
    return {
        id: 1,
        user_id: 1,
        kind: 'EVENT',
        title: 'Evento',
        description: null,
        location: null,
        starts_at: new Date('2026-01-01T00:00:00.000Z'),
        ends_at: new Date('2026-01-02T00:00:00.000Z'),
        all_day: true,
        status: 'OPEN',
        recurrence_rule: null,
        timezone: null,
        finance_link_type: null,
        finance_link_id: null,
        metadata: {},
        sync_to_external: true,
        external_updated_at: null,
        last_change_origin: 'ICLOUD_CALDAV',
        sync_status: 'SYNCED',
        deleted_at: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
        updated_at: new Date('2026-01-01T00:00:00.000Z'),
        ...patch,
    };
}
describe('agenda recurrence expansion', () => {
    it('parses basic RRULE fields', () => {
        expect((0, agendaRecurrence_1.parseAgendaRRule)('FREQ=DAILY;UNTIL=20260502;INTERVAL=4')).toMatchObject({
            freq: 'DAILY',
            interval: 4,
        });
    });
    it('expands yearly birthdays into the requested window', () => {
        const rows = (0, agendaRecurrence_1.expandAgendaRecurrences)([
            row({
                starts_at: new Date('2024-04-29T00:00:00.000Z'),
                ends_at: new Date('2024-04-30T00:00:00.000Z'),
                recurrence_rule: 'FREQ=YEARLY',
            }),
        ], {
            from: new Date('2026-04-01T00:00:00.000Z'),
            to: new Date('2026-05-01T00:00:00.000Z'),
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].starts_at.toISOString()).toBe('2026-04-29T00:00:00.000Z');
        expect(rows[0].ends_at?.toISOString()).toBe('2026-04-30T00:00:00.000Z');
    });
    it('expands interval daily rules and respects UNTIL', () => {
        const rows = (0, agendaRecurrence_1.expandAgendaRecurrences)([
            row({
                starts_at: new Date('2025-05-05T00:00:00.000Z'),
                ends_at: new Date('2025-05-06T00:00:00.000Z'),
                recurrence_rule: 'FREQ=DAILY;UNTIL=20250515;INTERVAL=4',
            }),
        ], {
            from: new Date('2025-05-01T00:00:00.000Z'),
            to: new Date('2025-05-31T00:00:00.000Z'),
        });
        expect(rows.map((x) => x.starts_at.toISOString().slice(0, 10))).toEqual([
            '2025-05-05',
            '2025-05-09',
            '2025-05-13',
        ]);
    });
    it('expands weekly interval rules', () => {
        const rows = (0, agendaRecurrence_1.expandAgendaRecurrences)([
            row({
                starts_at: new Date('2024-05-24T00:00:00.000Z'),
                ends_at: new Date('2024-05-25T00:00:00.000Z'),
                recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2',
            }),
        ], {
            from: new Date('2024-06-01T00:00:00.000Z'),
            to: new Date('2024-07-01T00:00:00.000Z'),
        });
        expect(rows.map((x) => x.starts_at.toISOString().slice(0, 10))).toEqual([
            '2024-06-07',
            '2024-06-21',
        ]);
    });
});
//# sourceMappingURL=agendaRecurrence.test.js.map