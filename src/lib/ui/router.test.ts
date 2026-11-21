import { describe, expect, it } from 'vitest';
import { href, parseHash, type Route } from './router';

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
