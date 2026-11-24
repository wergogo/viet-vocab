import type { Region } from '../model/types';
import { cjkChars, hasCjk } from '../text/cjk';
import { cleanText, exactKey, hasDiacritics, looseKey, viCollator } from '../text/normalize';
import { canonicalTone, wordKey } from '../text/tone';
import { SEARCH_KEY_SEPARATOR, type LiveWordRow } from './derive';

export type SortMode = 'newest' | 'az';

/** Character → itself plus simplified/traditional variants. */
export type VariantFn = (ch: string) => string[];

export interface SearchOptions {
  query: string;
  listId?: string;
  /** Only words used in any of these regions (spec §5.1); none or an empty list keeps every word. */
  regions?: readonly Region[];
  sort: SortMode;
  /** Defaults to the character alone. */
  variants?: VariantFn;
}

const sameChar: VariantFn = (ch) => [ch];

/** Builds a matcher for one query, normalizing the query once instead of once per word. */
export function compileQuery(query: string, variants: VariantFn = sameChar): (w: LiveWordRow) => boolean {
  const q = cleanText(query);
  if (!q) return () => true;
  if (hasCjk(q)) {
    // Character mode (spec §5.1): any Han character in the query switches to matching characters only.
    const groups = cjkChars(q).map((c) => variants(c));
    return (w) => groups.every((group) => group.some((v) => w.chars.includes(v)));
  }
  if (hasDiacritics(q)) {
    const needle = exactKey(canonicalTone(q));
    return (w) => w.searchExact.includes(needle);
  }
  const needle = looseKey(q);
  return (w) => w.searchLoose.includes(needle);
}

export function matchesQuery(w: LiveWordRow, query: string, variants?: VariantFn): boolean {
  return compileQuery(query, variants)(w);
}

export function searchWords(words: LiveWordRow[], opts: SearchOptions): LiveWordRow[] {
  const matches = compileQuery(opts.query, opts.variants);
  const regions = opts.regions ?? [];
  const inRegion = (w: LiveWordRow) => regions.length === 0 || (w.regions ?? []).some((r) => regions.includes(r));
  const results = words.filter((w) => (!opts.listId || w.listIds.includes(opts.listId)) && inRegion(w) && matches(w));
  if (opts.sort === 'az') return results.sort((a, b) => viCollator.compare(a.word, b.word));
  return results.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/**
 * Saved words with the same text, ignoring case and tone-mark placement. Compares against the stored
 * exact key (headword first, then the separator), so no row is re-normalized per keystroke.
 */
export function findDuplicates(words: LiveWordRow[], text: string, excludeId?: string): LiveWordRow[] {
  const key = wordKey(text);
  if (!key) return [];
  const prefix = key + SEARCH_KEY_SEPARATOR;
  return words.filter((w) => w.id !== excludeId && (w.searchExact === key || w.searchExact.startsWith(prefix)));
}
