import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '../db/db';
import type { FetchFn } from './api';
import { lookupChar, lookupWord, spellingVariants } from './lookup';
import { FIXTURES } from './test-fixtures';

/** Answers from fixtures by request: "parse:<page>", "query:<titles>" or "expand:<text>". Unknown pages are missing. */
function fakeWiktionary(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchFn: FetchFn = async (url) => {
    const p = new URL(url).searchParams;
    const action = p.get('action');
    const key =
      action === 'parse'
        ? `parse:${p.get('page')}`
        : action === 'query'
          ? `query:${p.get('titles')}`
          : `expand:${p.get('text')}`;
    calls.push(key);
    return new Response(JSON.stringify(routes[key] ?? FIXTURES['missing-page']), { status: 200 });
  };
  return { fetchFn, calls };
}

beforeEach(async () => {
  await resetDb();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('spellingVariants', () => {
  it('tries the other tone placement and a lowercase first letter', () => {
    expect(spellingVariants('văn hóa')).toEqual(['văn hoá']);
    expect(spellingVariants('Nhập khẩu')).toEqual(['nhập khẩu']);
    expect(spellingVariants('Văn hóa')).toEqual(['Văn hoá', 'văn hóa', 'văn hoá']);
    expect(spellingVariants('nhập khẩu')).toEqual([]);
  });
});

describe('lookupWord', () => {
  it('parses the page with one request', async () => {
    const { fetchFn, calls } = fakeWiktionary({ 'parse:nhập khẩu': FIXTURES['nhap-khau'] });
    const result = await lookupWord('  nhập   khẩu ', { fetchFn });
    expect(result).toMatchObject({ query: 'nhập khẩu', title: 'nhập khẩu', ipaHanoi: '', ipaSaigon: '' });
    expect(result.entries[0]!.senses).toEqual([{ pos: 'Verb', meaning: 'to import' }]);
    expect(calls).toEqual(['parse:nhập khẩu']);
  });

  it('follows an alternative-spelling stub', async () => {
    const { fetchFn, calls } = fakeWiktionary({
      'parse:văn hóa': FIXTURES['van-hoa-stub'],
      'parse:văn hoá': FIXTURES['van-hoa'],
    });
    const result = await lookupWord('văn hóa', { fetchFn });
    expect(result.title).toBe('văn hoá');
    expect(result.entries[0]!.chars?.chars).toEqual(['文', '化']);
    expect(calls).toEqual(['parse:văn hóa', 'parse:văn hoá']);
  });

  it('tries spelling variants when the page is missing', async () => {
    const { fetchFn, calls } = fakeWiktionary({
      'query:Văn hóa|văn hoá|văn hóa': FIXTURES['query-variants'],
      'parse:văn hoá': FIXTURES['van-hoa'],
    });
    expect((await lookupWord('Văn hoá', { fetchFn })).title).toBe('văn hoá');
    expect(calls).toEqual(['parse:Văn hoá', 'query:Văn hóa|văn hoá|văn hóa', 'parse:văn hoá']);
  });

  it('fills only the IPA when the word is not on Wiktionary', async () => {
    const text = 'tôi đang học từ vựng mới';
    const { fetchFn, calls } = fakeWiktionary({ [`expand:{{vi-IPA|${text}}}`]: FIXTURES['ipa-sentence'] });
    expect(await lookupWord(text, { fetchFn })).toMatchObject({
      title: null,
      entries: [],
      ipaHanoi: '[toj˧˧ ʔɗaːŋ˧˧ hawk͡p̚˧˨ʔ tɨ˨˩ vɨŋ˧˨ʔ məːj˧˦]',
    });
    expect(calls).toEqual([`parse:${text}`, `expand:{{vi-IPA|${text}}}`]);
  });

  it('gets IPA for an entry without a pronunciation section', async () => {
    const page = {
      parse: {
        title: 'xin chào',
        wikitext: '==Vietnamese==\n===Interjection===\n{{vi-interj}}\n\n# hello\n',
        text:
          '<div class="mw-parser-output"><div class="mw-heading mw-heading2"><h2 id="Vietnamese">Vietnamese</h2></div>' +
          '<div class="mw-heading mw-heading3"><h3 id="Interjection">Interjection</h3></div><p>xin chào</p><ol><li>hello</li></ol></div>',
      },
    };
    const { fetchFn, calls } = fakeWiktionary({
      'parse:xin chào': page,
      'expand:{{vi-IPA|xin chào}}': FIXTURES['ipa-sentence'],
    });
    const [entry] = (await lookupWord('xin chào', { fetchFn })).entries;
    expect(entry!.senses).toEqual([{ pos: 'Interjection', meaning: 'hello' }]);
    expect(entry!.ipaHanoi).toBe('[toj˧˧ ʔɗaːŋ˧˧ hawk͡p̚˧˨ʔ tɨ˨˩ vɨŋ˧˨ʔ məːj˧˦]');
    expect(calls).toEqual(['parse:xin chào', 'expand:{{vi-IPA|xin chào}}']);
  });

  it('answers from the cache, for the followed spelling too, until refreshed or expired', async () => {
    const { fetchFn, calls } = fakeWiktionary({
      'parse:văn hóa': FIXTURES['van-hoa-stub'],
      'parse:văn hoá': FIXTURES['van-hoa'],
    });
    await lookupWord('văn hóa', { fetchFn });
    calls.length = 0;
    expect((await lookupWord('văn hóa', { fetchFn })).title).toBe('văn hoá');
    expect(await lookupWord('văn hoá', { fetchFn })).toMatchObject({ query: 'văn hoá', title: 'văn hoá' });
    expect(calls).toEqual([]);
    await lookupWord('văn hoá', { fetchFn, refresh: true });
    expect(calls).toEqual(['parse:văn hoá']);
    const later = Date.now() + 31 * 86_400_000;
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(later);
    calls.length = 0;
    await lookupWord('văn hóa', { fetchFn });
    expect(calls).toEqual(['parse:văn hóa', 'parse:văn hoá']);
  });

  it('rejects empty input and passes request errors through', async () => {
    await expect(lookupWord('   ')).rejects.toThrow('Type a word to look up.');
    const busy: FetchFn = async () => new Response('', { status: 503 });
    await expect(lookupWord('x', { fetchFn: busy })).rejects.toMatchObject({ kind: 'http', status: 503 });
  });
});

describe('lookupChar', () => {
  it('parses the character page and caches it', async () => {
    const { fetchFn, calls } = fakeWiktionary({ 'parse:入': FIXTURES['char-nhap'] });
    expect((await lookupChar('入', { fetchFn }))?.hanViet).toEqual(['nhập']);
    expect((await lookupChar('入', { fetchFn }))?.compounds).toHaveLength(9);
    expect(calls).toEqual(['parse:入']);
  });

  it('caches a missing page as null', async () => {
    const { fetchFn, calls } = fakeWiktionary({});
    expect(await lookupChar('丂', { fetchFn })).toBeNull();
    expect(await lookupChar('丂', { fetchFn })).toBeNull();
    expect(calls).toEqual(['parse:丂']);
  });
});
