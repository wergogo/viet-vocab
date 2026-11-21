import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('provides IndexedDB, localStorage and crypto', () => {
    expect(typeof indexedDB.open).toBe('function');
    expect(typeof localStorage.setItem).toBe('function');
    expect(typeof crypto.randomUUID).toBe('function');
  });
});
