import { parseFirstVEvent } from './agendaIcsParser';

describe('parseFirstVEvent', () => {
  it('parses a timed VEVENT into an agenda draft', () => {
    const parsed = parseFirstVEvent([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:event-1@example.test',
      'SUMMARY:Consulta',
      'DESCRIPTION:Revision anual',
      'LOCATION:Santo Domingo',
      'DTSTART:20260525T140000Z',
      'DTEND:20260525T150000Z',
      'LAST-MODIFIED:20260525T130000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));

    expect(parsed?.externalUid).toBe('event-1@example.test');
    expect(parsed?.title).toBe('Consulta');
    expect(parsed?.description).toBe('Revision anual');
    expect(parsed?.location).toBe('Santo Domingo');
    expect(parsed?.startsAt).toBe('2026-05-25T14:00:00.000Z');
    expect(parsed?.endsAt).toBe('2026-05-25T15:00:00.000Z');
    expect(parsed?.externalUpdatedAt).toBe('2026-05-25T13:00:00.000Z');
    expect(parsed?.allDay).toBe(false);
  });

  it('parses an all-day VEVENT', () => {
    const parsed = parseFirstVEvent([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:event-2@example.test',
      'SUMMARY:Dia completo',
      'DTSTART;VALUE=DATE:20260525',
      'DTEND;VALUE=DATE:20260526',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n'));

    expect(parsed?.allDay).toBe(true);
    expect(parsed?.startsAt).toBe('2026-05-25T00:00:00.000Z');
    expect(parsed?.endsAt).toBe('2026-05-26T00:00:00.000Z');
  });
});
