import { describe, expect, it } from 'vitest';
import type { Region, Word } from '../model/types';
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

describe('searchWords by region', () => {
  const regional = (r: LiveWordRow, regions: Region[]): LiveWordRow => ({ ...r, regions });
  const rows = [regional(words[0]!, ['north']), regional(words[1]!, ['central', 'south']), words[2]!];

  it('shows a word when it has any of the chosen regions', () => {
    expect(ids(searchWords(rows, { query: '', regions: ['south'], sort: 'newest' }))).toEqual(['2']);
    expect(ids(searchWords(rows, { query: '', regions: ['north', 'central'], sort: 'newest' }))).toEqual(['2', '1']);
    expect(ids(searchWords(rows, { query: 'nhap', regions: ['north'], sort: 'newest' }))).toEqual(['1']);
  });

  it('keeps every word when no region is chosen', () => {
    expect(ids(searchWords(rows, { query: '', regions: [], sort: 'newest' }))).toEqual(['3', '2', '1']);
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

describe('query details', () => {
  const extra = [...words, row('5', 'đi', [undefined], 'to go', '2026-01-05T00:00:00.000Z')];

  it('folds đ in loose queries and keeps it exact otherwise', () => {
    expect(ids(searchWords(extra, { query: 'di', sort: 'newest' }))).toEqual(['5']);
    expect(ids(searchWords(extra, { query: 'đ', sort: 'newest' }))).toEqual(['5']);
  });

  it('switches to character mode when the query mixes Latin and Han text', () => {
    expect(ids(searchWords(words, { query: 'xyz 入', sort: 'newest' }))).toEqual(['1']);
  });

  it('combines list filters with queries and never mutates its input', () => {
    const before = ids(words);
    expect(ids(searchWords(words, { query: 'nation', listId: 'econ', sort: 'az' }))).toEqual(['4']);
    expect(ids(searchWords(words, { query: 'culture', listId: 'econ', sort: 'az' }))).toEqual([]);
    expect(ids(words)).toEqual(before);
  });
});

describe('findDuplicates edge cases', () => {
  it('matches headwords only, including words with empty or no meanings', () => {
    expect(findDuplicates(words, 'culture')).toEqual([]);
    const blank = row('9', 'chào', [undefined], '', '2026-01-09T00:00:00.000Z');
    expect(ids(findDuplicates([...words, blank], 'Chào'))).toEqual(['9']);
    const none = toRow({
      id: '10',
      word: 'xin',
      syllables: [{ text: 'xin' }],
      senses: [],
      listIds: [],
      createdAt: '2026-01-10T00:00:00.000Z',
      updatedAt: '2026-01-10T00:00:00.000Z',
    });
    expect(ids(findDuplicates([none], 'XIN'))).toEqual(['10']);
  });
});
