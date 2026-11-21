import { describe, expect, it } from 'vitest';
import { canonicalTone, syllableVariants, toneVariant } from './tone';

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
