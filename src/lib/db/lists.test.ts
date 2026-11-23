import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, resetDb } from './db';
import { createList, deleteList, findOrCreateList, listLiveLists, listNameKey, renameList } from './lists';
import { createWord, draftFromWord, emptyDraft, getWord, updateWord } from './words';
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
  it('treats spacing, Unicode form, zero-width characters and case as the same list name', async () => {
    const list = await findOrCreateList('Kinh tế');
    const variants = ['Kinh  tế', 'Kinh tế'.normalize('NFD'), `Kinh tế${String.fromCodePoint(0x200b)}`, 'KINH TẾ'];
    for (const variant of variants) {
      expect(listNameKey(variant)).toBe(listNameKey('Kinh tế'));
      expect((await findOrCreateList(variant)).id).toBe(list.id);
    }
    expect(await listLiveLists()).toHaveLength(1);
  });

  it('findOrCreateList ignores deleted lists and rejects empty names', async () => {
    const old = await findOrCreateList('Travel');
    await deleteList(old.id);
    const fresh = await findOrCreateList('travel');
    expect(fresh.id).not.toBe(old.id);
    await expect(findOrCreateList('  ')).rejects.toThrow('List name is required');
  });

  it('findOrCreateList reuses a live list with the same name, even under concurrent calls', async () => {
    const a = await findOrCreateList('Economy');
    const b = await findOrCreateList('  economy ');
    expect(b.id).toBe(a.id);
    const [c, d] = await Promise.all([findOrCreateList('News'), findOrCreateList('news')]);
    expect(c.id).toBe(d.id);
    expect((await listLiveLists()).map((l) => l.name)).toEqual(['Economy', 'News']);
  });

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

  it('deleting a list tombstones it and leaves its words as they were (M4 decision 9)', async () => {
    const list = await createList('Economy');
    const w = await createWord({ ...emptyDraft('nhập khẩu'), senses: [{ pos: 'Verb', meaning: 'to import' }], listIds: [list.id] });
    vi.setSystemTime(new Date('2026-01-05T00:00:00.000Z'));
    await deleteList(list.id);
    expect(await listLiveLists()).toEqual([]);
    expect(await db.lists.get(list.id)).toEqual({ id: list.id, updatedAt: '2026-01-05T00:00:00.000Z', deleted: true });
    expect(await getWord(w.id)).toEqual(w);
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

  it("drops a deleted list's id when its word is next saved, and keeps unknown ids", async () => {
    const econ = await createList('Economy');
    const news = await createList('News');
    const word = await createWord({ ...emptyDraft('nhập khẩu'), listIds: [econ.id, 'from-another-device', news.id] });
    await deleteList(econ.id);
    const saved = await updateWord(word.id, draftFromWord(word));
    expect(saved.listIds).toEqual(['from-another-device', news.id]);
    expect((await getWord(word.id))?.listIds).toEqual(['from-another-device', news.id]);
  });

  it('stamps renames 1 ms after a future updatedAt and skips no-op renames', async () => {
    const list = await createList('Econ');
    await db.lists.put({ ...list, updatedAt: '2030-01-01T00:00:00.000Z' });
    await renameList(list.id, 'Economy');
    expect(await db.lists.get(list.id)).toMatchObject({ name: 'Economy', updatedAt: '2030-01-01T00:00:00.001Z' });
    localStorage.clear();
    await renameList(list.id, ' Economy ');
    expect(await db.lists.get(list.id)).toMatchObject({ updatedAt: '2030-01-01T00:00:00.001Z' });
    expect(isDirty()).toBe(false);
    await expect(renameList('missing', 'X')).rejects.toThrow('not found');
  });

  it('marks sync dirty on create, rename and delete', async () => {
    const list = await createList('A');
    expect(isDirty()).toBe(true);
    localStorage.clear();
    await renameList(list.id, 'B');
    expect(isDirty()).toBe(true);
    localStorage.clear();
    await deleteList(list.id);
    expect(isDirty()).toBe(true);
  });
});
