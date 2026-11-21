const KEY = 'vv.sync.dirty';

/** Fires 'change' after every local edit (milestone 4 schedules a sync on it). */
export const localChanges = new EventTarget();

export function markDirty(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    // Storage unavailable: the next sync still merges everything.
  }
  localChanges.dispatchEvent(new Event('change'));
}

export function isDirty(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function clearDirty(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
