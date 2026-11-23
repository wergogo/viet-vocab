import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('provides IndexedDB, localStorage and crypto', () => {
    expect(typeof indexedDB.open).toBe('function');
    expect(typeof localStorage.setItem).toBe('function');
    expect(typeof crypto.randomUUID).toBe('function');
  });

  it('runs in Newfoundland time (UTC−3:30), so the local-day tests can fail', () => {
    expect(new Date(2026, 10, 22).getTimezoneOffset()).toBe(210);
  });
});
