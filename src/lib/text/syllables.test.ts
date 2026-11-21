import { describe, expect, it } from 'vitest';
import { rebuildSyllables, splitSyllables } from './syllables';

describe('splitSyllables', () => {
  it('splits on whitespace and hyphens', () => {
    expect(splitSyllables(' xuất  nhập-khẩu ')).toEqual(['xuất', 'nhập', 'khẩu']);
  });

  it('returns an empty list for empty input', () => {
    expect(splitSyllables('   ')).toEqual([]);
  });
});

describe('rebuildSyllables', () => {
  it('keeps characters and glosses by position when the count is unchanged', () => {
    const previous = [
      { text: 'nhap', char: '入' },
      { text: 'khau', char: '口', gloss: 'mouth' },
    ];
    expect(rebuildSyllables('nhập khẩu', previous)).toEqual([
      { text: 'nhập', char: '入' },
      { text: 'khẩu', char: '口', gloss: 'mouth' },
    ]);
  });

  it('starts fresh when the syllable count changes', () => {
    const previous = [{ text: 'nhập', char: '入' }, { text: 'khẩu', char: '口' }];
    expect(rebuildSyllables('xuất nhập khẩu', previous)).toEqual([
      { text: 'xuất' },
      { text: 'nhập' },
      { text: 'khẩu' },
    ]);
  });
});
