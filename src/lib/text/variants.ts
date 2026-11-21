export interface StTable {
  /** Simplified → traditional candidates, concatenated ("发" → "發髮"). */
  s2t: Record<string, string>;
  /** Traditional → simplified candidates, concatenated. */
  t2s: Record<string, string>;
}

let cached: Promise<StTable> | null = null;

/** Loads the table lazily (a separate chunk in the production build). */
export function loadStTable(): Promise<StTable> {
  cached ??= import('./st-table.json').then((m) => m.default as unknown as StTable);
  return cached;
}

/** The character plus its simplified and traditional counterparts (one step each way). */
export function charVariants(ch: string, table: StTable): string[] {
  const out = new Set<string>([ch]);
  for (const v of Array.from(table.s2t[ch] ?? '')) out.add(v);
  for (const v of Array.from(table.t2s[ch] ?? '')) out.add(v);
  return [...out];
}

/** Preferred traditional form (first OpenCC candidate), or the character itself. */
export function toTraditional(ch: string, table: StTable): string {
  return Array.from(table.s2t[ch] ?? '')[0] ?? ch;
}
