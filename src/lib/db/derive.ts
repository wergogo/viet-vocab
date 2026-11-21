import type { Rec, Tombstone, Word } from '../model/types';
import { isLive } from '../model/types';
import { cjkChars } from '../text/cjk';
import { exactKey, looseKey } from '../text/normalize';
import { canonicalTone } from '../text/tone';

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

export function deriveFields(w: Word): WordDerived {
  const text = [w.word, ...w.senses.map((s) => s.meaning)].join('\n');
  const chars = new Set<string>();
  for (const s of w.syllables) {
    if (s.char) for (const c of cjkChars(s.char)) chars.add(c);
  }
  return {
    searchLoose: looseKey(text),
    searchExact: exactKey(canonicalTone(text)),
    chars: [...chars],
  };
}

export function toRow(record: Rec<Word>): WordRow {
  return isLive(record) ? { ...record, ...deriveFields(record) } : record;
}

export function fromRow(row: WordRow): Rec<Word> {
  if (!isLiveRow(row)) return row;
  const { searchLoose: _loose, searchExact: _exact, chars: _chars, ...word } = row;
  return word;
}
