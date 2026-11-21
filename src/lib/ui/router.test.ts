import { describe, expect, it, vi } from 'vitest';
import { href, navigate, parseHash, route, type Route } from './router';

describe('parseHash', () => {
  it('parses every route', () => {
    expect(parseHash('')).toEqual({ name: 'words' });
    expect(parseHash('#/words')).toEqual({ name: 'words' });
    expect(parseHash('#/word/abc')).toEqual({ name: 'word', id: 'abc' });
    expect(parseHash('#/edit/abc')).toEqual({ name: 'edit', id: 'abc' });
    expect(parseHash('#/char/%E5%85%A5')).toEqual({ name: 'char', char: '入' });
    expect(parseHash('#/add')).toEqual({ name: 'add', word: '' });
    expect(parseHash('#/add?w=nh%E1%BA%ADp')).toEqual({ name: 'add', word: 'nhập' });
    expect(parseHash('#/settings')).toEqual({ name: 'settings' });
  });

  it('falls back to the word list', () => {
    expect(parseHash('#/nope')).toEqual({ name: 'words' });
    expect(parseHash('#/word/')).toEqual({ name: 'words' });
  });
});

describe('href', () => {
  it('round-trips through parseHash', () => {
    const routes: Route[] = [
      { name: 'words' },
      { name: 'word', id: 'a b' },
      { name: 'edit', id: 'x' },
      { name: 'char', char: '國' },
      { name: 'add', word: 'văn hoá' },
      { name: 'add', word: '' },
      { name: 'settings' },
    ];
    for (const r of routes) expect(parseHash(href(r))).toEqual(r);
  });
});

describe('parseHash robustness', () => {
  it('falls back instead of throwing on malformed escapes', () => {
    expect(parseHash('#/word/%E0%A4%A')).toEqual({ name: 'words' });
    expect(parseHash('#/char/%')).toEqual({ name: 'words' });
    expect(parseHash('#/add?w=%')).toEqual({ name: 'add', word: '%' });
  });

  it('tolerates missing slashes, trailing slashes, extra segments and a second ?', () => {
    expect(parseHash('#words')).toEqual({ name: 'words' });
    expect(parseHash('#/settings/')).toEqual({ name: 'settings' });
    expect(parseHash('#/word/abc/extra')).toEqual({ name: 'word', id: 'abc' });
    expect(parseHash('#/add?w=a%3Fb')).toEqual({ name: 'add', word: 'a?b' });
    expect(parseHash('#/add?w=a?b')).toEqual({ name: 'add', word: 'a?b' });
  });

  it('produces the expected hashes', () => {
    expect(href({ name: 'char', char: '入' })).toBe('#/char/%E5%85%A5');
    expect(href({ name: 'add', word: 'nhập khẩu' })).toBe(`#/add?w=${encodeURIComponent('nhập khẩu')}`);
    expect(href({ name: 'add', word: '' })).toBe('#/add');
  });
});

describe('route store', () => {
  it('follows hash changes and stops listening after unsubscribe', async () => {
    location.hash = '#/settings';
    const seen: string[] = [];
    const unsubscribe = route.subscribe((r) => seen.push(r.name));
    navigate({ name: 'word', id: 'w1' });
    await vi.waitFor(() => expect(seen.at(-1)).toBe('word'));
    unsubscribe();
    location.hash = '#/words';
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen.at(-1)).toBe('word');
  });
});
