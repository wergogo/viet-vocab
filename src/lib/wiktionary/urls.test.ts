import { describe, expect, it } from 'vitest';
import { wiktionaryUrl } from './urls';

describe('wiktionaryUrl', () => {
  it('links the Vietnamese section, with underscores for spaces', () => {
    expect(wiktionaryUrl('nhập khẩu')).toBe('https://en.wiktionary.org/wiki/nh%E1%BA%ADp_kh%E1%BA%A9u#Vietnamese');
    expect(wiktionaryUrl('發')).toBe('https://en.wiktionary.org/wiki/%E7%99%BC#Vietnamese');
  });
});
