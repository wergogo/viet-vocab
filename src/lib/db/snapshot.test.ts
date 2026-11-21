import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileFormatError, NewerSchemaError, parseFile, serializeFile } from '../model/file';
import type { Word } from '../model/types';
import { db, resetDb } from './db';
import { isDirty } from './dirty';
import { expectDerivedFieldsFresh } from './test-utils';
import { exportJson, importJson, mergeIntoLocal } from './snapshot';
import { createWord, deleteWord, emptyDraft, getWord } from './words';

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
