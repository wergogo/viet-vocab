export interface StTable {
  /** Simplified → traditional candidates, concatenated ("发" → "發髮"). */
  s2t: Record<string, string>;
  /** Traditional → simplified candidates, concatenated. */
  t2s: Record<string, string>;
}

let cached: Promise<StTable> | null = null;

/** Loads the table lazily (a separate chunk in the production build). A failed load is retried next time. */
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
 * The character plus every simplified/traditional sibling: its simplified forms, then all traditional
 * candidates of those (so 乾 → 干 → 幹, 乾, 榦). Used to widen search matches.
 */
export function charVariants(ch: string, table: StTable): string[] {
  const out = new Set<string>();
  for (const s of [ch, ...Array.from(table.t2s[ch] ?? '')]) {
    out.add(s);
    for (const t of Array.from(table.s2t[s] ?? '')) out.add(t);
  }
  return [...out];
}

/**
 * Traditional form for a lookup: the character itself when it is already valid traditional
 * (台, 里, 干) or has no entry, otherwise the first OpenCC candidate (发 → 發).
 */
export function toTraditional(ch: string, table: StTable): string {
  const candidates = Array.from(table.s2t[ch] ?? '');
  return candidates.length === 0 || candidates.includes(ch) ? ch : candidates[0];
}
