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
 * source. A field the entry has no value for keeps the value in `base` (spec §6.5: a partial parse fills what it
 * found), so what the user typed survives. The form passes the draft as it was before the lookup as `base`, so
 * switching etymologies never leaves one entry's values in another. The word, notes and lists always come from
 * `draft`. Nothing is saved until Save (spec §5.2).
 */
export function applyEntry(draft: WordDraft, result: LookupResult, entry: LookupEntry, base: WordDraft = draft): AppliedEntry {
  const typed = rebuildSyllables(draft.word, base.syllables);
  const pairing = pairCharacters(typed, entry.chars);
  const paired = pairing.syllables.some((s) => s.char);
  // Paired syllables keep a typed gloss where the entry has none (whole-word terms carry no per-character glosses).
  const syllables = paired
    ? pairing.syllables.map((s, i) => (s.gloss || !typed[i]?.gloss ? s : { ...s, gloss: typed[i]!.gloss }))
    : typed;
  return {
    draft: {
      ...draft,
      syllables,
      senses: (entry.senses.length > 0 ? entry.senses : base.senses).map((s) => ({ ...s })),
      ipaHanoi: entry.ipaHanoi || base.ipaHanoi,
      ipaSaigon: entry.ipaSaigon || base.ipaSaigon,
      etymology: entry.etymology || base.etymology,
      audioFile: entry.audioFile ?? base.audioFile,
      source: result.title ? { wiktionaryTitle: result.title, fetchedAt: result.fetchedAt } : base.source,
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
