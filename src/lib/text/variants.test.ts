import { describe, expect, it } from 'vitest';
import { charVariants, loadStTable, toTraditional, type StTable } from './variants';

const table: StTable = {
  s2t: { 国: '國', 发: '發髮', 干: '幹乾干榦', 里: '裏里哩', 台: '臺台颱檯' },
  t2s: { 國: '国', 發: '发', 髮: '发', 幹: '干', 乾: '干', 榦: '干', 裏: '里', 裡: '里', 臺: '台', 颱: '台', 檯: '台' },
};
const sorted = (xs: string[]) => [...xs].sort();

describe('charVariants', () => {
  it('includes the character and its counterparts in both directions', () => {
    expect(sorted(charVariants('国', table))).toEqual(sorted(['国', '國']));
    expect(sorted(charVariants('國', table))).toEqual(sorted(['国', '國']));
    expect(sorted(charVariants('发', table))).toEqual(sorted(['发', '發', '髮']));
  });

  it('reaches sibling traditional forms through their shared simplified form', () => {
    expect(sorted(charVariants('乾', table))).toEqual(sorted(['乾', '干', '幹', '榦']));
    expect(sorted(charVariants('裡', table))).toEqual(sorted(['裡', '里', '裏', '哩']));
    expect(charVariants('颱', table)).toContain('臺');
  });

  it('returns just the character when it has no counterpart, including astral characters', () => {
    expect(charVariants('入', table)).toEqual(['入']);
    expect(charVariants('𠀀', table)).toEqual(['𠀀']);
  });
});

describe('toTraditional', () => {
  it('picks the first traditional candidate for simplified-only characters', () => {
    expect(toTraditional('发', table)).toBe('發');
    expect(toTraditional('国', table)).toBe('國');
  });

  it('keeps characters that are already valid traditional or have no entry', () => {
    expect(toTraditional('台', table)).toBe('台');
    expect(toTraditional('里', table)).toBe('里');
    expect(toTraditional('國', table)).toBe('國');
  });
});

describe('prototype names', () => {
  it('are treated as text without entries, not as inherited object keys', () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(charVariants(name, table)).toStrictEqual([name]);
      expect(toTraditional(name, table)).toBe(name);
    }
  });
});

describe('loadStTable', () => {
  it('loads the generated OpenCC table once', async () => {
    const first = loadStTable();
    expect(loadStTable()).toBe(first);
    const real = await first;
    expect(real.s2t['国']).toBe('國');
    expect(real.t2s['學']).toBe('学');
    expect(Array.from(real.s2t['发'] ?? '')[0]).toBe('發');
    expect(charVariants('乾', real)).toContain('幹');
  });
});
