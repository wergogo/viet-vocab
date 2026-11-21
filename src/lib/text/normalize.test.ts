import { describe, expect, it } from 'vitest';
import { cleanText, exactKey, hasDiacritics, looseKey, stripDiacritics, viCollator } from './normalize';

describe('cleanText', () => {
  it('trims, collapses whitespace and composes to NFC', () => {
    const decomposed = ' nhập   khẩu '.normalize('NFD');
    expect(cleanText(decomposed)).toBe('nhập khẩu');
    expect(cleanText(decomposed).length).toBe('nhập khẩu'.length);
  });
});

describe('stripDiacritics / looseKey', () => {
  it('removes tone and vowel marks and maps đ to d', () => {
    expect(stripDiacritics('Đường phố nhập khẩu')).toBe('Duong pho nhap khau');
    expect(looseKey('Đường Phố')).toBe('duong pho');
  });

  it('leaves Chinese characters and English alone', () => {
    expect(looseKey('入口 Import')).toBe('入口 import');
  });
});

describe('exactKey', () => {
  it('lowercases and composes but keeps diacritics', () => {
    expect(exactKey('Nhập Khẩu'.normalize('NFD'))).toBe('nhập khẩu');
  });
});

describe('hasDiacritics', () => {
  it('detects Vietnamese marks, including đ', () => {
    expect(hasDiacritics('nhap khau')).toBe(false);
    expect(hasDiacritics('import')).toBe(false);
    expect(hasDiacritics('nhập')).toBe(true);
    expect(hasDiacritics('đi')).toBe(true);
  });
});

describe('viCollator', () => {
  it('sorts in Vietnamese alphabetical order', () => {
    expect(['đi', 'dê', 'ăn', 'an'].sort(viCollator.compare)).toEqual(['an', 'ăn', 'dê', 'đi']);
  });
});
