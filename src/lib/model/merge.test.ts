import { describe, expect, it } from 'vitest';
import { mergeRecords, mergeSettings } from './merge';
import type { Settings } from './types';

type R = { id: string; updatedAt: string; v?: string; deleted?: true };
const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-02T00:00:00.000Z';
const T3 = '2026-01-03T00:00:00.000Z';

describe('mergeRecords', () => {
  it('keeps local-only records and marks the remote stale', () => {
    const r = mergeRecords<R>([{ id: 'a', updatedAt: T1 }], []);
    expect(r.merged).toEqual([{ id: 'a', updatedAt: T1 }]);
    expect(r.toApply).toEqual([]);
    expect(r.remoteStale).toBe(true);
  });

  it('applies remote-only records locally', () => {
    const r = mergeRecords<R>([], [{ id: 'a', updatedAt: T1 }]);
    expect(r.toApply).toEqual([{ id: 'a', updatedAt: T1 }]);
    expect(r.remoteStale).toBe(false);
  });

  it('lets the newer local copy win', () => {
    const r = mergeRecords<R>([{ id: 'a', updatedAt: T2, v: 'local' }], [{ id: 'a', updatedAt: T1, v: 'remote' }]);
    expect(r.merged[0]?.v).toBe('local');
    expect(r.toApply).toEqual([]);
    expect(r.remoteStale).toBe(true);
  });

  it('lets the newer remote copy win', () => {
    const r = mergeRecords<R>([{ id: 'a', updatedAt: T1, v: 'local' }], [{ id: 'a', updatedAt: T2, v: 'remote' }]);
    expect(r.merged[0]?.v).toBe('remote');
    expect(r.toApply).toEqual([{ id: 'a', updatedAt: T2, v: 'remote' }]);
    expect(r.remoteStale).toBe(false);
  });

  it('keeps the remote copy on a tie, and applies it locally when the content differs (M4 decision 7)', () => {
    const remote = { id: 'a', updatedAt: T1, v: 'remote' };
    const r = mergeRecords<R>([{ id: 'a', updatedAt: T1, v: 'local' }], [remote]);
    expect(r.merged[0]).toBe(remote);
    expect(r.toApply).toEqual([remote]);
    expect(r.remoteStale).toBe(false);
  });

  it('applies nothing on a tie between copies with the same content, whatever their key order', () => {
    const same = mergeRecords([{ id: 'a', updatedAt: T1, v: { x: 1, y: [1, 2] } }], [{ v: { y: [1, 2], x: 1 }, updatedAt: T1, id: 'a' }]);
    expect(same.toApply).toEqual([]);
    expect(same.remoteStale).toBe(false);
    const reordered = mergeRecords([{ id: 'a', updatedAt: T1, v: [1, 2] }], [{ id: 'a', updatedAt: T1, v: [2, 1] }]);
    expect(reordered.toApply).toHaveLength(1);
  });

  it('lets a newer deletion beat an older edit', () => {
    const r = mergeRecords<R>([{ id: 'a', updatedAt: T2, v: 'edited' }], [{ id: 'a', updatedAt: T3, deleted: true }]);
    expect(r.merged).toEqual([{ id: 'a', updatedAt: T3, deleted: true }]);
    expect(r.toApply).toEqual([{ id: 'a', updatedAt: T3, deleted: true }]);
    expect(r.remoteStale).toBe(false);
  });

  it('returns merged records sorted by id', () => {
    const r = mergeRecords<R>([{ id: 'c', updatedAt: T1 }, { id: 'a', updatedAt: T1 }], [{ id: 'b', updatedAt: T1 }]);
    expect(r.merged.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('is idempotent: merging the result again changes nothing', () => {
    const local: R[] = [{ id: 'a', updatedAt: T2 }, { id: 'b', updatedAt: T1 }];
    const remote: R[] = [{ id: 'a', updatedAt: T1 }, { id: 'c', updatedAt: T3 }];
    const first = mergeRecords<R>(local, remote);
    const again = mergeRecords<R>(first.merged, first.merged);
    expect(again.toApply).toEqual([]);
    expect(again.remoteStale).toBe(false);
    expect(mergeRecords<R>(first.merged, remote).toApply).toEqual([]);
  });

  it('reports changes on both sides at once', () => {
    const r = mergeRecords<R>([{ id: 'a', updatedAt: T2 }], [{ id: 'b', updatedAt: T1 }]);
    expect(r.toApply.map((x) => x.id)).toEqual(['b']);
    expect(r.remoteStale).toBe(true);
  });

  it('lets a newer edit beat an older deletion', () => {
    const r = mergeRecords<R>([{ id: 'a', updatedAt: T1, deleted: true }], [{ id: 'a', updatedAt: T2, v: 'restored' }]);
    expect(r.merged).toEqual([{ id: 'a', updatedAt: T2, v: 'restored' }]);
    expect(r.toApply).toEqual([{ id: 'a', updatedAt: T2, v: 'restored' }]);
  });

  it('handles empty inputs and does not mutate its arguments', () => {
    expect(mergeRecords<R>([], [])).toEqual({ merged: [], toApply: [], remoteStale: false });
    const local: R[] = [{ id: 'b', updatedAt: T1 }, { id: 'a', updatedAt: T1 }];
    const snapshot = JSON.stringify(local);
    mergeRecords<R>(local, []);
    expect(JSON.stringify(local)).toBe(snapshot);
  });
});

describe('mergeSettings', () => {
  /** A settings record as saved before M4, without the time of each change. */
  const older = (updatedAt: string, newCardsPerDay: number, reverseCards = false): Settings => ({ newCardsPerDay, reverseCards, updatedAt });

  it('handles missing sides', () => {
    const s = older(T1, 5);
    expect(mergeSettings(undefined, undefined)).toEqual({ merged: undefined, applyLocal: false, remoteStale: false });
    expect(mergeSettings(s, undefined)).toEqual({ merged: s, applyLocal: false, remoteStale: true });
    expect(mergeSettings(undefined, s)).toEqual({ merged: s, applyLocal: true, remoteStale: false });
  });

  it('keeps the latest change of each setting, so changes to different settings on two devices both survive', () => {
    // A new device changed only the daily limit; the other device had turned reverse cards on earlier.
    const phone: Settings = { newCardsPerDay: 10, reverseCards: false, updatedAt: T2, changedAt: { newCardsPerDay: T2 } };
    const desktop: Settings = { newCardsPerDay: 20, reverseCards: true, updatedAt: T1, changedAt: { reverseCards: T1 } };
    const r = mergeSettings(phone, desktop);
    expect(r.merged).toEqual({
      newCardsPerDay: 10,
      reverseCards: true,
      updatedAt: T2,
      changedAt: { newCardsPerDay: T2, reverseCards: T1 },
    });
    expect(r.applyLocal).toBe(true);
    expect(r.remoteStale).toBe(true);
    expect(mergeSettings(desktop, phone).merged).toEqual(r.merged);
  });

  it('counts every setting of a record from before M4 as changed at its updatedAt', () => {
    const remote: Settings = { newCardsPerDay: 30, reverseCards: false, updatedAt: T3, changedAt: { newCardsPerDay: T3 } };
    expect(mergeSettings(older(T2, 5, true), remote).merged).toEqual({
      newCardsPerDay: 30,
      reverseCards: true,
      updatedAt: T3,
      changedAt: { newCardsPerDay: T3, reverseCards: T2 },
    });
  });

  it('keeps the remote value on a tie, and reports no work when both sides agree', () => {
    const local: Settings = { newCardsPerDay: 5, reverseCards: false, updatedAt: T1, changedAt: { newCardsPerDay: T1 } };
    const remote: Settings = { ...local, newCardsPerDay: 9 };
    expect(mergeSettings(local, remote)).toEqual({ merged: remote, applyLocal: true, remoteStale: false });
    expect(mergeSettings({ ...remote, changedAt: { newCardsPerDay: T1 } }, remote)).toEqual({
      merged: remote,
      applyLocal: false,
      remoteStale: false,
    });
  });

  it('treats the same times in a different key order as the same record', () => {
    const local: Settings = { newCardsPerDay: 5, reverseCards: true, updatedAt: T2, changedAt: { newCardsPerDay: T1, reverseCards: T2 } };
    const remote: Settings = { ...local, changedAt: { reverseCards: T2, newCardsPerDay: T1 } };
    const r = mergeSettings(local, remote);
    expect(r.applyLocal).toBe(false);
    expect(r.remoteStale).toBe(false);
  });

  it('settles after a round trip between two devices that each changed a different setting', () => {
    const a: Settings = { newCardsPerDay: 10, reverseCards: false, updatedAt: T2, changedAt: { newCardsPerDay: T2 } };
    const b: Settings = { newCardsPerDay: 20, reverseCards: true, updatedAt: T3, changedAt: { reverseCards: T3 } };
    // A merges B's record from the file and would push the result.
    const first = mergeSettings(a, b);
    expect(first.remoteStale).toBe(true);
    // B merges A's result, then A merges B's.
    const second = mergeSettings(b, first.merged);
    const third = mergeSettings(first.merged, second.merged);
    expect(third.applyLocal).toBe(false);
    expect(third.remoteStale).toBe(false);
    expect(third.merged).toMatchObject({ newCardsPerDay: 10, reverseCards: true });
    expect(second.merged).toMatchObject({ newCardsPerDay: 10, reverseCards: true });
  });
});
