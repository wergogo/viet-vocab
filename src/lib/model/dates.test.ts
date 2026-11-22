import { describe, expect, it } from 'vitest';
import { localDate, startOfLocalDay } from './dates';

describe('local days', () => {
  it('formats the local calendar day, zero-padded', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 10, 22, 0, 0))).toBe('2026-11-22');
  });

  it('finds local midnight of the same day or a later one, across a month end', () => {
    expect(startOfLocalDay(new Date(2026, 10, 22, 15, 30))).toEqual(new Date(2026, 10, 22));
    expect(startOfLocalDay(new Date(2026, 10, 30, 23, 59), 1)).toEqual(new Date(2026, 11, 1));
  });
});
