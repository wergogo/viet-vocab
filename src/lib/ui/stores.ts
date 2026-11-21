import { liveQuery } from 'dexie';
import { readable, type Readable } from 'svelte/store';
import { db } from '../db/db';
import type { WordRow } from '../db/derive';
import { listLiveLists } from '../db/lists';
import { listLiveWords } from '../db/words';

/** A Svelte store over a Dexie live query: undefined until the first result; query errors are logged. */
function liveStore<T>(querier: () => Promise<T>): Readable<T | undefined> {
  return readable<T | undefined>(undefined, (set) => {
    const subscription = liveQuery(querier).subscribe({
      next: (value) => set(value),
      error: (err: unknown) => console.error('Live query failed', err),
    });
    return () => subscription.unsubscribe();
  });
}

/** All live words (with derived fields); re-emits whenever the database changes. */
export const liveWords = liveStore(() => listLiveWords());

/** All live lists in Vietnamese order. */
export const liveLists = liveStore(() => listLiveLists());

/** One word row by id: undefined while loading, null when it doesn't exist. */
export function liveWordRow(id: string): Readable<WordRow | null | undefined> {
  return liveStore(async () => (await db.words.get(id)) ?? null);
}
