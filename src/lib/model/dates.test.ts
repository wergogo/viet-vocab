import { describe, expect, it } from 'vitest';
import { localDate, localDateOf } from './dates';

describe('local days', () => {
  it('formats the local calendar day, zero-padded', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 10, 22, 0, 0))).toBe('2026-11-22');
  });

  it('reads the local day of a stored timestamp, and nothing from an invalid one', () => {
    const lateEvening = new Date(2026, 10, 22, 23, 30);
    expect(localDateOf(lateEvening.toISOString())).toBe('2026-11-22');
    expect(localDateOf('not a time')).toBe('');
  });
});
