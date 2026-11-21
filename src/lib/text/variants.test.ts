import { describe, expect, it } from 'vitest';
import { charVariants, loadStTable, toTraditional, type StTable } from './variants';

const table: StTable = {
  s2t: { 国: '國', 发: '發髮' },
  t2s: { 國: '国', 發: '发', 髮: '发' },
};

describe('charVariants', () => {
  it('includes the character and its counterparts in both directions', () => {
    expect(charVariants('国', table).sort()).toEqual(['国', '國'].sort());
    expect(charVariants('國', table).sort()).toEqual(['国', '國'].sort());
    expect(charVariants('发', table).sort()).toEqual(['发', '發', '髮'].sort());
  });

  it('returns just the character when it has no counterpart', () => {
    expect(charVariants('入', table)).toEqual(['入']);
  });
});

describe('toTraditional', () => {
  it('picks the first traditional candidate', () => {
    expect(toTraditional('发', table)).toBe('發');
    expect(toTraditional('國', table)).toBe('國');
  });
});

describe('loadStTable', () => {
  it('loads the generated OpenCC table', async () => {
    const real = await loadStTable();
    expect(real.s2t['国']).toBe('國');
    expect(real.t2s['學']).toBe('学');
  });
});
