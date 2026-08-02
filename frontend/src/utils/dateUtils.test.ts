declare const describe: (name: string, fn: () => void) => void;
declare const it: { each: (cases: unknown[][]) => (name: string, fn: (...args: unknown[]) => void) => void };
declare const expect: (value: unknown) => { toBe: (expected: unknown) => void };

import { formatRecurringDayForPeriod } from './dateUtils';

describe('formatRecurringDayForPeriod', () => {
  it.each([
    [9, 2026, 8, '09/08/2026'],
    [9, 2026, 9, '09/09/2026'],
    [31, 2026, 2, '28/02/2026'],
    [31, 2028, 2, '29/02/2028'],
    [31, 2026, 4, '30/04/2026'],
  ])('formats day %s in %s-%s as %s', (day, year, month, expected) => {
    expect(formatRecurringDayForPeriod(day as number, year as number, month as number)).toBe(expected);
  });
});
