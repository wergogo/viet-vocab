import { describe, expect, it } from 'vitest';
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
