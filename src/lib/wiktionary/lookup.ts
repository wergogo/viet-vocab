import { nowIso } from '../model/ids';
import { cleanText } from '../text/normalize';
import { toneVariant } from '../text/tone';
import { apiGet, defaultFetch, existingTitles, readExpanded, readParse, type FetchFn, type PageSource } from './api';
import { purgeExpiredCache, readCache, writeCache } from './cache';
import { ipaFromExpanded, type Ipa } from './ipa';
import { parseCharPage } from './parseChar';
import { parseWordPage, type ParsedWordPage } from './parseWord';
import type { CharInfo, LookupResult, PageResult } from './types';

export interface LookupOptions {
  /** Skip the cache and fetch again (the lookup panel's Refresh). */
  refresh?: boolean;
  /** For tests. */
  fetchFn?: FetchFn;
}

/** Spellings to try when a page is missing: the other tone-mark placement and a lowercase first letter (spec §6.1). */
export function spellingVariants(word: string): string[] {
  const out: string[] = [];
  const add = (v: string | null) => {
    if (v && v !== word && !out.includes(v)) out.push(v);
  };
  add(toneVariant(word));
  const [first = '', ...rest] = Array.from(word);
  const lower = first.toLocaleLowerCase('vi') + rest.join('');
  if (lower !== word) {
    add(lower);
    add(toneVariant(lower));
  }
  return out;
}

// The cache only saves requests: if IndexedDB fails, lookups still work.
async function cached<T>(key: string): Promise<T | undefined> {
  try {
    return await readCache<T>(key);
  } catch (e) {
    console.error('Lookup cache read failed', e);
    return undefined;
  }
}

async function store(keys: string[], data: unknown, fetchedAt: string): Promise<void> {
  try {
    await writeCache(keys, data, fetchedAt);
    await purgeExpiredCache();
  } catch (e) {
    console.error('Lookup cache write failed', e);
  }
}

async function fetchPage(title: string, fetchFn: FetchFn): Promise<PageSource | null> {
  const params = {
    action: 'parse',
    page: title,
    prop: 'wikitext|text',
    redirects: '1',
    disableeditsection: '1',
    disablelimitreport: '1',
  };
  return readParse(await apiGet(params, fetchFn));
}

/** IPA for any text through `{{vi-IPA|…}}` (spec §6.3). Characters that would break the template are dropped. */
async function ipaFor(text: string, fetchFn: FetchFn): Promise<Ipa> {
  const safe = text.replace(/[{}|[\]<>]/g, ' ').trim();
  const body = await apiGet({ action: 'expandtemplates', text: `{{vi-IPA|${safe}}}`, prop: 'wikitext' }, fetchFn);
  return ipaFromExpanded(readExpanded(body));
}

interface Found {
  page: PageSource;
  parsed: ParsedWordPage;
}

/** The page to use: the word itself, else an existing spelling variant; an alternative-spelling stub is followed once. */
async function findPage(query: string, fetchFn: FetchFn): Promise<Found | null> {
  const tryPage = async (title: string): Promise<Found | null> => {
    const page = await fetchPage(title, fetchFn);
    const parsed = page ? parseWordPage(page.wikitext, page.html) : null;
    return page && parsed ? { page, parsed } : null;
  };
  let found = await tryPage(query);
  if (!found) {
    const variants = spellingVariants(query);
    if (variants.length > 0) {
      const exists = existingTitles(await apiGet({ action: 'query', titles: variants.join('|') }, fetchFn));
      const title = variants.find((v) => exists.has(v));
      if (title) found = await tryPage(title);
    }
  }
  if (found?.parsed.stubTarget) {
    const target = await tryPage(found.parsed.stubTarget);
    found = target && !target.parsed.stubTarget ? target : null;
  }
  return found && found.parsed.entries.length > 0 ? found : null;
}

/**
 * Looks a word up (spec §6.1). Without a usable page the result has no title and no entries, only IPA.
 * Results are cached for 30 days under the spelling looked up and under the page title.
 */
export async function lookupWord(input: string, options: LookupOptions = {}): Promise<LookupResult> {
  const query = cleanText(input);
  if (!query) throw new Error('Type a word to look up.');
  const fetchFn = options.fetchFn ?? defaultFetch;
  const key = `w:${query}`;
  if (!options.refresh) {
    const hit = await cached<PageResult>(key);
    if (hit) return { ...hit, query };
  }
  const fetchedAt = nowIso();
  const found = await findPage(query, fetchFn);
  let result: PageResult;
  if (found) {
    let { entries } = found.parsed;
    if (entries.some((e) => !e.ipaHanoi && !e.ipaSaigon)) {
      // An entry without a pronunciation section still gets IPA (spec §6.3); a failure here only leaves it empty.
      try {
        const ipa = await ipaFor(found.page.title, fetchFn);
        entries = entries.map((e) => (e.ipaHanoi || e.ipaSaigon ? e : { ...e, ipaHanoi: ipa.hanoi, ipaSaigon: ipa.saigon }));
      } catch (e) {
        console.error('IPA fallback failed', e);
      }
    }
    result = { title: found.page.title, entries, ipaHanoi: '', ipaSaigon: '', fetchedAt };
  } else {
    const ipa = await ipaFor(query, fetchFn);
    result = { title: null, entries: [], ipaHanoi: ipa.hanoi, ipaSaigon: ipa.saigon, fetchedAt };
  }
  await store(result.title ? [key, `w:${result.title}`] : [key], result, fetchedAt);
  return { ...result, query };
}

/** The Vietnamese part of a character page (spec §6.4), or null when there is none. Pass the traditional form. */
export async function lookupChar(char: string, options: LookupOptions = {}): Promise<CharInfo | null> {
  const key = `c:${char}`;
  if (!options.refresh) {
    const hit = await cached<{ info: CharInfo | null }>(key);
    if (hit) return hit.info;
  }
  const body = await apiGet({ action: 'parse', page: char, prop: 'wikitext', redirects: '1' }, options.fetchFn ?? defaultFetch);
  const page = readParse(body);
  const info = page ? parseCharPage(page.title, page.wikitext) : null;
  await store([key], { info }, nowIso());
  return info;
}
