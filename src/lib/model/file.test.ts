import { describe, expect, it } from 'vitest';
import { FileFormatError, NewerSchemaError, SCHEMA_VERSION, parseFile, serializeFile, type VocabData } from './file';
import { fsrsState } from './test-helpers';
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
    expect(parse({ words: [{ id: 'w', updatedAt: T, word: 'x', syllables: [], senses: [], listIds: 'l1', createdAt: T }] })).toThrow('Word #1 (id w) has no list ids.');
    expect(parse({ lists: [{ id: 'l', updatedAt: T }] })).toThrow('List #1 (id l) has no name.');
    expect(parse({ cards: [{ id: 'c', updatedAt: T, wordId: 'w', direction: 'sideways', fsrs: fsrsState(T), introducedAt: T }] })).toThrow(FileFormatError);
    expect(parse({ cards: [{ id: 'c', updatedAt: T, wordId: 'w', direction: 'forward', fsrs: null, introducedAt: T }] })).toThrow(FileFormatError);
  });

  it('accepts the review state ts-fsrs writes and rejects other shapes', () => {
    const card = { id: 'c', updatedAt: T, wordId: 'w', direction: 'forward', fsrs: fsrsState(T), introducedAt: T };
    expect(parse({ cards: [card] })).not.toThrow();
    expect(parse({ cards: [{ ...card, fsrs: { ...card.fsrs, last_review: undefined } }] })).not.toThrow();
    for (const fsrs of [{}, { ...card.fsrs, due: 'soon' }, { ...card.fsrs, state: 4 }, { ...card.fsrs, reps: 1.5 }, { ...card.fsrs, stability: -1 }]) {
      expect(parse({ cards: [{ ...card, fsrs }] })).toThrow('Review card #1 (id c) has an invalid review state.');
    }
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

describe('parseFile field checks', () => {
  const base = { app: 'viet-vocab', schemaVersion: 1, savedAt: T, words: [], lists: [], cards: [] };
  const parse = (over: Record<string, unknown>) => () => parseFile(JSON.stringify({ ...base, ...over }));
  const valid = {
    id: 'w',
    word: 'nhập khẩu',
    syllables: [{ text: 'nhập', char: '入', gloss: 'enter' }, { text: 'khẩu' }],
    senses: [{ pos: 'Verb', meaning: 'to import' }],
    listIds: ['l1'],
    createdAt: T,
    updatedAt: T,
  };
  const word = (over: Record<string, unknown>) => parse({ words: [{ ...valid, ...over }] });

  it('accepts every field the app writes and passes unknown fields through', () => {
    const full = {
      ...valid,
      ipaHanoi: '[nhap]',
      ipaSaigon: '[nhap]',
      etymology: 'From 入 and 口.',
      notes: 'news word',
      audioFile: 'Vi-nhap-khau.ogg',
      source: { wiktionaryTitle: 'nhập khẩu', fetchedAt: T },
      addedLater: { x: 1 },
    };
    expect(parseFile(JSON.stringify({ ...base, words: [full] })).words).toEqual([full]);
  });

  it('rejects a null meaning', () => {
    expect(word({ senses: [null] })).toThrow('Word #1 (id w) has an invalid meaning #1.');
  });

  it('rejects a meaning that is not text', () => {
    const senses = [{ pos: 'Verb', meaning: 'to import' }, { pos: 'Noun', meaning: 5 }];
    expect(word({ senses })).toThrow('Word #1 (id w) has an invalid meaning #2.');
  });

  it('rejects an ipaHanoi that is not text', () => {
    expect(word({ ipaHanoi: 7 })).toThrow('Word #1 (id w) has an invalid ipaHanoi.');
  });

  it('rejects a word without createdAt', () => {
    expect(word({ createdAt: undefined })).toThrow('Word #1 (id w) has an invalid createdAt.');
  });

  it('rejects an empty word', () => {
    expect(word({ word: '' })).toThrow('Word #1 (id w) has no word text.');
  });

  it('rejects a list with an empty name', () => {
    expect(parse({ lists: [{ id: 'l', name: '', createdAt: T, updatedAt: T }] })).toThrow('List #1 (id l) has no name.');
  });

  it('rejects a syllable character that is not text', () => {
    expect(word({ syllables: [{ text: 'nhập', char: 5 }, { text: 'khẩu' }] })).toThrow('Word #1 (id w) has an invalid syllable #1.');
  });

  it('rejects a source with an invalid fetchedAt', () => {
    expect(word({ source: { wiktionaryTitle: 'nhập khẩu', fetchedAt: 'yesterday' } })).toThrow('Word #1 (id w) has an invalid source.');
  });

  it('rejects other fields of the wrong shape', () => {
    expect(parse({ words: [{ id: '', updatedAt: T, deleted: true }] })).toThrow('Word #1 has no id.');
    expect(word({ word: 5 })).toThrow('Word #1 (id w) has no word text.');
    expect(word({ syllables: [{ char: '入' }] })).toThrow('Word #1 (id w) has an invalid syllable #1.');
    expect(word({ syllables: [{ text: 'nhập', gloss: null }] })).toThrow('Word #1 (id w) has an invalid syllable #1.');
    expect(word({ senses: [{ meaning: 'to import' }] })).toThrow('Word #1 (id w) has an invalid meaning #1.');
    expect(word({ listIds: ['l1', 2] })).toThrow('Word #1 (id w) has an invalid list id #2.');
    for (const field of ['ipaSaigon', 'etymology', 'notes', 'audioFile']) {
      expect(word({ [field]: null })).toThrow(`Word #1 (id w) has an invalid ${field}.`);
    }
    expect(word({ source: null })).toThrow('Word #1 (id w) has an invalid source.');
    expect(word({ source: { fetchedAt: T } })).toThrow('Word #1 (id w) has an invalid source.');
    expect(parse({ lists: [{ id: 'l', name: 'A', updatedAt: T }] })).toThrow('List #1 (id l) has an invalid createdAt.');
  });

  it('rejects newCardsPerDay unless it is a whole number from 0 to 1000', () => {
    const text = (perDay: string) =>
      `{"app":"viet-vocab","schemaVersion":1,"savedAt":"${T}","words":[],"lists":[],"cards":[],` +
      `"settings":{"newCardsPerDay":${perDay},"reverseCards":false,"updatedAt":"${T}"}}`;
    for (const perDay of ['1e999', '2.5', '-1', '1001']) {
      expect(() => parseFile(text(perDay))).toThrow('The settings record is invalid.');
    }
    for (const perDay of ['0', '1000']) expect(parseFile(text(perDay)).settings?.newCardsPerDay).toBe(Number(perDay));
  });

  it('rebuilds word tombstones with only id, updatedAt and deleted', () => {
    const dead = { id: 'w', updatedAt: T, deleted: true, word: 'nhập', notes: 'old notes', wordId: 'x' };
    expect(parseFile(JSON.stringify({ ...base, words: [dead] })).words).toStrictEqual([{ id: 'w', updatedAt: T, deleted: true }]);
  });

  it('keeps the wordId of card tombstones and requires it to be text', () => {
    const dead = { id: 'w:f', updatedAt: T, deleted: true, wordId: 'w', fsrs: { due: T } };
    expect(parseFile(JSON.stringify({ ...base, cards: [dead] })).cards).toStrictEqual([{ id: 'w:f', updatedAt: T, deleted: true, wordId: 'w' }]);
    expect(parse({ cards: [{ ...dead, wordId: 5 }] })).toThrow('Review card #1 (id w:f) has an invalid wordId.');
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
