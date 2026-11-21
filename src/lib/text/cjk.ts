/** Code point ranges: CJK Unified Ideographs, Extension A, Compatibility Ideographs, Extensions B–H. */
const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0x20000, 0x2fa1f],
  [0x30000, 0x323af],
];

/** True when `ch` (a single character) is a Han character. */
export function isCjkChar(ch: string): boolean {
  const cp = ch.codePointAt(0);
  return cp !== undefined && CJK_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
}

/** The Han characters in a string, by code point. */
export function cjkChars(s: string): string[] {
  return Array.from(s).filter(isCjkChar);
}

export function hasCjk(s: string): boolean {
  return cjkChars(s).length > 0;
}
