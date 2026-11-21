import type { List } from '../model/types';
import { isLive, tombstone } from '../model/types';
import { newId, nextTimestamp, nowIso } from '../model/ids';
import { cleanText, viCollator } from '../text/normalize';
import { db } from './db';
import { isLiveRow } from './derive';
import { markDirty } from './dirty';

function requireName(name: string): string {
  const clean = cleanText(name);
  if (!clean) throw new Error('List name is required');
  return clean;
}

/** The key two live list names must not share: cleaned like storage (NFC, no zero-width characters, single spaces), ignoring case. */
export function listNameKey(name: string): string {
  return cleanText(name).toLocaleLowerCase('vi');
}

export async function createList(name: string): Promise<List> {
  const now = nowIso();
  const list: List = { id: newId(), name: requireName(name), createdAt: now, updatedAt: now };
  await db.lists.put(list);
  markDirty();
  return list;
}

/** Returns the live list with this name (ignoring case), creating it if there is none. One transaction, so concurrent calls can't create duplicates. */
export async function findOrCreateList(name: string): Promise<List> {
  const clean = requireName(name);
  const key = listNameKey(clean);
  const { list, created } = await db.transaction('rw', db.lists, async () => {
    const existing = (await db.lists.toArray()).find(
      (l): l is List => isLive(l) && listNameKey(l.name) === key,
    );
    if (existing) return { list: existing, created: false };
    const now = nowIso();
    const fresh: List = { id: newId(), name: clean, createdAt: now, updatedAt: now };
    await db.lists.put(fresh);
    return { list: fresh, created: true };
  });
  if (created) markDirty();
  return list;
}

export async function renameList(id: string, name: string): Promise<void> {
  const clean = requireName(name);
  const changed = await db.transaction('rw', db.lists, async () => {
    const list = await db.lists.get(id);
    if (!list || !isLive(list)) throw new Error(`List ${id} not found`);
    if (list.name === clean) return false;
    await db.lists.put({ ...list, name: clean, updatedAt: nextTimestamp(list.updatedAt) });
    return true;
  });
  if (changed) markDirty();
}

/** Tombstones the list and removes its id from every word that had it. Deleting twice does nothing. */
export async function deleteList(id: string): Promise<void> {
  const changed = await db.transaction('rw', db.lists, db.words, async () => {
    const list = await db.lists.get(id);
    if (list && !isLive(list)) return false;
    await db.lists.put(tombstone(id, nextTimestamp(list?.updatedAt)));
    const affected = (await db.words.toArray()).filter(isLiveRow).filter((w) => w.listIds.includes(id));
    await db.words.bulkPut(
      affected.map((w) => ({ ...w, listIds: w.listIds.filter((l) => l !== id), updatedAt: nextTimestamp(w.updatedAt) })),
    );
    return true;
  });
  if (changed) markDirty();
}

export async function listLiveLists(): Promise<List[]> {
  const lists = (await db.lists.toArray()).filter((l): l is List => isLive(l));
  return lists.sort((a, b) => viCollator.compare(a.name, b.name));
}
