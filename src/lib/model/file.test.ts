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
    const twice = [{ id: 'w', updatedAt: T }, { id: 'w', updatedAt: T }];
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
