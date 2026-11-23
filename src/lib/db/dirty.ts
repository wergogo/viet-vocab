const KEY = 'vv.sync.dirty';
/** Used when localStorage is unavailable (blocked or private mode) or refuses a write (full). */
let memorySeq = 0;
/** Set while the last write was refused: localStorage then holds an older value, and the memory one is right. */
let writeFailed = false;

/** Fires 'change' after every local edit (milestone 4 schedules a sync on it). */
export const localChanges = new EventTarget();

function readSeq(): number {
  if (writeFailed) return memorySeq;
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
    writeFailed = false;
  } catch {
    // Keep the in-memory value until a write succeeds again.
    writeFailed = true;
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
