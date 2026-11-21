import { cjkChars, hasCjk } from '../text/cjk';
import { cleanText, exactKey, hasDiacritics, looseKey, viCollator } from '../text/normalize';
import { canonicalTone } from '../text/tone';
import type { LiveWordRow } from './derive';

export type SortMode = 'newest' | 'az';

export interface SearchOptions {
  query: string;
  listId?: string;
  sort: SortMode;
  /** Character → itself plus simplified/traditional variants. Defaults to the character alone. */
  variants?: (ch: string) => string[];
}

const sameChar = (ch: string) => [ch];

export function matchesQuery(w: LiveWordRow, query: string, variants: (ch: string) => string[] = sameChar): boolean {
  const q = cleanText(query);
  if (!q) return true;
  if (hasCjk(q)) {
    const chars = new Set(w.chars);
    return cjkChars(q).every((c) => variants(c).some((v) => chars.has(v)));
  }
  if (hasDiacritics(q)) return w.searchExact.includes(exactKey(canonicalTone(q)));
  return w.searchLoose.includes(looseKey(q));
}

export function searchWords(words: LiveWordRow[], opts: SearchOptions): LiveWordRow[] {
  const results = words.filter(
    (w) => (!opts.listId || w.listIds.includes(opts.listId)) && matchesQuery(w, opts.query, opts.variants),
  );
  if (opts.sort === 'az') return results.sort((a, b) => viCollator.compare(a.word, b.word));
  return results.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** Saved words with the same text, ignoring case and tone-mark placement. */
export function findDuplicates(words: LiveWordRow[], text: string, excludeId?: string): LiveWordRow[] {
  const key = exactKey(canonicalTone(cleanText(text)));
  if (!key) return [];
  return words.filter((w) => w.id !== excludeId && exactKey(canonicalTone(w.word)) === key);
}
