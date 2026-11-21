import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDirty, dirtySeq, isDirty, localChanges, markDirty } from './dirty';

describe('dirty flag', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDirty();
  });

  it('marks, reports and clears local changes', () => {
    expect(isDirty()).toBe(false);
    let events = 0;
    localChanges.addEventListener('change', () => events++, { once: true });
    markDirty();
    expect(isDirty()).toBe(true);
    expect(events).toBe(1);
    clearDirty();
    expect(isDirty()).toBe(false);
  });

  it('keeps the flag when an edit happened after the sync started', () => {
    markDirty();
    const seen = dirtySeq();
    markDirty();
    clearDirty(seen);
    expect(isDirty()).toBe(true);
    clearDirty(dirtySeq());
    expect(isDirty()).toBe(false);
  });

  it('falls back to memory when localStorage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    const spies = [
      vi.spyOn(localStorage, 'getItem').mockImplementation(blocked),
      vi.spyOn(localStorage, 'setItem').mockImplementation(blocked),
      vi.spyOn(localStorage, 'removeItem').mockImplementation(blocked),
    ];
    try {
      clearDirty();
      markDirty();
      expect(isDirty()).toBe(true);
      clearDirty(dirtySeq());
      expect(isDirty()).toBe(false);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
