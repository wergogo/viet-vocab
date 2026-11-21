import Dexie, { type Table } from 'dexie';
import type { List, Rec, ReviewCard, Settings } from '../model/types';
import type { WordRow } from './derive';

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
    this.version(1).stores({
      words: 'id',
      lists: 'id',
      cards: 'id, wordId',
      settings: 'id',
      lookupCache: 'title',
    });
  }
}

export const db = new VocabDB();

/** Clears every table (used by tests). */
export async function resetDb(): Promise<void> {
  await Promise.all(db.tables.map((t) => t.clear()));
}
