import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from '../db/db';
import { CACHE_DAYS, purgeExpiredCache, readCache, writeCache } from './cache';

const DAY = 86_400_000;

beforeEach(async () => {
  await resetDb();
});

describe('lookup cache', () => {
  it('stores one value under several keys', async () => {
    await writeCache(['w:văn hóa', 'w:văn hoá', 'w:văn hoá'], { n: 1 }, '2026-11-01T00:00:00.000Z');
    expect(await db.lookupCache.count()).toBe(2);
    expect(await readCache('w:văn hoá', Date.parse('2026-11-02T00:00:00.000Z'))).toEqual({ n: 1 });
  });

  it('drops an entry older than 30 days when it is read', async () => {
    const t = '2026-11-01T00:00:00.000Z';
    await writeCache(['k'], 1, t);
    expect(await readCache('k', Date.parse(t) + CACHE_DAYS * DAY)).toBe(1);
    expect(await readCache('k', Date.parse(t) + CACHE_DAYS * DAY + 1)).toBeUndefined();
    expect(await db.lookupCache.get('k')).toBeUndefined();
  });

  it('drops an entry dated more than a day ahead, stored while the clock ran fast', async () => {
    const now = Date.parse('2026-11-21T00:00:00.000Z');
    await writeCache(['soon'], 1, new Date(now + DAY / 2).toISOString());
    await writeCache(['future'], 2, '2030-01-01T00:00:00.000Z');
    expect(await readCache('soon', now)).toBe(1);
    expect(await readCache('future', now)).toBeUndefined();
  });

  it('purges every expired entry', async () => {
    await writeCache(['old'], 1, '2026-01-01T00:00:00.000Z');
    await writeCache(['new'], 2, '2026-11-20T00:00:00.000Z');
    expect(await purgeExpiredCache(Date.parse('2026-11-21T00:00:00.000Z'))).toBe(1);
    expect(await db.lookupCache.toCollection().primaryKeys()).toEqual(['new']);
  });
});
