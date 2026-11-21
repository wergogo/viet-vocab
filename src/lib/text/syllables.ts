import type { Syllable } from '../model/types';
import { cleanText, looseKey } from './normalize';

export function splitSyllables(word: string): string[] {
  return cleanText(word)
    .split(/[\s-]+/)
    .filter((s) => s.length > 0);
}

function copyData(target: Syllable, source: Syllable): void {
  if (source.char) target.char = source.char;
  if (source.gloss) target.gloss = source.gloss;
}

function sameSyllable(a: string, b: string): boolean {
  return looseKey(a) === looseKey(b);
}

/**
 * One entry per syllable of `word`, carrying characters and glosses over from `previous`:
 * - same syllable count: by position, so fixing a typo keeps the data;
 * - different count: syllables that still match the start or the end of the old word
 *   (ignoring diacritics and case) keep their data, and the rest start empty.
 */
export function rebuildSyllables(word: string, previous: Syllable[] = []): Syllable[] {
  const texts = splitSyllables(word);
  const result: Syllable[] = texts.map((text) => ({ text }));
  if (previous.length === texts.length) {
    previous.forEach((p, i) => copyData(result[i], p));
    return result;
  }
  const overlap = Math.min(texts.length, previous.length);
  let head = 0;
  while (head < overlap && sameSyllable(texts[head], previous[head].text)) {
    copyData(result[head], previous[head]);
    head++;
  }
  for (let k = 1; k <= overlap - head; k++) {
    const i = texts.length - k;
    const j = previous.length - k;
    if (!sameSyllable(texts[i], previous[j].text)) break;
    copyData(result[i], previous[j]);
  }
  return result;
}
