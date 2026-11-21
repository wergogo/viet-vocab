import { nfc } from './normalize';

/** Combining tone marks: grave, acute, tilde, hook above, dot below. */
const TONE = new RegExp(`[${String.fromCodePoint(0x0300, 0x0301, 0x0303, 0x0309, 0x0323)}]`);
/** Syllables whose tone placement is ambiguous: …oa, …oe, …uy at the end. */
const PAIR = /^(.*?)(o[ae]|uy)$/i;

function splitTone(syllable: string): { base: string; tone: string | null } {
  const decomposed = syllable.normalize('NFD');
  const match = TONE.exec(decomposed);
  if (!match) return { base: nfc(syllable), tone: null };
  return { base: nfc(decomposed.replace(TONE, '')), tone: match[0] };
}

function placeTone(base: string, index: number, tone: string): string {
  const chars = Array.from(base);
  chars[index] = nfc(chars[index] + tone);
  return chars.join('');
}

/**
 * For an ambiguous syllable: [tone on the first vowel of the pair, tone on the second].
 * Otherwise: [syllable] unchanged.
 */
export function syllableVariants(syllable: string): string[] {
  const { base, tone } = splitTone(syllable);
  if (!tone) return [nfc(syllable)];
  const match = PAIR.exec(base);
  if (!match || /q$/i.test(match[1])) return [nfc(syllable)];
  const i = Array.from(match[1]).length;
  return [placeTone(base, i, tone), placeTone(base, i + 1, tone)];
}

function mapSyllables(word: string, pick: (variants: string[], original: string) => string): string {
  return nfc(word)
    .split(/([\s-]+)/)
    .map((part) => (/^[\s-]*$/.test(part) ? part : pick(syllableVariants(part), nfc(part))))
    .join('');
}

/** The same word with the other tone-mark placement, or null if nothing differs. */
export function toneVariant(word: string): string | null {
  const swapped = mapSyllables(word, (variants, original) =>
    variants.length === 2 ? (variants[0] === original ? variants[1] : variants[0]) : original,
  );
  return swapped === nfc(word) ? null : swapped;
}

/** Placement-independent form (tone on the second vowel of oa/oe/uy), for comparisons. */
export function canonicalTone(word: string): string {
  return mapSyllables(word, (variants, original) => (variants.length === 2 ? variants[1] : original));
}
