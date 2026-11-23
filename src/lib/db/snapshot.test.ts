import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileFormatError, NewerSchemaError, parseFile, serializeFile } from '../model/file';
import { fsrsState } from '../model/test-helpers';
import { tombstone, type Word } from '../model/types';
import { stripDiacritics } from '../text/normalize';
import { db, resetDb } from './db';
import { isDirty } from './dirty';
import { createList } from './lists';
import { findDuplicates, searchWords } from './search';
import { expectDerivedFieldsFresh } from './test-utils';
import { countLocalRecords, exportJson, importJson, mergeIntoLocal, readLocalData } from './snapshot';
import { createWord, deleteWord, emptyDraft, getWord, listLiveWords } from './words';

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-02T00:00:00.000Z';
const remoteWord: Word = {
  id: 'w9',
  word: 'quốc gia',
  syllables: [{ text: 'quốc', char: '國' }, { text: 'gia', char: '家' }],
  senses: [{ pos: 'Noun', meaning: 'nation' }],
  listIds: [],
  createdAt: T1,
  updatedAt: T1,
};

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
});

afterEach(expectDerivedFieldsFresh);

describe('exportJson', () => {
  it('exports live records only, without derived fields', async () => {
    const kept = await createWord({ ...emptyDraft('nhập khẩu'), senses: [{ pos: 'Verb', meaning: 'to import' }] });
    const gone = await createWord({ ...emptyDraft('xóa'), senses: [] });
    await deleteWord(gone.id);
    const file = parseFile(await exportJson(T2));
    expect(file.savedAt).toBe(T2);
    expect(file.words.map((w) => w.id)).toEqual([kept.id]);
    expect(file.words[0]).not.toHaveProperty('searchLoose');
  });
});

describe('importJson', () => {
  it('imports into an empty database, computes derived fields and marks sync dirty', async () => {
    const text = serializeFile(
      { words: [remoteWord], lists: [], cards: [], settings: { newCardsPerDay: 10, reverseCards: true, updatedAt: T1 } },
      T1,
    );
    const { applied } = await importJson(text);
    expect(applied).toBe(2);
    expect(await getWord('w9')).toEqual(remoteWord);
    expect(await db.words.get('w9')).toMatchObject({ chars: ['國', '家'] });
    expect(await db.settings.get('settings')).toEqual({ id: 'settings', newCardsPerDay: 10, reverseCards: true, updatedAt: T1 });
    expect(isDirty()).toBe(true);
  });

  it('keeps newer local edits when the file is older', async () => {
    await importJson(serializeFile({ words: [{ ...remoteWord, updatedAt: T2, notes: 'local' }], lists: [], cards: [] }, T2));
    localStorage.clear();
    const { applied } = await importJson(serializeFile({ words: [remoteWord], lists: [], cards: [] }, T1));
    expect(applied).toBe(0);
    expect((await getWord('w9'))?.notes).toBe('local');
    expect(isDirty()).toBe(false);
  });

  it('rejects foreign and newer files', async () => {
    await expect(importJson('{}')).rejects.toBeInstanceOf(FileFormatError);
    const newer = JSON.stringify({ app: 'viet-vocab', schemaVersion: 99, savedAt: T1, words: [], lists: [], cards: [] });
    await expect(importJson(newer)).rejects.toBeInstanceOf(NewerSchemaError);
  });
});

describe('mergeIntoLocal', () => {
  it('reports when the merged data should be uploaded', async () => {
    await createWord({ ...emptyDraft('nhập khẩu'), senses: [] });
    const outcome = await mergeIntoLocal({ words: [remoteWord], lists: [], cards: [] });
    expect(outcome.applied).toBe(1);
    expect(outcome.remoteStale).toBe(true);
    expect(outcome.merged.words).toHaveLength(2);
  });
});

describe('merge semantics', () => {
  const card = { id: 'w9:f', wordId: 'w9', direction: 'forward' as const, fsrs: fsrsState(T1), introducedAt: T1, updatedAt: T1 };

  it('respects tombstones in both directions', async () => {
    await mergeIntoLocal({ words: [tombstone('w9', T2)], lists: [], cards: [] });
    expect((await importJson(serializeFile({ words: [remoteWord], lists: [], cards: [] }, T1))).applied).toBe(0);
    expect(await getWord('w9')).toBeUndefined();
    await importJson(serializeFile({ words: [{ ...remoteWord, updatedAt: '2026-01-03T00:00:00.000Z' }], lists: [], cards: [] }, T1));
    expect((await getWord('w9'))?.word).toBe('quốc gia');
    await mergeIntoLocal({ words: [tombstone('w9', '2026-01-04T00:00:00.000Z')], lists: [], cards: [] });
    expect(await getWord('w9')).toBeUndefined();
  });

  it('merges lists and cards, keeping card tombstones with their wordId', async () => {
    const list = { id: 'l1', name: 'Economy', createdAt: T1, updatedAt: T1 };
    await mergeIntoLocal({ words: [remoteWord], lists: [list], cards: [card] });
    expect(await db.lists.get('l1')).toEqual(list);
    await mergeIntoLocal({ words: [], lists: [], cards: [tombstone('w9:f', T2, 'w9')] });
    expect(await db.cards.get('w9:f')).toEqual({ id: 'w9:f', updatedAt: T2, deleted: true, wordId: 'w9' });
  });

  it('does not mark dirty and reports when no upload is needed', async () => {
    const outcome = await mergeIntoLocal({ words: [remoteWord], lists: [], cards: [] });
    expect(outcome.applied).toBe(1);
    expect(outcome.remoteStale).toBe(false);
    expect(isDirty()).toBe(false);
    const again = await mergeIntoLocal({ words: [remoteWord], lists: [], cards: [] });
    expect(again).toMatchObject({ applied: 0, remoteStale: false });
  });

  it('takes the remote copy of a record stamped at the same time with different content (M4 decision 7)', async () => {
    await mergeIntoLocal({ words: [remoteWord], lists: [], cards: [] });
    const edited: Word = { ...remoteWord, notes: 'hand-edited in the repository' };
    const outcome = await mergeIntoLocal({ words: [edited], lists: [], cards: [] });
    expect(outcome).toMatchObject({ applied: 1, remoteStale: false });
    expect(await getWord('w9')).toEqual(edited);
  });

  it('merges the settings record setting by setting (M4 decision 8)', async () => {
    await db.settings.put({ id: 'settings', newCardsPerDay: 5, reverseCards: false, updatedAt: T2, changedAt: { newCardsPerDay: T2 } });
    const outcome = await mergeIntoLocal({
      words: [],
      lists: [],
      cards: [],
      settings: { newCardsPerDay: 20, reverseCards: true, updatedAt: T1, changedAt: { reverseCards: T1 } },
    });
    expect(outcome).toMatchObject({ applied: 1, remoteStale: true });
    expect(await db.settings.get('settings')).toEqual({
      id: 'settings',
      newCardsPerDay: 5,
      reverseCards: true,
      updatedAt: T2,
      changedAt: { newCardsPerDay: T2, reverseCards: T1 },
    });
  });

  it('writes nothing when the merge fails part-way', async () => {
    const spy = vi.spyOn(db.cards, 'bulkPut').mockRejectedValueOnce(new Error('disk full'));
    const text = serializeFile({ words: [remoteWord], lists: [], cards: [card] }, T1);
    await expect(importJson(text)).rejects.toThrow('disk full');
    spy.mockRestore();
    expect(await db.words.count()).toBe(0);
    expect(isDirty()).toBe(false);
  });
});

describe('countLocalRecords', () => {
  it('counts words, lists and cards, tombstones included', async () => {
    expect(await countLocalRecords()).toBe(0);
    const word = await createWord({ ...emptyDraft('nhập khẩu'), senses: [] });
    await createList('Economy');
    await db.cards.put({ id: `${word.id}:f`, wordId: word.id, direction: 'forward', fsrs: fsrsState(T1), introducedAt: T1, updatedAt: T1 });
    await deleteWord(word.id);
    await db.settings.put({ id: 'settings', newCardsPerDay: 5, reverseCards: false, updatedAt: T1 });
    expect(await countLocalRecords()).toBe(3);
  });
});

describe('readLocalData and round trips', () => {
  it('includes tombstones only when asked and strips the settings id', async () => {
    await mergeIntoLocal({
      words: [remoteWord, tombstone('w0', T1)],
      lists: [],
      cards: [],
      settings: { newCardsPerDay: 5, reverseCards: false, updatedAt: T1 },
    });
    expect((await readLocalData(true)).words).toHaveLength(2);
    const live = await readLocalData(false);
    expect(live.words.map((w) => w.id)).toEqual(['w9']);
    expect(live.settings).toEqual({ newCardsPerDay: 5, reverseCards: false, updatedAt: T1 });
  });

  it('restores an export into an empty database', async () => {
    const list = await createList('Economy');
    await createWord({ ...emptyDraft('nhập khẩu'), senses: [{ pos: 'Verb', meaning: 'to import' }], listIds: [list.id] });
    const before = await readLocalData(false);
    const text = await exportJson(T2);
    await resetDb();
    await importJson(text);
    expect(await readLocalData(false)).toEqual(before);
  });
});

describe('imported words stay findable', () => {
  it('finds every imported word by its own headword, even when the file has uncleaned text', async () => {
    const z = String.fromCodePoint(0x200b);
    // Each headword has diacritics, so searching for it uses exact mode and its stripped form uses loose mode.
    const headwords = ['nhập  khẩu ', 'văn hóa'.normalize('NFD'), `qu${z}ốc gia`];
    const words = headwords.map((word, i) => ({ ...remoteWord, id: `w${i}`, word }));
    await importJson(serializeFile({ words, lists: [], cards: [] }, T1));
    const rows = await listLiveWords();
    expect(rows.map((w) => w.word)).toEqual(headwords);
    const ids = (rs: { id: string }[]) => rs.map((r) => r.id);
    for (const w of rows) {
      expect(ids(findDuplicates(rows, w.word))).toContain(w.id);
      expect(ids(searchWords(rows, { query: w.word, sort: 'newest' }))).toContain(w.id);
      expect(ids(searchWords(rows, { query: stripDiacritics(w.word), sort: 'newest' }))).toContain(w.id);
    }
  });
});
