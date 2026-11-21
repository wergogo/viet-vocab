import { parseFile, serializeFile, type VocabData } from '../model/file';
import { mergeRecords, mergeSingle } from '../model/merge';
import { nowIso } from '../model/ids';
import { db } from './db';
import { fromRow, toRow } from './derive';
import { markDirty } from './dirty';

/** All local records (derived fields stripped), optionally including tombstones. */
export async function readLocalData(includeTombstones: boolean): Promise<VocabData> {
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
    const settings = mergeSingle(local.settings, remote.settings);

    await db.words.bulkPut(words.toApply.map((w) => toRow(w)));
    await db.lists.bulkPut(lists.toApply);
    await db.cards.bulkPut(cards.toApply);
    if (settings.applyLocal && settings.winner) await db.settings.put({ ...settings.winner, id: 'settings' });

    const merged: VocabData = { words: words.merged, lists: lists.merged, cards: cards.merged };
    if (settings.winner) merged.settings = settings.winner;
    return {
      applied: words.toApply.length + lists.toApply.length + cards.toApply.length + (settings.applyLocal ? 1 : 0),
      remoteStale: words.remoteStale || lists.remoteStale || cards.remoteStale || settings.remoteStale,
      merged,
    };
  });
}

export async function exportJson(savedAt: string = nowIso()): Promise<string> {
  return serializeFile(await readLocalData(false), savedAt);
}

export async function importJson(text: string): Promise<{ applied: number }> {
  const { applied } = await mergeIntoLocal(parseFile(text));
  if (applied > 0) markDirty();
  return { applied };
}
