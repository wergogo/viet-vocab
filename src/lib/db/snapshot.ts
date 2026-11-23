import { parseFile, serializeFile, type VocabData } from '../model/file';
import { mergeRecords, mergeSettings } from '../model/merge';
import { nowIso } from '../model/ids';
import { db } from './db';
import { fromRow, toRow } from './derive';
import { markDirty } from './dirty';

/** All local records (derived fields stripped), optionally including tombstones, read as one consistent snapshot. */
export async function readLocalData(includeTombstones: boolean): Promise<VocabData> {
  return db.transaction('r', [db.words, db.lists, db.cards, db.settings], async () => {
    const [wordRows, lists, cards, settingsRow] = await Promise.all([
      db.words.toArray(),
      db.lists.toArray(),
      db.cards.toArray(),
      db.settings.get('settings'),
    ]);
    const keep = (r: { deleted?: true }) => includeTombstones || r.deleted !== true;
    const data: VocabData = {
      words: wordRows.map(fromRow).filter(keep),
      lists: lists.filter(keep),
      cards: cards.filter(keep),
    };
    if (settingsRow) {
      const { id: _id, ...settings } = settingsRow;
      data.settings = settings;
    }
    return data;
  });
}

export interface MergeOutcome {
  /** Number of records written locally. */
  applied: number;
  /** True when the merged data differs from `remote`, so it should be uploaded. */
  remoteStale: boolean;
  /** The merged data, tombstones included. */
  merged: VocabData;
}

/** Merges `remote` into the local database by newest updatedAt (spec §7.3). */
export async function mergeIntoLocal(remote: VocabData): Promise<MergeOutcome> {
  return db.transaction('rw', [db.words, db.lists, db.cards, db.settings], async () => {
    const local = await readLocalData(true);
    const words = mergeRecords(local.words, remote.words);
    const lists = mergeRecords(local.lists, remote.lists);
    const cards = mergeRecords(local.cards, remote.cards);
    const settings = mergeSettings(local.settings, remote.settings);

    await db.words.bulkPut(words.toApply.map((w) => toRow(w)));
    await db.lists.bulkPut(lists.toApply);
    await db.cards.bulkPut(cards.toApply);
    if (settings.applyLocal && settings.merged) await db.settings.put({ ...settings.merged, id: 'settings' });

    const merged: VocabData = { words: words.merged, lists: lists.merged, cards: cards.merged };
    if (settings.merged) merged.settings = settings.merged;
    return {
      applied: words.toApply.length + lists.toApply.length + cards.toApply.length + (settings.applyLocal ? 1 : 0),
      remoteStale: words.remoteStale || lists.remoteStale || cards.remoteStale || settings.remoteStale,
      merged,
    };
  });
}

/**
 * How many word, list and card records are stored, tombstones included. Records are never purged (spec §4.2), so the
 * count only drops when the browser's data was cleared (M4 decision 2).
 */
export async function countLocalRecords(): Promise<number> {
  return db.transaction('r', [db.words, db.lists, db.cards], async () => {
    const counts = await Promise.all([db.words.count(), db.lists.count(), db.cards.count()]);
    return counts[0] + counts[1] + counts[2];
  });
}

/** Live records only (no tombstones): an export can restore words but never deletes anything. */
export async function exportJson(savedAt: string = nowIso()): Promise<string> {
  return serializeFile(await readLocalData(false), savedAt);
}

/** Merges a file by newest edit and returns how many records were written. Never deletes anything the file doesn't delete. */
export async function importJson(text: string): Promise<{ applied: number }> {
  const { applied } = await mergeIntoLocal(parseFile(text));
  if (applied > 0) markDirty();
  return { applied };
}

/** The largest file Import reads (spec §5.6). A sync file with 10,000 words is about 15–20 MB. */
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;

/** A file over the import limit, refused before it is read (spec §11). */
export class ImportTooLargeError extends Error {
  constructor() {
    super("That file is over 50 MB, so it wasn't imported. Nothing was changed.");
    this.name = 'ImportTooLargeError';
  }
}

/** Imports a chosen file as importJson does. One over `maxBytes` is refused unread, so a huge file can't stall the app. */
export async function importFile(file: Blob, maxBytes: number = MAX_IMPORT_BYTES): Promise<{ applied: number }> {
  if (file.size > maxBytes) throw new ImportTooLargeError();
  return importJson(await file.text());
}
