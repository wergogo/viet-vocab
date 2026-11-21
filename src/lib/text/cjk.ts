/**
 * Han (Chinese) character detection. Only ideographs count: kana, hangul, CJK punctuation,
 * radicals (U+2E80–U+2FDF) and marks such as 々 or 〇 are deliberately excluded.
 */

/** Code point ranges: CJK Unified Ideographs, Extension A, Compatibility Ideographs, Extensions B–J. */
const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0x20000, 0x2fa1f],
  [0x30000, 0x3347f],
];

/** True when the first code point of `ch` is a Han character (callers pass single characters). */
export function isCjkChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  return cp !== undefined && CJK_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** The Han characters in a string, by code point. */
export function cjkChars(s: string): string[] {
  return Array.from(s).filter(isCjkChar);
}

/** True when the string contains at least one Han character. */
export function hasCjk(s: string): boolean {
  return cjkChars(s).length > 0;
}
