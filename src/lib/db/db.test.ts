import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from './db';

describe('VocabDB', () => {
  beforeEach(resetDb);

  it('has the expected tables', async () => {
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual(['cards', 'lists', 'lookupCache', 'settings', 'words']);
  });

  it('resetDb clears every table', async () => {
    await db.lists.put({ id: 'l1', name: 'A', createdAt: 't', updatedAt: 't' });
    await resetDb();
    expect(await db.lists.count()).toBe(0);
  });
});
