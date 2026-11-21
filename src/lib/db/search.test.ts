import { describe, expect, it } from 'vitest';
import type { Word } from '../model/types';
import { toRow, type LiveWordRow } from './derive';
import { findDuplicates, matchesQuery, searchWords } from './search';

function row(
  id: string,
  word: string,
  chars: (string | undefined)[],
  meaning: string,
  createdAt: string,
  listIds: string[] = [],
): LiveWordRow {
  const w: Word = {
    id,
    word,
    syllables: word.split(' ').map((text, i) => (chars[i] ? { text, char: chars[i] } : { text })),
    senses: [{ pos: 'Noun', meaning }],
    listIds,
    createdAt,
    updatedAt: createdAt,
  };
  return toRow(w) as LiveWordRow;
}

const words = [
  row('1', 'nhập khẩu', ['入', '口'], 'to import', '2026-01-01T00:00:00.000Z', ['econ']),
  row('2', 'nháp', [undefined], 'draft', '2026-01-02T00:00:00.000Z'),
  row('3', 'văn hoá', ['文', '化'], 'culture', '2026-01-03T00:00:00.000Z'),
  row('4', 'quốc gia', ['國', '家'], 'nation', '2026-01-04T00:00:00.000Z', ['econ']),
];
const ids = (rs: LiveWordRow[]) => rs.map((r) => r.id);

describe('matchesQuery', () => {
  it('matches loosely without diacritics, on the word or a meaning', () => {
    expect(ids(searchWords(words, { query: 'nhap', sort: 'newest' }))).toEqual(['2', '1']);
    expect(ids(searchWords(words, { query: 'import', sort: 'newest' }))).toEqual(['1']);
  });

  it('matches exactly when the query has diacritics', () => {
    expect(ids(searchWords(words, { query: 'nhập', sort: 'newest' }))).toEqual(['1']);
    expect(ids(searchWords(words, { query: 'NHÁP', sort: 'newest' }))).toEqual(['2']);
  });

  it('ignores tone-mark placement in exact matches', () => {
    expect(ids(searchWords(words, { query: 'văn hóa', sort: 'newest' }))).toEqual(['3']);
  });

  it('never matches across the word/meaning boundary', () => {
    expect(ids(searchWords(words, { query: 'hoá culture', sort: 'newest' }))).toEqual([]);
    expect(ids(searchWords(words, { query: 'hoa culture', sort: 'newest' }))).toEqual([]);
  });

  it('requires every query character, using variants', () => {
    const variants = (c: string) => (c === '国' ? ['国', '國'] : [c]);
    expect(matchesQuery(words[3]!, '国', variants)).toBe(true);
    expect(matchesQuery(words[3]!, '国')).toBe(false);
    expect(ids(searchWords(words, { query: '入口', sort: 'newest' }))).toEqual(['1']);
    expect(ids(searchWords(words, { query: '入家', sort: 'newest' }))).toEqual([]);
  });

  it('matches everything for an empty query', () => {
    expect(searchWords(words, { query: '  ', sort: 'newest' })).toHaveLength(4);
  });
});

describe('searchWords', () => {
  it('filters by list', () => {
    expect(ids(searchWords(words, { query: '', listId: 'econ', sort: 'newest' }))).toEqual(['4', '1']);
  });

  it('sorts newest first or in Vietnamese A–Z order', () => {
    expect(ids(searchWords(words, { query: '', sort: 'newest' }))).toEqual(['4', '3', '2', '1']);
    expect(ids(searchWords(words, { query: '', sort: 'az' }))).toEqual(['2', '1', '4', '3']);
  });
});

describe('findDuplicates', () => {
  it('ignores case and tone-mark placement and can exclude the word being edited', () => {
    expect(ids(findDuplicates(words, 'Văn Hóa'))).toEqual(['3']);
    expect(findDuplicates(words, 'văn hoá', '3')).toEqual([]);
    expect(findDuplicates(words, 'nhap')).toEqual([]);
    expect(findDuplicates(words, '  ')).toEqual([]);
  });
});
