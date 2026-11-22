import type { Direction } from './types';

export function newId(): string {
  // crypto.randomUUID only exists in secure contexts (HTTPS or localhost). The dev server opened
  // from a phone over plain http on the LAN is not one, so fall back to getRandomValues.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Timestamp for an edit to a record last stamped `previous`: now, or 1 ms after `previous` when that
 * is not in the past (a copy from a device whose clock runs ahead), so a new edit always wins the merge.
 */
export function nextTimestamp(previous?: string): string {
  const now = Date.now();
  const prev = previous === undefined ? Number.NaN : Date.parse(previous);
  return new Date(Number.isFinite(prev) && prev >= now ? prev + 1 : now).toISOString();
}

/** Card ids are deterministic (spec §4.1), so every device names a word's forward card the same way. */
export function cardId(wordId: string, direction: Direction): string {
  return `${wordId}:${direction === 'forward' ? 'f' : 'r'}`;
}
