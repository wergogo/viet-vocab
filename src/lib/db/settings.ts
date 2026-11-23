import { nextTimestamp } from '../model/ids';
import { settingTimes } from '../model/merge';
import { isNewCardsPerDay, MAX_NEW_CARDS_PER_DAY } from '../model/settings';
import { DEFAULT_SETTINGS, SETTING_NAMES, type ReviewSettings, type SettingTimes } from '../model/types';
import { db } from './db';
import { markDirty } from './dirty';

/** The review settings: the stored record, or the defaults until the first save (spec §4.1). */
export async function getSettings(): Promise<ReviewSettings> {
  const row = await db.settings.get('settings');
  return row ? { newCardsPerDay: row.newCardsPerDay, reverseCards: row.reverseCards } : { ...DEFAULT_SETTINGS };
}

/**
 * Saves a change to the review settings with a new updatedAt (spec §4.2) and marks sync dirty; an unchanged value
 * writes nothing. Only the settings that changed get the new time in `changedAt`, so a merge keeps another device's
 * change to the others (M4 decision 8). `newCardsPerDay` must stay in the range parseFile accepts, or exports would
 * stop importing.
 */
export async function saveSettings(change: Partial<ReviewSettings>): Promise<ReviewSettings> {
  if (change.newCardsPerDay !== undefined && !isNewCardsPerDay(change.newCardsPerDay)) {
    throw new RangeError(`New cards per day must be a whole number from 0 to ${MAX_NEW_CARDS_PER_DAY}.`);
  }
  if (change.reverseCards !== undefined && typeof change.reverseCards !== 'boolean') {
    throw new TypeError('Reverse cards must be on or off.');
  }
  let changed = false;
  const settings = await db.transaction('rw', db.settings, async () => {
    const row = await db.settings.get('settings');
    const current: ReviewSettings = row
      ? { newCardsPerDay: row.newCardsPerDay, reverseCards: row.reverseCards }
      : { ...DEFAULT_SETTINGS };
    // Field by field, so a change that names a field without a value keeps the stored one.
    const next: ReviewSettings = {
      newCardsPerDay: change.newCardsPerDay ?? current.newCardsPerDay,
      reverseCards: change.reverseCards ?? current.reverseCards,
    };
    // Before the first save the defaults count as stored, so saving them creates no record that sync would treat as
    // a newer choice than another device's.
    const names = SETTING_NAMES.filter((name) => next[name] !== current[name]);
    if (names.length === 0) return current;
    // After every time the record holds, or a hand-edited record with a later `changedAt` would win the next merge.
    const changedAt: SettingTimes = row ? { ...settingTimes(row) } : {};
    let latest = row?.updatedAt;
    for (const time of Object.values(changedAt)) if (latest === undefined || time > latest) latest = time;
    const updatedAt = nextTimestamp(latest);
    for (const name of names) changedAt[name] = updatedAt;
    await db.settings.put({ id: 'settings', ...next, updatedAt, changedAt });
    changed = true;
    return next;
  });
  if (changed) markDirty();
  return settings;
}
