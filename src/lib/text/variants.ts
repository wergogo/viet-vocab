export interface StTable {
  /** Simplified → traditional candidates, concatenated ("发" → "發髮"). */
  s2t: Record<string, string>;
  /** Traditional → simplified candidates, concatenated. */
  t2s: Record<string, string>;
}

let cached: Promise<StTable> | null = null;

/**
 * Loads the table lazily (a separate chunk in the production build). The next call tries a failed load again, though
 * most browsers still cache a failed module load until the page reloads.
 */
export function loadStTable(): Promise<StTable> {
  cached ??= import('./st-table.json')
    .then((m) => m.default as unknown as StTable)
    .catch((e: unknown) => {
      cached = null;
      throw e;
    });
  return cached;
}

/**
 * The candidates stored for `ch`, or '' when there are none. Own keys only: the table is a plain JSON
 * object, so it also inherits keys such as constructor and toString, which a typed URL can name.
 */
function entry(map: Record<string, string>, ch: string): string {
  return Object.hasOwn(map, ch) ? map[ch] : '';
}

/**
 * The character plus every simplified/traditional sibling: its simplified forms, then all traditional
 * candidates of those (so 乾 → 干 → 幹, 乾, 榦). Used to widen search matches.
 */
export function charVariants(ch: string, table: StTable): string[] {
  const out = new Set<string>();
  for (const s of [ch, ...Array.from(entry(table.t2s, ch))]) {
    out.add(s);
    for (const t of Array.from(entry(table.s2t, s))) out.add(t);
  }
  return [...out];
}

/**
 * Traditional form for a lookup: the character itself when it is already valid traditional
 * (台, 里, 干) or has no entry, otherwise the first OpenCC candidate (发 → 發).
 */
export function toTraditional(ch: string, table: StTable): string {
  const candidates = Array.from(entry(table.s2t, ch));
  return candidates.length === 0 || candidates.includes(ch) ? ch : candidates[0];
}
