import { afterEach, describe, expect, it, vi } from 'vitest';
import { newId, nowIso } from './ids';

describe('newId', () => {
  it('creates distinct UUIDs', () => {
    const a = newId();
    const b = newId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
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
