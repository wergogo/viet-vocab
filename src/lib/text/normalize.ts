/** U+0300–U+036F, the Combining Diacritical Marks block: every Vietnamese tone and vowel mark after NFD. */
const COMBINING_MARKS = new RegExp(`[${String.fromCodePoint(0x0300)}-${String.fromCodePoint(0x036f)}]`, 'g');

/** Zero-width characters that sneak in when text is pasted from web pages (ZWSP, ZWNJ, ZWJ, word joiner, BOM). */
const ZERO_WIDTH = new RegExp(`[${String.fromCodePoint(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)}]`, 'g');

export function nfc(s: string): string {
  return s.normalize('NFC');
}

/** Drop zero-width characters, trim, collapse inner whitespace to single spaces, compose to NFC. */
export function cleanText(s: string): string {
  return nfc(s).replace(ZERO_WIDTH, '').trim().replace(/\s+/g, ' ');
}

/** Remove all Vietnamese diacritics (tones and vowel marks) and map đ/Đ to d/D. */
export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .normalize('NFC');
}

/** Key for diacritic-insensitive search. */
export function looseKey(s: string): string {
  return stripDiacritics(s).toLowerCase();
}

/** Key for exact (diacritic-sensitive, case-insensitive) search. */
export function exactKey(s: string): string {
  return nfc(s).toLowerCase();
}

/**
 * True when the text has any combining diacritic or đ/Đ. Vietnamese is the target, but marks from
 * other languages (é, ñ, ü) count too, which is fine for choosing exact over loose search.
 */
export function hasDiacritics(s: string): boolean {
  return stripDiacritics(s) !== nfc(s);
}

/** Vietnamese alphabetical order (a < ă < â < … < d < đ < …). */
export const viCollator = new Intl.Collator('vi');
