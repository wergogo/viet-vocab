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
