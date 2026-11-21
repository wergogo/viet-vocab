import Dexie, { type Table } from 'dexie';
import type { List, Rec, ReviewCard, Settings } from '../model/types';
import { DERIVE_VERSION, fromRow, toRow, type WordRow } from './derive';

export interface SettingsRow extends Settings {
  id: 'settings';
}

export interface LookupCacheRow {
  title: string;
  fetchedAt: string;
  data: unknown;
}

export class VocabDB extends Dexie {
  declare words: Table<WordRow, string>;
  declare lists: Table<Rec<List>, string>;
  declare cards: Table<Rec<ReviewCard>, string>;
  declare settings: Table<SettingsRow, string>;
  declare lookupCache: Table<LookupCacheRow, string>;

  constructor(name = 'viet-vocab') {
    super(name);
    // When the stores change, add a new this.version(n).stores({...}) block; Dexie migrates existing data.
    // When only deriveFields changes, bump DERIVE_VERSION in derive.ts instead.
    this.version(1).stores({
      words: 'id',
      lists: 'id',
      cards: 'id, wordId',
      settings: 'id',
      lookupCache: 'title, fetchedAt',
    });
  }
}

export const db = new VocabDB();

/** Clears every table in one transaction (used by tests). */
export async function resetDb(): Promise<void> {
  await db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())));
}

const DERIVE_KEY = 'vv.derive.version';

/** Recomputes stored search keys when DERIVE_VERSION changed since they were written. Returns true if it ran. */
export async function rederiveIfNeeded(): Promise<boolean> {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(DERIVE_KEY);
  } catch {
    // Storage unavailable: recompute every start, which is cheap for one person's words.
  }
  if (stored === String(DERIVE_VERSION)) return false;
  await db.transaction('rw', db.words, async () => {
    const rows = await db.words.toArray();
    await db.words.bulkPut(rows.map((row) => toRow(fromRow(row))));
  });
  try {
    localStorage.setItem(DERIVE_KEY, String(DERIVE_VERSION));
  } catch {
    // ignore
  }
  return true;
}
