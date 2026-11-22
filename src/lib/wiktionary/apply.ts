import type { WordDraft } from '../db/words';
import { cleanText } from '../text/normalize';
import { rebuildSyllables } from '../text/syllables';
import { canonicalTone } from '../text/tone';
import { pairCharacters } from './characters';
import type { LookupEntry, LookupResult } from './types';

export interface AppliedEntry {
  draft: WordDraft;
  /** About the characters (count mismatch, chữ Nôm, older reading), or null. */
  note: string | null;
}

/**
 * Fills the fields a lookup owns from one entry: characters and glosses, meanings, etymology, IPA, audio and
 * source. The word, notes and lists stay as they are. Nothing is saved until Save (spec §5.2).
 */
export function applyEntry(draft: WordDraft, result: LookupResult, entry: LookupEntry): AppliedEntry {
  const pairing = pairCharacters(rebuildSyllables(draft.word, draft.syllables), entry.chars);
  return {
    draft: {
      ...draft,
      syllables: pairing.syllables,
      senses: entry.senses.length > 0 ? entry.senses.map((s) => ({ ...s })) : [{ pos: '', meaning: '' }],
      ipaHanoi: entry.ipaHanoi,
      ipaSaigon: entry.ipaSaigon,
      etymology: entry.etymology,
      audioFile: entry.audioFile,
      source: result.title ? { wiktionaryTitle: result.title, fetchedAt: result.fetchedAt } : undefined,
    },
    note: pairing.note,
  };
}

/** For a word that isn't on Wiktionary: fills only the IPA, keeping what was typed when the lookup has none. */
export function applyIpaOnly(draft: WordDraft, result: LookupResult): WordDraft {
  return { ...draft, ipaHanoi: result.ipaHanoi || draft.ipaHanoi, ipaSaigon: result.ipaSaigon || draft.ipaSaigon };
}

/** Compares spellings the way lookups treat them: cleaned, case-insensitive, tone placement ignored. */
export function sameLookupWord(a: string, b: string): boolean {
  const key = (s: string) => canonicalTone(cleanText(s)).toLocaleLowerCase('vi');
  return key(a) === key(b);
}
