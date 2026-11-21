import { describe, expect, it } from 'vitest';
import { cleanText, exactKey, hasDiacritics, looseKey, stripDiacritics, viCollator } from './normalize';

describe('cleanText', () => {
  it('trims, collapses whitespace and composes to NFC', () => {
    const decomposed = ' nhập   khẩu '.normalize('NFD');
    expect(cleanText(decomposed)).toBe('nhập khẩu');
    expect(cleanText(decomposed).length).toBe('nhập khẩu'.length);
  });

  it('drops zero-width characters pasted from web pages', () => {
    const zwsp = String.fromCodePoint(0x200b);
    const bom = String.fromCodePoint(0xfeff);
    expect(cleanText(`${bom}nhập${zwsp} khẩu${zwsp}`)).toBe('nhập khẩu');
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

describe('stripDiacritics coverage', () => {
  const VOWELS: [string, string][] = [
    ['a', 'a'], ['ă', 'a'], ['â', 'a'], ['e', 'e'], ['ê', 'e'], ['i', 'i'],
    ['o', 'o'], ['ô', 'o'], ['ơ', 'o'], ['u', 'u'], ['ư', 'u'], ['y', 'y'],
  ];
  const TONES = [0x0300, 0x0301, 0x0309, 0x0303, 0x0323];

  it('strips every tone from every vowel, in both cases and both normal forms', () => {
    for (const [vowel, plain] of VOWELS) {
      for (const tone of TONES) {
        const toned = (vowel + String.fromCodePoint(tone)).normalize('NFC');
        expect(stripDiacritics(toned)).toBe(plain);
        expect(stripDiacritics(toned.normalize('NFD'))).toBe(plain);
        expect(stripDiacritics(toned.toUpperCase())).toBe(plain.toUpperCase());
      }
    }
  });

  it('maps đ/Đ on their own and keeps empty input empty', () => {
    expect(looseKey('ĐƯỜNG')).toBe('duong');
    expect(stripDiacritics('Đ')).toBe('D');
    expect(stripDiacritics('')).toBe('');
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

  it('counts decomposed, uppercase and non-Vietnamese marks, but not empty text', () => {
    expect(hasDiacritics('a' + String.fromCodePoint(0x0301))).toBe(true);
    expect(hasDiacritics('NHẬP')).toBe(true);
    expect(hasDiacritics('café')).toBe(true);
    expect(hasDiacritics('')).toBe(false);
  });
});

describe('viCollator', () => {
  it('sorts in Vietnamese alphabetical order', () => {
    expect(['đi', 'dê', 'ăn', 'an'].sort(viCollator.compare)).toEqual(['an', 'ăn', 'dê', 'đi']);
  });
});
