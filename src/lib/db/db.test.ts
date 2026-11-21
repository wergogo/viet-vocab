import { beforeEach, describe, expect, it } from 'vitest';
import { tombstone, type Word } from '../model/types';
import { db, rederiveIfNeeded, resetDb } from './db';
import { fromRow, toRow } from './derive';

const T = '2026-01-01T00:00:00.000Z';
const word: Word = {
  id: 'w1',
  word: 'Văn Hóa',
  syllables: [{ text: 'Văn' }, { text: 'Hóa' }],
  senses: [],
  listIds: [],
  createdAt: T,
  updatedAt: T,
};

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
});

describe('VocabDB', () => {
  it('has the expected tables', async () => {
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual(['cards', 'lists', 'lookupCache', 'settings', 'words']);
  });

  it('resetDb clears every table', async () => {
    await db.lists.put({ id: 'l1', name: 'A', createdAt: T, updatedAt: T });
    await resetDb();
    expect(await db.lists.count()).toBe(0);
  });

  it('round-trips word rows and tombstones and finds cards by word id', async () => {
    await db.words.bulkPut([toRow(word), tombstone('w2', T)]);
    const stored = await db.words.get('w1');
    expect(stored && fromRow(stored)).toEqual(word);
    expect(await db.words.get('w2')).toEqual(tombstone('w2', T));
    await db.cards.bulkPut([
      { id: 'w1:f', wordId: 'w1', direction: 'forward', fsrs: {}, introducedAt: T, updatedAt: T },
      { id: 'w9:f', wordId: 'w9', direction: 'forward', fsrs: {}, introducedAt: T, updatedAt: T },
    ]);
    expect((await db.cards.where('wordId').equals('w1').toArray()).map((c) => c.id)).toEqual(['w1:f']);
  });
});

describe('rederiveIfNeeded', () => {
  it('recomputes stale derived fields once per derive version', async () => {
    await db.words.put({ ...toRow(word), searchLoose: 'stale', searchExact: 'stale', chars: ['X'] });
    expect(await rederiveIfNeeded()).toBe(true);
    expect(await db.words.get('w1')).toMatchObject({ searchLoose: 'van hoa', chars: [] });
    expect(await rederiveIfNeeded()).toBe(false);
  });
});
