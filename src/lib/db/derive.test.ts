import { describe, expect, it } from 'vitest';
import { tombstone, type Word } from '../model/types';
import { deriveFields, fromRow, isLiveRow, toRow } from './derive';

const T = '2026-01-01T00:00:00.000Z';
const word: Word = {
  id: 'w1',
  word: 'Văn Hóa',
  syllables: [{ text: 'Văn', char: '文' }, { text: 'Hóa', char: '化' }],
  senses: [{ pos: 'Noun', meaning: 'Culture' }],
  listIds: [],
  createdAt: T,
  updatedAt: T,
};

describe('deriveFields', () => {
  it('builds loose and exact search keys from the word and its meanings', () => {
    const d = deriveFields(word);
    expect(d.searchLoose).toBe('van hoa\nculture');
    expect(d.searchExact).toBe('văn hoá\nculture');
    expect(d.chars).toEqual(['文', '化']);
  });
});

describe('toRow / fromRow', () => {
  it('adds derived fields and strips them again', () => {
    const row = toRow(word);
    expect(isLiveRow(row)).toBe(true);
    expect(row).toMatchObject({ chars: ['文', '化'] });
    expect(fromRow(row)).toEqual(word);
  });

  it('passes tombstones through unchanged', () => {
    const dead = tombstone('w2', T);
    expect(toRow(dead)).toEqual(dead);
    expect(isLiveRow(toRow(dead))).toBe(false);
    expect(fromRow(dead)).toEqual(dead);
  });
});
