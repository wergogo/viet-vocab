import { describe, expect, it } from 'vitest';
import { rebuildSyllables, splitSyllables } from './syllables';

describe('splitSyllables', () => {
  it('splits on whitespace and hyphens', () => {
    expect(splitSyllables(' xuất  nhập-khẩu ')).toEqual(['xuất', 'nhập', 'khẩu']);
  });

  it('ignores leading, trailing and repeated separators', () => {
    expect(splitSyllables('-nhập--khẩu- ')).toEqual(['nhập', 'khẩu']);
  });

  it('returns an empty list for empty input', () => {
    expect(splitSyllables('   ')).toEqual([]);
  });
});

describe('rebuildSyllables', () => {
  const saved = [
    { text: 'nhập', char: '入' },
    { text: 'khẩu', char: '口', gloss: 'mouth' },
  ];

  it('keeps characters and glosses by position when the count is unchanged', () => {
    const previous = [{ text: 'nhap', char: '入' }, { text: 'khau', char: '口', gloss: 'mouth' }];
    expect(rebuildSyllables('nhập khẩu', previous)).toStrictEqual(saved);
  });

  it('keeps the first syllable when another is appended', () => {
    expect(rebuildSyllables('nhập khẩu', [{ text: 'nhập', char: '入' }])).toStrictEqual([
      { text: 'nhập', char: '入' },
      { text: 'khẩu' },
    ]);
  });

  it('keeps the remaining syllable when the last one is deleted', () => {
    expect(rebuildSyllables('nhập ', saved)).toStrictEqual([{ text: 'nhập', char: '入' }]);
  });

  it('keeps matching syllables when one is added at the front', () => {
    expect(rebuildSyllables('xuất nhập khẩu', saved)).toStrictEqual([{ text: 'xuất' }, ...saved]);
  });

  it('starts fresh when nothing matches', () => {
    expect(rebuildSyllables('thành phố mới', saved)).toStrictEqual([
      { text: 'thành' },
      { text: 'phố' },
      { text: 'mới' },
    ]);
  });

  it('returns an empty list for an empty word and works without previous data', () => {
    expect(rebuildSyllables('', saved)).toStrictEqual([]);
    expect(rebuildSyllables('a b')).toStrictEqual([{ text: 'a' }, { text: 'b' }]);
  });
});
