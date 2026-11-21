import { describe, expect, it } from 'vitest';
import { mergeRecords, mergeSingle } from './merge';

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

  it('treats equal timestamps as identical and keeps the remote copy', () => {
    const remote = { id: 'a', updatedAt: T1, v: 'remote' };
    const r = mergeRecords<R>([{ id: 'a', updatedAt: T1, v: 'local' }], [remote]);
    expect(r.merged[0]).toBe(remote);
    expect(r.toApply).toEqual([]);
    expect(r.remoteStale).toBe(false);
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

describe('mergeSingle', () => {
  const s = (updatedAt: string, n: number) => ({ updatedAt, newCardsPerDay: n });

  it('handles missing sides', () => {
    expect(mergeSingle(undefined, undefined)).toEqual({ winner: undefined, applyLocal: false, remoteStale: false });
    expect(mergeSingle(s(T1, 5), undefined)).toEqual({ winner: s(T1, 5), applyLocal: false, remoteStale: true });
    expect(mergeSingle(undefined, s(T1, 5))).toEqual({ winner: s(T1, 5), applyLocal: true, remoteStale: false });
  });

  it('picks the newer side', () => {
    expect(mergeSingle(s(T2, 5), s(T1, 9))).toEqual({ winner: s(T2, 5), applyLocal: false, remoteStale: true });
    expect(mergeSingle(s(T1, 5), s(T2, 9))).toEqual({ winner: s(T2, 9), applyLocal: true, remoteStale: false });
    expect(mergeSingle(s(T1, 5), s(T1, 9))).toEqual({ winner: s(T1, 9), applyLocal: false, remoteStale: false });
  });
});
