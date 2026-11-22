import { afterEach, describe, expect, it, vi } from 'vitest';
import { cardId, newId, nextTimestamp, nowIso } from './ids';

describe('newId', () => {
  it('creates distinct UUIDs', () => {
    const a = newId();
    const b = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe('cardId', () => {
  it("names a word's cards after the word and the direction (spec §4.1)", () => {
    expect([cardId('w1', 'forward'), cardId('w1', 'reverse')]).toEqual(['w1:f', 'w1:r']);
  });
});

describe('nowIso', () => {
  it('returns a UTC ISO-8601 timestamp with milliseconds', () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('newId fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a v4 UUID with getRandomValues when randomUUID is unavailable', () => {
    const real = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) });
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('nextTimestamp', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the current time when the previous stamp is in the past, missing or invalid', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    expect(nextTimestamp('2026-01-01T00:00:00.000Z')).toBe('2026-01-02T00:00:00.000Z');
    expect(nextTimestamp()).toBe('2026-01-02T00:00:00.000Z');
    expect(nextTimestamp('not a date')).toBe('2026-01-02T00:00:00.000Z');
  });

  it('steps 1 ms past a stamp from a clock that runs ahead', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    expect(nextTimestamp('2027-05-01T10:00:00.000Z')).toBe('2027-05-01T10:00:00.001Z');
    expect(nextTimestamp('2026-01-02T00:00:00.000Z')).toBe('2026-01-02T00:00:00.001Z');
  });
});
