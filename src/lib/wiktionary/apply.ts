import { draftEquivalent, type WordDraft } from '../db/words';
import { wordSource } from '../model/file';
import { rebuildSyllables } from '../text/syllables';
import { wordKey } from '../text/tone';
import { pairCharacters } from './characters';
import type { LookupEntry, LookupResult } from './types';

export interface AppliedEntry {
  draft: WordDraft;
  /** About the characters (count mismatch, chữ Nôm, older reading), or null. */
  note: string | null;
}

/**
 * Fills the fields a lookup owns from one entry: characters and glosses, meanings, etymology, IPA, regions,
 * equivalents, audio and source. A field the entry has no value for keeps the value in `base` (spec §6.5: a partial
 * parse fills what it found), so what the user typed survives. The form passes the draft as it was before the lookup as `base`, so
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
  // A word is never its own equivalent (spec §6.2), even when the page spells it with other tone marks or case.
  const equivalents = entry.equivalents.filter((e) => !sameLookupWord(e.word, draft.word));
  return {
    draft: {
      ...draft,
      syllables,
      senses: (entry.senses.length > 0 ? entry.senses : base.senses).map((s) => ({ ...s })),
      ipaHanoi: entry.ipaHanoi || base.ipaHanoi,
      ipaSaigon: entry.ipaSaigon || base.ipaSaigon,
      etymology: entry.etymology || base.etymology,
      regions: [...(entry.regions.length > 0 ? entry.regions : base.regions)],
      equivalents: equivalents.length > 0 ? equivalents.map(draftEquivalent) : base.equivalents.map(draftEquivalent),
      audioFile: entry.audioFile ?? base.audioFile,
      source: result.title ? wordSource(result.title, result.fetchedAt) : base.source,
    },
    note: pairing.note,
  };
}

/**
 * The draft without a lookup made for another word (M2 decision 5): its page link and recording go, and its regions
 * and equivalents go back to what `base`, the draft before that lookup, had. An entry often has neither, so they would
 * stay with the next word looked up. Its meanings, etymology and IPA stay until the next lookup replaces them.
 */
export function withoutLookup(draft: WordDraft, base: WordDraft | null): WordDraft {
  const next: WordDraft = { ...draft, source: undefined, audioFile: undefined };
  if (base) {
    next.regions = [...base.regions];
    next.equivalents = base.equivalents.map(draftEquivalent);
  }
  return next;
}

/** For a word that isn't on Wiktionary: fills only the IPA, keeping what was typed when the lookup has none. */
export function applyIpaOnly(draft: WordDraft, result: LookupResult): WordDraft {
  return { ...draft, ipaHanoi: result.ipaHanoi || draft.ipaHanoi, ipaSaigon: result.ipaSaigon || draft.ipaSaigon };
}

/** Compares spellings the way lookups treat them: cleaned, case-insensitive, tone placement ignored. */
export function sameLookupWord(a: string, b: string): boolean {
  return wordKey(a) === wordKey(b);
}

/**
 * Whether a lookup made for `sourceWord` still belongs to the word in the form: the same word up to tone placement and
 * case, or the page the lookup led to (M2 decision 5). The form hides a lookup that doesn't, and drops it only when
 * another lookup starts or the form is saved, so fixing a typo with backspace keeps the lookup.
 */
export function lookupStillApplies(word: string, sourceWord: string, pageTitle?: string): boolean {
  return sameLookupWord(word, sourceWord) || (pageTitle !== undefined && sameLookupWord(word, pageTitle));
}
