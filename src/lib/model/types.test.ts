import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isLive, tombstone, type List, type Rec } from './types';

describe('isLive / tombstone', () => {
  it('separates live records from tombstones', () => {
    const live: Rec<List> = { id: 'a', name: 'A', createdAt: 't1', updatedAt: 't1' };
    const dead: Rec<List> = tombstone('b', 't2');
    expect(isLive(live)).toBe(true);
    expect(isLive(dead)).toBe(false);
  });

  it('builds tombstones with an optional wordId', () => {
    expect(tombstone('b', 't2')).toEqual({ id: 'b', updatedAt: 't2', deleted: true });
    expect(tombstone('c', 't3', 'w1')).toEqual({ id: 'c', updatedAt: 't3', deleted: true, wordId: 'w1' });
  });

  it('has the spec defaults for review settings', () => {
    expect(DEFAULT_SETTINGS).toEqual({ newCardsPerDay: 20, reverseCards: false });
  });
});
