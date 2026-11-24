import type { Region, Word } from '../model/types';
import { viCollator } from '../text/normalize';
import { wordKey } from '../text/tone';
import type { LiveWordRow } from './derive';
import { findDuplicates } from './search';

/** One word on a word card's "In other regions" line (spec §5.3). */
export interface RegionLink {
  word: string;
  regions: Region[];
  /** The saved word it opens. Without one, it opens Add with the word looked up. */
  id?: string;
}

const byAge = (a: Word, b: Word) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

/**
 * A word card's "In other regions" line (spec §5.3): the word's equivalents, then, in Vietnamese order, the saved
 * words that name this word among their equivalents, with their own regions. Each word appears once.
 *
 * An equivalent opens a saved word with its spelling, by the duplicate check's key: one that names this word back if
 * there is one, else the oldest. An equivalent stored without regions shows that saved word's regions.
 */
export function regionLinks(word: Word, words: LiveWordRow[]): RegionLink[] {
  const key = wordKey(word.word);
  const namesThis = (w: Word) => w.equivalents?.some((e) => wordKey(e.word) === key) ?? false;
  const shown = new Set([key]);
  const links: RegionLink[] = [];
  for (const e of word.equivalents ?? []) {
    const k = wordKey(e.word);
    if (shown.has(k)) continue;
    shown.add(k);
    const [saved] = findDuplicates(words, e.word, word.id).sort(
      (a, b) => Number(namesThis(b)) - Number(namesThis(a)) || byAge(a, b),
    );
    const regions = e.regions ?? saved?.regions ?? [];
    links.push(saved ? { word: e.word, regions, id: saved.id } : { word: e.word, regions });
  }
  const naming = words.filter((w) => w.id !== word.id && namesThis(w)).sort((a, b) => viCollator.compare(a.word, b.word));
  for (const w of naming) {
    const k = wordKey(w.word);
    if (shown.has(k)) continue;
    shown.add(k);
    links.push({ word: w.word, regions: w.regions ?? [], id: w.id });
  }
  return links;
}
