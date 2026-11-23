import { describe, expect, it } from 'vitest';
import { canonicalTone, syllableVariants, toneVariant, wordKey } from './tone';

describe('syllableVariants', () => {
  it('offers both placements for oa, oe and uy without a final consonant', () => {
    expect(syllableVariants('hoà')).toEqual(['hòa', 'hoà']);
    expect(syllableVariants('khỏe')).toEqual(['khỏe', 'khoẻ']);
    expect(syllableVariants('thuỷ')).toEqual(['thủy', 'thuỷ']);
    expect(syllableVariants('Hoá')).toEqual(['Hóa', 'Hoá']);
  });

  it('leaves unambiguous syllables alone', () => {
    expect(syllableVariants('hoàng')).toEqual(['hoàng']);
    expect(syllableVariants('quý')).toEqual(['quý']);
    expect(syllableVariants('của')).toEqual(['của']);
    expect(syllableVariants('hoa')).toEqual(['hoa']);
  });
});

describe('toneVariant', () => {
  it('swaps the placement across a phrase, keeping separators', () => {
    expect(toneVariant('văn hoá')).toBe('văn hóa');
    expect(toneVariant('văn hóa')).toBe('văn hoá');
    expect(toneVariant('thủy-lợi')).toBe('thuỷ-lợi');
  });

  it('returns null when nothing would change', () => {
    expect(toneVariant('nhập khẩu')).toBeNull();
  });
});

describe('canonicalTone', () => {
  it('maps both placements to one form (tone on the second vowel)', () => {
    expect(canonicalTone('văn hóa')).toBe('văn hoá');
    expect(canonicalTone('văn hoá')).toBe('văn hoá');
    expect(canonicalTone('nhập khẩu')).toBe('nhập khẩu');
  });
});

describe('punctuation and mixed text', () => {
  it('treats punctuation next to a syllable as a separator', () => {
    expect(toneVariant('hoà,')).toBe('hòa,');
    expect(toneVariant('(hoá)')).toBe('(hóa)');
    expect(canonicalTone('hóa/thủy.')).toBe('hoá/thuỷ.');
  });

  it('is harmless on empty, CJK and English text', () => {
    expect(canonicalTone('')).toBe('');
    expect(canonicalTone('和平 hòa')).toBe('和平 hoà');
    expect(canonicalTone('to import goods')).toBe('to import goods');
  });
});

describe('round trips and edge cases', () => {
  it('toneVariant is its own inverse and canonicalTone is idempotent', () => {
    for (const w of ['văn hoá', 'thủy lợi', 'khỏe mạnh', 'hoá hóa']) {
      const v = toneVariant(w);
      if (v !== null) expect(toneVariant(v)).toBe(w);
      expect(canonicalTone(canonicalTone(w))).toBe(canonicalTone(w));
    }
  });

  it('accepts NFD input, uppercase and the other tone marks', () => {
    expect(canonicalTone('hóa'.normalize('NFD'))).toBe('hoá');
    expect(syllableVariants('QUÝ')).toEqual(['QUÝ']);
    expect(syllableVariants('HOẠ')).toEqual(['HỌA', 'HOẠ']);
    expect(syllableVariants('thuở')).toEqual(['thuở']);
    expect(toneVariant('hoá hóa')).toBe('hóa hoá');
  });
});

describe('wordKey', () => {
  it('ignores spacing, case and tone-mark placement, but not the letters or tones', () => {
    expect(wordKey(' Văn  hóa ')).toBe(wordKey('văn hoá'));
    expect(wordKey('văn hóa')).not.toBe(wordKey('văn hoa'));
    expect(wordKey('văn hóa')).not.toBe(wordKey('vân hóa'));
  });
});
