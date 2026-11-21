import type { Syllable } from '../model/types';
import { cleanText } from './normalize';

export function splitSyllables(word: string): string[] {
  return cleanText(word)
    .split(/[\s-]+/)
    .filter((s) => s.length > 0);
}

/**
 * One entry per syllable of `word`. When the syllable count is unchanged,
 * existing characters and glosses stay at their positions.
 */
export function rebuildSyllables(word: string, previous: Syllable[] = []): Syllable[] {
  const texts = splitSyllables(word);
  const keep = previous.length === texts.length;
  return texts.map((text, i) => {
    const prev = keep ? previous[i] : undefined;
    const syllable: Syllable = { text };
    if (prev?.char) syllable.char = prev.char;
    if (prev?.gloss) syllable.gloss = prev.gloss;
    return syllable;
  });
}
