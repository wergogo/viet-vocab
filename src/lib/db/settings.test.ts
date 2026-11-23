import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, resetDb } from './db';
import { dirtySeq } from './dirty';
import { mergeSettings } from '../model/merge';
import { getSettings, saveSettings } from './settings';

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-22T08:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('review settings', () => {
  it('reads the defaults until the first save (spec §2: 20 new cards a day, reverse cards off)', async () => {
    expect(await getSettings()).toEqual({ newCardsPerDay: 20, reverseCards: false });
    expect(await db.settings.count()).toBe(0);
  });

  it('saves a change with a new updatedAt and marks sync dirty', async () => {
    expect(await saveSettings({ newCardsPerDay: 5 })).toEqual({ newCardsPerDay: 5, reverseCards: false });
    expect(await db.settings.get('settings')).toEqual({
      id: 'settings',
      newCardsPerDay: 5,
      reverseCards: false,
      updatedAt: '2026-11-22T08:00:00.000Z',
      changedAt: { newCardsPerDay: '2026-11-22T08:00:00.000Z' },
    });
    const before = dirtySeq();
    await saveSettings({ reverseCards: true });
    expect(await getSettings()).toEqual({ newCardsPerDay: 5, reverseCards: true });
    expect(await db.settings.get('settings')).toMatchObject({
      updatedAt: '2026-11-22T08:00:00.001Z',
      changedAt: { newCardsPerDay: '2026-11-22T08:00:00.000Z', reverseCards: '2026-11-22T08:00:00.001Z' },
    });
    expect(dirtySeq()).toBe(before + 1);
  });

  it('stamps only the settings that changed, counting a record from before M4 as changed at its updatedAt', async () => {
    const before = '2026-11-01T00:00:00.000Z';
    await db.settings.put({ id: 'settings', newCardsPerDay: 5, reverseCards: false, updatedAt: before });
    await saveSettings({ newCardsPerDay: 5, reverseCards: true });
    expect(await db.settings.get('settings')).toEqual({
      id: 'settings',
      newCardsPerDay: 5,
      reverseCards: true,
      updatedAt: '2026-11-22T08:00:00.000Z',
      changedAt: { newCardsPerDay: before, reverseCards: '2026-11-22T08:00:00.000Z' },
    });
  });

  it('writes nothing when the value is unchanged, the defaults included before the first save', async () => {
    const first = dirtySeq();
    expect(await saveSettings({ newCardsPerDay: 20, reverseCards: false })).toEqual({ newCardsPerDay: 20, reverseCards: false });
    expect(await db.settings.count()).toBe(0);
    expect(dirtySeq()).toBe(first);
    await saveSettings({ newCardsPerDay: 5 });
    const before = dirtySeq();
    await saveSettings({ newCardsPerDay: 5 });
    expect(dirtySeq()).toBe(before);
  });

  it('keeps newCardsPerDay a whole number from 0 to 1000, the range parseFile accepts', async () => {
    for (const bad of [-1, 2.5, 1001, Number.NaN]) {
      await expect(saveSettings({ newCardsPerDay: bad })).rejects.toThrow('whole number from 0 to 1000');
    }
    expect(await saveSettings({ newCardsPerDay: 0 })).toMatchObject({ newCardsPerDay: 0 });
    expect(await saveSettings({ newCardsPerDay: 1000 })).toMatchObject({ newCardsPerDay: 1000 });
  });

  it('keeps a setting a change names without a value, and refuses reverse cards other than on or off', async () => {
    await saveSettings({ newCardsPerDay: 7 });
    expect(await saveSettings({ newCardsPerDay: undefined, reverseCards: true })).toEqual({
      newCardsPerDay: 7,
      reverseCards: true,
    });
    await expect(saveSettings({ reverseCards: 'yes' as unknown as boolean })).rejects.toThrow(TypeError);
    expect(await getSettings()).toEqual({ newCardsPerDay: 7, reverseCards: true });
  });

  it('stamps a change after the latest time the record holds, so it wins the next merge', async () => {
    const original = {
      id: 'settings' as const,
      newCardsPerDay: 30,
      reverseCards: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
      changedAt: { newCardsPerDay: '2027-01-01T00:00:00.000Z', reverseCards: '2026-01-01T00:00:00.000Z' },
    };
    await db.settings.put(original);
    await saveSettings({ newCardsPerDay: 10 });
    const stored = await db.settings.get('settings');
    expect(stored!.changedAt!.newCardsPerDay! > '2027-01-01T00:00:00.000Z').toBe(true);
    expect(mergeSettings(stored, original).merged!.newCardsPerDay).toBe(10);
  });
});
