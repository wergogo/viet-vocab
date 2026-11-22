import { isNewCardsPerDay, MAX_NEW_CARDS_PER_DAY } from '../model/file';
import { nextTimestamp } from '../model/ids';
import { DEFAULT_SETTINGS, type ReviewSettings } from '../model/types';
import { db } from './db';
import { markDirty } from './dirty';

/** The review settings: the stored record, or the defaults until the first save (spec §4.1). */
export async function getSettings(): Promise<ReviewSettings> {
  const row = await db.settings.get('settings');
  return row ? { newCardsPerDay: row.newCardsPerDay, reverseCards: row.reverseCards } : { ...DEFAULT_SETTINGS };
}

/**
 * Saves a change to the review settings with a new updatedAt (spec §4.2) and marks sync dirty; an unchanged value
 * writes nothing. `newCardsPerDay` must stay in the range parseFile accepts, or exports would stop importing.
 */
export async function saveSettings(change: Partial<ReviewSettings>): Promise<ReviewSettings> {
  if (change.newCardsPerDay !== undefined && !isNewCardsPerDay(change.newCardsPerDay)) {
    throw new RangeError(`New cards per day must be a whole number from 0 to ${MAX_NEW_CARDS_PER_DAY}.`);
  }
  let changed = false;
  const settings = await db.transaction('rw', db.settings, async () => {
    const row = await db.settings.get('settings');
    const current: ReviewSettings = row
      ? { newCardsPerDay: row.newCardsPerDay, reverseCards: row.reverseCards }
      : { ...DEFAULT_SETTINGS };
    const next: ReviewSettings = { ...current, ...change };
    if (row && next.newCardsPerDay === current.newCardsPerDay && next.reverseCards === current.reverseCards) return current;
    await db.settings.put({ id: 'settings', ...next, updatedAt: nextTimestamp(row?.updatedAt) });
    changed = true;
    return next;
  });
  if (changed) markDirty();
  return settings;
}
