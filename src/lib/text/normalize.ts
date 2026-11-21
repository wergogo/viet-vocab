export function nfc(s: string): string {
  return s.normalize('NFC');
}

/** Trim, collapse inner whitespace to single spaces, compose to NFC. */
export function cleanText(s: string): string {
  return nfc(s).trim().replace(/\s+/g, ' ');
}

/** Remove all Vietnamese diacritics (tones and vowel marks) and map đ/Đ to d/D. */
export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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

export function hasDiacritics(s: string): boolean {
  return stripDiacritics(s) !== nfc(s);
}

/** Vietnamese alphabetical order (a < ă < â < … < d < đ < …). */
export const viCollator = new Intl.Collator('vi');
