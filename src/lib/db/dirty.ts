const KEY = 'vv.sync.dirty';
/** Used when localStorage is unavailable (blocked or private mode). */
let memorySeq = 0;

/** Fires 'change' after every local edit (milestone 4 schedules a sync on it). */
export const localChanges = new EventTarget();

function readSeq(): number {
  try {
    const value = Number(localStorage.getItem(KEY) ?? '0');
    return Number.isFinite(value) ? value : 0;
  } catch {
    return memorySeq;
  }
}

function writeSeq(value: number): void {
  memorySeq = value;
  try {
    if (value === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(value));
  } catch {
    // Keep the in-memory value.
  }
}

/** Records a local edit: bumps the change counter and notifies listeners. */
export function markDirty(): void {
  writeSeq(readSeq() + 1);
  localChanges.dispatchEvent(new Event('change'));
}

/** The change counter; 0 means nothing is waiting to sync. */
export function dirtySeq(): number {
  return readSeq();
}

export function isDirty(): boolean {
  return readSeq() > 0;
}

/**
 * Clears the counter. A sync cycle passes the value it read when it started, so an edit made
 * during the cycle keeps the flag set. Without an argument it clears unconditionally.
 */
export function clearDirty(seen?: number): void {
  if (seen === undefined || readSeq() === seen) writeSeq(0);
}
