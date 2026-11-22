import { db } from '../db/db';

/** Parsed lookups are kept this long (spec §4.3). */
export const CACHE_DAYS = 30;
const DAY_MS = 86_400_000;

function expired(fetchedAt: string, now: number): boolean {
  const time = Date.parse(fetchedAt);
  // An entry dated more than a day ahead (stored while the clock ran fast) would otherwise never expire.
  return Number.isNaN(time) || time - now > DAY_MS || now - time > CACHE_DAYS * DAY_MS;
}

/** The cached value, or undefined when it is missing or older than 30 days. */
export async function readCache<T>(key: string, now = Date.now()): Promise<T | undefined> {
  const row = await db.lookupCache.get(key);
  if (!row) return undefined;
  if (expired(row.fetchedAt, now)) {
    await db.lookupCache.delete(key);
    return undefined;
  }
  return row.data as T;
}

/** Stores the same value under every key (a word is cached under its spelling and under the page title). */
export async function writeCache(keys: readonly string[], data: unknown, fetchedAt: string): Promise<void> {
  await db.lookupCache.bulkPut([...new Set(keys)].map((title) => ({ title, fetchedAt, data })));
}

/** Deletes every entry older than 30 days; returns how many. */
export async function purgeExpiredCache(now = Date.now()): Promise<number> {
  const cutoff = new Date(now - CACHE_DAYS * DAY_MS).toISOString();
  return db.lookupCache.where('fetchedAt').below(cutoff).delete();
}
