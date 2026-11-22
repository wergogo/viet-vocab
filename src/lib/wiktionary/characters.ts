import type { Syllable } from '../model/types';
import { cjkChars, isCjkChar } from '../text/cjk';
import { findTemplates, wikiToText } from './templates';
import type { WikiEntry } from './wikitext';

/**
 * Where an entry's characters came from:
 * - `sino`: `{{vi-etym-sino}}`;
 * - `reading`: `{{vi-etym-sino}}` with hv=, nat= or preMC= (a non-Sino-Vietnamese reading; not paired);
 * - `headword`: the headword template's first parameter (may be chữ Nôm).
 */
export type CharsKind = 'sino' | 'reading' | 'headword';

export interface EntryChars {
  kind: CharsKind;
  /** Han/Nôm code points in order. */
  chars: string[];
  /** One gloss per character, when every Sinitic term is a single character; otherwise null. */
  glosses: string[] | null;
}

function allCjk(s: string): boolean {
  const cs = Array.from(s);
  return cs.length > 0 && cs.every(isCjkChar);
}

/** The characters for one entry (spec §6.2 "Characters" and "Fallback characters"), or null. */
export function charactersFromEntry(entry: WikiEntry): EntryChars | null {
  const [sino] = findTemplates(entry.text, 'vi-etym-sino');
  if (sino) {
    const params = sino.positional;
    if ('hv' in sino.named || 'nat' in sino.named || 'preMC' in sino.named) {
      return { kind: 'reading', chars: cjkChars(params[0] ?? ''), glosses: null };
    }
    const terms = params.filter((_, i) => i % 2 === 0);
    const glosses = params.filter((_, i) => i % 2 === 1).map(wikiToText);
    const chars = cjkChars(terms.join(''));
    const perChar = terms.length > 0 && terms.every((t) => Array.from(t).length === 1);
    return { kind: 'sino', chars, glosses: perChar ? terms.map((_, i) => glosses[i] ?? '') : null };
  }
  for (const pos of entry.pos) {
    const first = pos.headword?.positional[0];
    if (first && allCjk(first)) return { kind: 'headword', chars: Array.from(first), glosses: null };
  }
  return null;
}

export interface Pairing {
  syllables: Syllable[];
  /** Shown next to the syllable boxes, or null. */
  note: string | null;
}

/**
 * Puts characters (and per-character glosses) on the syllables when the counts match (spec §6.2 "Pairing").
 * Characters and glosses already on the syllables are replaced: the lookup owns these boxes.
 */
export function pairCharacters(syllables: readonly Syllable[], found: EntryChars | null): Pairing {
  const cleared = syllables.map((s) => ({ text: s.text }));
  if (!found || found.chars.length === 0) return { syllables: cleared, note: null };
  const joined = found.chars.join('');
  if (found.kind === 'reading') {
    return {
      syllables: cleared,
      note: `${joined} is an older, non-Sino-Vietnamese reading, so its characters weren't matched to syllables.`,
    };
  }
  if (found.chars.length !== syllables.length) {
    return {
      syllables: cleared,
      note: `${found.chars.length} characters (${joined}), ${syllables.length} syllables — fill in by hand.`,
    };
  }
  const paired = syllables.map((s, i) => {
    const out: Syllable = { text: s.text, char: found.chars[i]! };
    const gloss = found.glosses?.[i];
    if (gloss) out.gloss = gloss;
    return out;
  });
  return {
    syllables: paired,
    note: found.kind === 'headword' ? `${joined} comes from the headword and may be chữ Nôm.` : null,
  };
}
