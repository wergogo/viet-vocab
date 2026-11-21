import type { Rec, Tombstone, Word } from '../model/types';
import { isLive } from '../model/types';
import { cjkChars } from '../text/cjk';
import { cleanText, exactKey, looseKey, nfc } from '../text/normalize';
import { canonicalTone } from '../text/tone';

/** Bump when deriveFields changes, so stored rows are recomputed on the next start (see rederiveIfNeeded in db.ts). */
export const DERIVE_VERSION = 2;

/** Joins the word and its meanings in the search keys; cleanText'ed queries never contain it. */
export const SEARCH_KEY_SEPARATOR = '\n';

export interface WordDerived {
  /** Word + meanings, diacritics removed, lowercase. */
  searchLoose: string;
  /** Word + meanings, lowercase NFC, tone-mark placement normalized. */
  searchExact: string;
  /** Distinct Han characters across the syllables. */
  chars: string[];
}

export type LiveWordRow = Word & WordDerived;
export type WordRow = LiveWordRow | Tombstone;

export function isLiveRow(row: WordRow): row is LiveWordRow {
  return row.deleted !== true;
}

/**
 * Search keys and characters stored with a word. The word and its meanings are joined with a newline;
 * queries are cleaned with cleanText (which collapses whitespace), so a query never matches across it.
 * Keys are built from cleaned text and characters from NFC, because imported records may not be cleaned
 * the way the form cleans them; the stored text itself is never rewritten.
 */
export function deriveFields(w: Word): WordDerived {
  const text = [w.word, ...w.senses.map((s) => s.meaning)].map(cleanText).join(SEARCH_KEY_SEPARATOR);
  const chars = new Set<string>();
  for (const s of w.syllables) {
    // NFC maps CJK compatibility ideographs to their unified forms, which is what searches look for.
    if (s.char) for (const c of cjkChars(nfc(s.char))) chars.add(c);
  }
  return {
    searchLoose: looseKey(text),
    searchExact: exactKey(canonicalTone(text)),
    chars: [...chars],
  };
}

export function toRow(record: Word): LiveWordRow;
export function toRow(record: Rec<Word>): WordRow;
export function toRow(record: Rec<Word>): WordRow {
  return isLive(record) ? { ...record, ...deriveFields(record) } : record;
}

export function fromRow(row: LiveWordRow): Word;
export function fromRow(row: WordRow): Rec<Word>;
export function fromRow(row: WordRow): Rec<Word> {
  if (!isLiveRow(row)) return row;
  const { searchLoose: _loose, searchExact: _exact, chars: _chars, ...word } = row;
  return word;
}
