import { describe, expect, it } from 'vitest';
import { FileFormatError, NewerSchemaError, SCHEMA_VERSION, parseFile, serializeFile, type VocabData } from './file';
import { tombstone } from './types';

const T = '2026-01-01T00:00:00.000Z';
const data: VocabData = {
  words: [
    { id: 'w2', word: 'nhập khẩu', syllables: [{ text: 'nhập', char: '入' }, { text: 'khẩu', char: '口' }], senses: [{ pos: 'Verb', meaning: 'to import' }], listIds: [], createdAt: T, updatedAt: T },
    tombstone('w1', T),
  ],
  lists: [{ id: 'l1', name: 'Economy', createdAt: T, updatedAt: T }],
  cards: [],
  settings: { newCardsPerDay: 20, reverseCards: false, updatedAt: T },
};

describe('serializeFile / parseFile', () => {
  it('round-trips data with records sorted by id', () => {
    const text = serializeFile(data, T);
    const file = parseFile(text);
    expect(file.app).toBe('viet-vocab');
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    expect(file.savedAt).toBe(T);
    expect(file.words.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(file.lists).toEqual(data.lists);
    expect(file.settings).toEqual(data.settings);
  });

  it('pretty-prints with two spaces and a trailing newline', () => {
    const text = serializeFile(data, T);
    expect(text.startsWith('{\n  "app": "viet-vocab"')).toBe(true);
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('omits settings when there are none', () => {
    const file = parseFile(serializeFile({ words: [], lists: [], cards: [] }, T));
    expect(file.settings).toBeUndefined();
  });
});

describe('parseFile errors', () => {
  it('rejects invalid JSON and foreign files', () => {
    expect(() => parseFile('not json')).toThrow(FileFormatError);
    expect(() => parseFile('{"app":"other","schemaVersion":1,"words":[],"lists":[],"cards":[]}')).toThrow(FileFormatError);
  });

  it('rejects files from a newer app version', () => {
    const text = JSON.stringify({ app: 'viet-vocab', schemaVersion: SCHEMA_VERSION + 1, savedAt: T, words: [], lists: [], cards: [] });
    expect(() => parseFile(text)).toThrow(NewerSchemaError);
  });

  it('rejects missing collections and records without id/updatedAt', () => {
    expect(() => parseFile(JSON.stringify({ app: 'viet-vocab', schemaVersion: 1, savedAt: T, words: [], lists: [] }))).toThrow(FileFormatError);
    expect(() => parseFile(JSON.stringify({ app: 'viet-vocab', schemaVersion: 1, savedAt: T, words: [{ id: 'x' }], lists: [], cards: [] }))).toThrow(FileFormatError);
  });

  it('rejects non-canonical timestamps and duplicate ids', () => {
    const base = { app: 'viet-vocab', schemaVersion: 1, savedAt: T, lists: [], cards: [] };
    for (const updatedAt of ['2026-01-01T00:00:00Z', '2026-01-01T07:00:00.000+07:00', '2026-13-01T00:00:00.000Z', 'zzz']) {
      expect(() => parseFile(JSON.stringify({ ...base, words: [{ id: 'w', updatedAt }] }))).toThrow(FileFormatError);
    }
    const twice = [{ id: 'w', updatedAt: T, deleted: true }, { id: 'w', updatedAt: T, deleted: true }];
    expect(() => parseFile(JSON.stringify({ ...base, words: twice }))).toThrow(FileFormatError);
  });

  it('rejects an invalid settings record', () => {
    const base = { app: 'viet-vocab', schemaVersion: 1, savedAt: T, words: [], lists: [], cards: [] };
    const bad = [
      { newCardsPerDay: '20', reverseCards: false, updatedAt: T },
      { newCardsPerDay: 20, reverseCards: false, updatedAt: 'later' },
    ];
    for (const settings of bad) {
      expect(() => parseFile(JSON.stringify({ ...base, settings }))).toThrow(FileFormatError);
    }
  });
});

describe('parseFile record validation', () => {
  const base = { app: 'viet-vocab', schemaVersion: 1, savedAt: T, words: [], lists: [], cards: [] };
  const parse = (over: Record<string, unknown>) => () => parseFile(JSON.stringify({ ...base, ...over }));

  it('rejects live records that are missing fields the app reads', () => {
    expect(parse({ words: [{ id: 'w', updatedAt: T }] })).toThrow('Word #1 (id w) has no word text.');
    expect(parse({ words: [{ id: 'w', updatedAt: T, word: 'x', syllables: [], senses: [], listIds: 'l1' }] })).toThrow(FileFormatError);
    expect(parse({ lists: [{ id: 'l', updatedAt: T }] })).toThrow('List #1 (id l) has no name.');
    expect(parse({ cards: [{ id: 'c', updatedAt: T, wordId: 'w', direction: 'sideways', fsrs: {}, introducedAt: T }] })).toThrow(FileFormatError);
    expect(parse({ cards: [{ id: 'c', updatedAt: T, wordId: 'w', direction: 'forward', fsrs: null, introducedAt: T }] })).toThrow(FileFormatError);
  });

  it('accepts bare tombstones but rejects odd deleted flags, non-records and duplicate list ids', () => {
    expect(parse({ words: [{ id: 'w', updatedAt: T, deleted: true }] })).not.toThrow();
    expect(parse({ words: [{ id: 'w', updatedAt: T, deleted: 'yes' }] })).toThrow(FileFormatError);
    expect(parse({ words: [null] })).toThrow('Word #1 is not a record.');
    const lists = [
      { id: 'a', name: 'A', createdAt: T, updatedAt: T },
      { id: 'a', name: 'B', createdAt: T, updatedAt: T },
    ];
    expect(parse({ lists })).toThrow(FileFormatError);
  });

  it('rejects odd roots, schema versions and settings', () => {
    for (const text of ['null', '[]', '42']) expect(() => parseFile(text)).toThrow(FileFormatError);
    expect(parse({ schemaVersion: 0 })).toThrow(FileFormatError);
    expect(parse({ schemaVersion: 1.5 })).toThrow(FileFormatError);
    expect(parse({ settings: null })).toThrow(FileFormatError);
  });
});

describe('serializeFile round trips', () => {
  it('is stable and preserves Vietnamese and Han text exactly', () => {
    const text = serializeFile(data, T);
    expect(serializeFile(parseFile(text), T)).toBe(text);
    expect(parseFile(text).words.find((w) => w.id === 'w2')).toEqual(data.words[0]);
  });

  it('round-trips card tombstones with their wordId', () => {
    const file = parseFile(serializeFile({ words: [], lists: [], cards: [tombstone('w1:f', T, 'w1')] }, T));
    expect(file.cards).toEqual([{ id: 'w1:f', updatedAt: T, deleted: true, wordId: 'w1' }]);
  });
});
