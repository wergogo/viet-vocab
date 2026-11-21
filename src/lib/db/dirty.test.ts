import { beforeEach, describe, expect, it } from 'vitest';
import { clearDirty, isDirty, localChanges, markDirty } from './dirty';

describe('dirty flag', () => {
  beforeEach(() => localStorage.clear());

  it('marks, reports and clears local changes', () => {
    expect(isDirty()).toBe(false);
    let events = 0;
    localChanges.addEventListener('change', () => events++);
    markDirty();
    expect(isDirty()).toBe(true);
    expect(events).toBe(1);
    clearDirty();
    expect(isDirty()).toBe(false);
  });
});
