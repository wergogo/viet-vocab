import { describe, expect, it } from 'vitest';
import { cjkChars, hasCjk, isCjkChar } from './cjk';

describe('cjk helpers', () => {
  it('finds Han characters, including Extension A and astral ones', () => {
    expect(cjkChars('入口')).toEqual(['入', '口']);
    expect(cjkChars('㗂越 x')).toEqual(['㗂', '越']);
    expect(cjkChars('a𠀀b')).toEqual(['𠀀']);
  });

  it('rejects Latin text', () => {
    expect(isCjkChar('a')).toBe(false);
    expect(hasCjk('nhập khẩu')).toBe(false);
    expect(hasCjk('nhập 入')).toBe(true);
  });
});

describe('range boundaries', () => {
  const at = (cp: number) => String.fromCodePoint(cp);

  it('accepts the first and last code point of every range', () => {
    for (const cp of [0x3400, 0x4dbf, 0x4e00, 0x9fff, 0xf900, 0xfaff, 0x20000, 0x2fa1f, 0x30000, 0x3347f]) {
      expect(isCjkChar(at(cp))).toBe(true);
    }
  });

  it('rejects the code points just outside each range', () => {
    for (const cp of [0x33ff, 0x4dc0, 0xa000, 0xf8ff, 0xfb00, 0x1ffff, 0x2fa20, 0x33480]) {
      expect(isCjkChar(at(cp))).toBe(false);
    }
  });
});

describe('non-Han text', () => {
  it('ignores kana, hangul, CJK punctuation, the ideographic space and digits', () => {
    const text = '日本語、ひらがな カタカナ 한국어「」，' + String.fromCodePoint(0x3000) + '123';
    expect(cjkChars(text)).toEqual(['日', '本', '語']);
  });

  it('handles empty input and lone surrogates', () => {
    expect(isCjkChar('')).toBe(false);
    expect(hasCjk('')).toBe(false);
    expect(isCjkChar(String.fromCharCode(0xd840))).toBe(false);
  });
});
