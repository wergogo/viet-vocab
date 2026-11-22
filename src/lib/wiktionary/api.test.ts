import { afterEach, describe, expect, it, vi } from 'vitest';
import { LookupError, apiGet, existingTitles, readExpanded, readParse, type FetchFn } from './api';
import { FIXTURES } from './test-fixtures';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('apiGet', () => {
  it('adds the common parameters and the Api-User-Agent header', async () => {
    const fetchFn = vi.fn<FetchFn>(async () => json({ ok: true }));
    expect(await apiGet({ action: 'parse', page: 'nhập khẩu' }, fetchFn)).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0]!;
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://en.wiktionary.org/w/api.php');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      action: 'parse',
      page: 'nhập khẩu',
      format: 'json',
      formatversion: '2',
      origin: '*',
    });
    expect(init?.headers).toEqual({ 'Api-User-Agent': 'VietVocab/1.0' });
  });

  it('turns failures into retryable errors with readable messages', async () => {
    const failing: FetchFn = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(apiGet({}, failing)).rejects.toMatchObject({ kind: 'network' });
    await expect(apiGet({}, async () => json({}, 429))).rejects.toMatchObject({
      kind: 'http',
      status: 429,
      message: 'Wiktionary is busy. Wait a moment, then retry.',
    });
    await expect(apiGet({}, async () => json({}, 500))).rejects.toMatchObject({ kind: 'http', status: 500 });
    await expect(apiGet({}, async () => new Response('<html>', { status: 200 }))).rejects.toMatchObject({
      kind: 'response',
    });
  });

  it('reports being offline without fetching', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchFn = vi.fn<FetchFn>();
    await expect(apiGet({}, fetchFn)).rejects.toMatchObject({ kind: 'offline' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('response readers', () => {
  it('reads a parse response, and null for a missing page', () => {
    expect(readParse(FIXTURES['nhap-khau'])?.title).toBe('nhập khẩu');
    expect(readParse(FIXTURES['char-nhap'])?.html).toBe('');
    expect(readParse(FIXTURES['missing-page'])).toBeNull();
    expect(() => readParse({ error: { code: 'ratelimited' } })).toThrow(LookupError);
    expect(() => readParse({})).toThrow(LookupError);
  });

  it('reads existing titles and expanded wikitext', () => {
    expect(existingTitles(FIXTURES['query-variants'])).toEqual(new Set(['văn hoá']));
    expect(() => existingTitles(FIXTURES['missing-page'])).toThrow(LookupError);
    expect(readExpanded(FIXTURES['ipa-sentence'])).toContain('usage-label-accent');
    expect(() => readExpanded({})).toThrow(LookupError);
  });
});
