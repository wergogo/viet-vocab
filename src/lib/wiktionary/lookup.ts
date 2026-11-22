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

/** Bump when parsing changes what a lookup returns, so results cached by older code are ignored. */
const CACHE_VERSION = 1;
const wordKey = (spelling: string) => `w${CACHE_VERSION}:${spelling}`;
const charKey = (char: string) => `c${CACHE_VERSION}:${char}`;

function capitalize(s: string): string {
  const [first = '', ...rest] = Array.from(s);
  return first.toLocaleUpperCase('vi') + rest.join('');
}

function decapitalize(s: string): string {
  const [first = '', ...rest] = Array.from(s);
  return first.toLocaleLowerCase('vi') + rest.join('');
}

/**
 * Spellings to try when a page is missing, in order of preference: the other tone-mark placement and a lowercase
 * first letter (spec §6.1), then capitalized forms, because proper nouns typed on a phone are often lowercase
 * (hà nội → Hà Nội, tiếng việt → tiếng Việt). They all go into one `action=query` request.
 */
export function spellingVariants(word: string): string[] {
  const out: string[] = [];
  const add = (v: string) => {
    for (const s of [v, toneVariant(v)]) if (s && s !== word && !out.includes(s)) out.push(s);
  };
  const syllables = word.split(' ');
  add(word);
  add(decapitalize(word));
  add(capitalize(word));
  add(syllables.map(capitalize).join(' '));
  if (syllables.length > 1) add([...syllables.slice(0, -1), capitalize(syllables.at(-1)!)].join(' '));
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

/** IPA for any text through `{{vi-IPA|…}}` (spec §6.3). */
async function ipaFor(text: string, fetchFn: FetchFn): Promise<Ipa> {
  // "{ } | [ ] < >" would break the template, and "=" would turn the text into a named parameter (decision 9).
  const safe = text.replace(/[{}|[\]<>=]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe) return { hanoi: '', saigon: '' };
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
  if (!options.refresh) {
    const hit = await cached<PageResult>(wordKey(query));
    if (hit) return { ...hit, query };
  }
  const fetchedAt = nowIso();
  const found = await findPage(query, fetchFn);
  let result: PageResult;
  let cacheable = true;
  if (found) {
    let { entries } = found.parsed;
    if (entries.some((e) => !e.ipaHanoi && !e.ipaSaigon)) {
      // An entry without a pronunciation section still gets IPA (spec §6.3). If that request fails, the page is
      // still shown, but not cached, so the next lookup tries the IPA again.
      try {
        const ipa = await ipaFor(found.page.title, fetchFn);
        entries = entries.map((e) => (e.ipaHanoi || e.ipaSaigon ? e : { ...e, ipaHanoi: ipa.hanoi, ipaSaigon: ipa.saigon }));
      } catch (e) {
        console.error('IPA fallback failed', e);
        cacheable = false;
      }
    }
    result = { title: found.page.title, entries, ipaHanoi: '', ipaSaigon: '', fetchedAt };
  } else {
    const ipa = await ipaFor(query, fetchFn);
    result = { title: null, entries: [], ipaHanoi: ipa.hanoi, ipaSaigon: ipa.saigon, fetchedAt };
  }
  if (cacheable) {
    await store(result.title ? [wordKey(query), wordKey(result.title)] : [wordKey(query)], result, fetchedAt);
  }
  return { ...result, query };
}

/** The Vietnamese part of a character page (spec §6.4), or null when there is none. Pass the traditional form. */
export async function lookupChar(char: string, options: LookupOptions = {}): Promise<CharInfo | null> {
  if (!options.refresh) {
    const hit = await cached<{ info: CharInfo | null }>(charKey(char));
    if (hit) return hit.info;
  }
  const body = await apiGet({ action: 'parse', page: char, prop: 'wikitext', redirects: '1' }, options.fetchFn ?? defaultFetch);
  const page = readParse(body);
  const info = page ? parseCharPage(page.title, page.wikitext) : null;
  await store([charKey(char)], { info }, nowIso());
  return info;
}
