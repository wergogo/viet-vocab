import { describe, expect, it } from 'vitest';
import { formatDueIn, formatInterval } from './format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatInterval', () => {
  it('uses minutes, hours, days, months and years', () => {
    expect([10_000, MINUTE, 10 * MINUTE, 5 * HOUR, 2 * DAY, 45 * DAY, 400 * DAY, 4000 * DAY].map(formatInterval)).toEqual([
      '1m',
      '1m',
      '10m',
      '5h',
      '2d',
      '1.5mo',
      '1.1y',
      '11y',
    ]);
  });

  it('picks the unit after rounding', () => {
    expect([59.6 * MINUTE, 23.6 * HOUR, 29.6 * DAY].map(formatInterval)).toEqual(['1h', '1d', '1mo']);
  });
});

describe('formatDueIn', () => {
  const now = new Date(2026, 10, 22, 21, 0);

  it('counts minutes and hours, then calendar days', () => {
    expect(formatDueIn(new Date(now.getTime() + 20_000), now)).toBe('now');
    expect(formatDueIn(new Date(now.getTime() + 10 * MINUTE), now)).toBe('in 10 minutes');
    expect(formatDueIn(new Date(now.getTime() + 2 * HOUR), now)).toBe('in 2 hours');
    expect(formatDueIn(new Date(2026, 10, 24, 9, 0), now)).toBe('in 2 days');
    expect(formatDueIn(new Date(2026, 10, 23, 23, 0), now)).toBe('tomorrow');
  });

  it('picks the unit after rounding', () => {
    expect(formatDueIn(new Date(now.getTime() + 59.6 * MINUTE), now)).toBe('in 1 hour');
    expect(formatDueIn(new Date(now.getTime() + 23.6 * HOUR), now)).toBe('tomorrow');
  });
});
