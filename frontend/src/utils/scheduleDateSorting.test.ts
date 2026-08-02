declare const describe: (name: string, fn: () => void) => void;
declare const it: { each: (cases: number[][]) => (name: string, fn: (...args: number[]) => void) => void };
declare const expect: (value: unknown) => { toBe: (expected: unknown) => void };

import { calendarDateToSortableMs, formatRecurringDayForPeriod } from './dateUtils';

describe('recurring schedule date sorting', () => {
  it.each([
    [9, 2026, 8, new Date(2026, 7, 9).getTime()],
    [31, 2026, 2, new Date(2026, 1, 28).getTime()],
    [31, 2028, 2, new Date(2028, 1, 29).getTime()],
  ])('sorts day %s in %s-%s by the displayed clamped date', (day, year, month, expected) => {
    const displayedDate = formatRecurringDayForPeriod(day, year, month);

    expect(calendarDateToSortableMs(displayedDate)).toBe(expected);
  });
});
