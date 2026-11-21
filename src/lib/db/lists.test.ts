import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, resetDb } from './db';
import { createList, deleteList, listLiveLists, renameList } from './lists';
import { createWord, emptyDraft, getWord } from './words';
import { expectDerivedFieldsFresh } from './test-utils';
import { isDirty } from './dirty';

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

afterEach(expectDerivedFieldsFresh);

describe('lists', () => {
  it('creates lists and returns them in Vietnamese order', async () => {
    await createList('Đồ ăn');
    await createList('  Du   lịch ');
    expect((await listLiveLists()).map((l) => l.name)).toEqual(['Du lịch', 'Đồ ăn']);
  });

  it('rejects empty names', async () => {
    await expect(createList('   ')).rejects.toThrow('List name is required');
  });

  it('renames a list and bumps updatedAt', async () => {
    const list = await createList('Econ');
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    await renameList(list.id, 'Economy');
    expect(await db.lists.get(list.id)).toMatchObject({ name: 'Economy', updatedAt: '2026-01-02T00:00:00.000Z' });
  });

  it('deleting a list tombstones it and removes it from words', async () => {
    const list = await createList('Economy');
    const w = await createWord({ ...emptyDraft('nhập khẩu'), senses: [{ pos: 'Verb', meaning: 'to import' }], listIds: [list.id] });
    vi.setSystemTime(new Date('2026-01-05T00:00:00.000Z'));
    await deleteList(list.id);
    expect(await listLiveLists()).toEqual([]);
    expect(await db.lists.get(list.id)).toEqual({ id: list.id, updatedAt: '2026-01-05T00:00:00.000Z', deleted: true });
    const updated = await getWord(w.id);
    expect(updated?.listIds).toEqual([]);
    expect(updated?.updatedAt).toBe('2026-01-05T00:00:00.000Z');
  });

  it('refuses to rename a deleted list and ignores a second delete', async () => {
    const list = await createList('Economy');
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    await deleteList(list.id);
    await expect(renameList(list.id, 'Other')).rejects.toThrow('not found');
    localStorage.clear();
    vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
    await deleteList(list.id);
    expect(await db.lists.get(list.id)).toEqual({ id: list.id, updatedAt: '2026-01-02T00:00:00.000Z', deleted: true });
    expect(isDirty()).toBe(false);
  });
});
