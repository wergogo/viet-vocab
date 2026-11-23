import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, resetDb } from '../db/db';
import { toRow } from '../db/derive';
import { isDirty } from '../db/dirty';
import { createWord, deleteWord, emptyDraft, getWord, listLiveWords } from '../db/words';
import { parseFile, SCHEMA_VERSION, serializeFile } from '../model/file';
import { tombstone, type Rec, type Word } from '../model/types';
import { fileKey, lastSync } from './config';
import { checkConnection, runSyncCycle } from './cycle';
import type { FetchFn } from './github';
import { fakeGitHub, TEST_CONFIG, type FakeGitHub } from './test-helpers';

const T1 = '2026-11-01T00:00:00.000Z';
const NOW = new Date('2026-11-22T08:00:00.000Z');
const otherWord: Word = {
  id: 'w-other',
  word: 'quốc gia',
  syllables: [{ text: 'quốc', char: '國' }, { text: 'gia', char: '家' }],
  senses: [{ pos: 'Noun', meaning: 'nation' }],
  listIds: [],
  createdAt: T1,
  updatedAt: T1,
};

let github: FakeGitHub;
const sync = (config = TEST_CONFIG, now = NOW) => runSyncCycle(config, { fetchFn: github.fetch, now: () => now });
const remoteFile = () => parseFile(github.text() ?? '');
/** The file another device's sync would have stored. */
const fileWith = (words: Rec<Word>[], savedAt = T1) => serializeFile({ words, lists: [], cards: [] }, savedAt);

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
  github = fakeGitHub();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runSyncCycle', () => {
  it('checks the repository, then creates the file on the first sync', async () => {
    const word = await createWord(emptyDraft('nhập khẩu'));
    expect(await sync()).toEqual({ applied: 0, pushed: true });
    expect(github.log).toEqual(['GET repo 200', 'GET branch 200', 'GET file 404', 'PUT file 201']);
    expect(remoteFile()).toMatchObject({ savedAt: NOW.toISOString(), words: [word] });
    expect(lastSync.get()).toEqual({
      key: fileKey(TEST_CONFIG),
      sha: expect.stringMatching(/^[\da-f]{40}$/),
      records: 1,
      at: NOW.toISOString(),
    });
    expect(isDirty()).toBe(false);
  });

  it('brings in words from the file and uploads the ones it lacks', async () => {
    await github.store(fileWith([otherWord]));
    const mine = await createWord(emptyDraft('nhập khẩu'));
    expect(await sync()).toEqual({ applied: 1, pushed: true });
    expect(await getWord(otherWord.id)).toEqual(otherWord);
    expect(remoteFile().words.map((w) => w.id).sort()).toEqual([mine.id, otherWord.id].sort());
  });

  it('uploads nothing when the file already has everything', async () => {
    await github.store(fileWith([otherWord]));
    expect(await sync()).toEqual({ applied: 1, pushed: false });
    expect(github.log.at(-1)).toBe('GET file 200');
    expect(lastSync.get()?.records).toBe(1);
  });

  it('then only asks whether the file changed, while nothing here waits to go up (M4 decision 2)', async () => {
    await github.store(fileWith([otherWord]));
    await sync();
    github.log.length = 0;
    const later = new Date('2026-11-22T09:00:00.000Z');
    expect(await sync(TEST_CONFIG, later)).toEqual({ applied: 0, pushed: false });
    expect(github.log).toEqual(['GET file 304']);
    expect(lastSync.get()?.at).toBe(later.toISOString());
  });

  it('downloads the whole file when local changes wait, or when local data was cleared', async () => {
    await github.store(fileWith([otherWord]));
    await sync();
    github.log.length = 0;
    await createWord(emptyDraft('nhập khẩu'));
    await sync();
    expect(github.log).toEqual(['GET file 200', 'PUT file 200']);
    github.log.length = 0;
    await resetDb(); // The browser cleared the database but kept localStorage.
    expect(await sync()).toEqual({ applied: 2, pushed: false });
    expect(github.log).toEqual(['GET file 200']);
    expect(await listLiveWords()).toHaveLength(2);
  });

  it('pulls, merges and pushes again when the file changes during the sync (spec §7.3)', async () => {
    await github.store(fileWith([]));
    await createWord(emptyDraft('nhập khẩu'));
    let others = 0;
    github.beforePut = async () => {
      // Another device syncs once, between this device's pull and push.
      if (others++ === 0) await github.store(fileWith([otherWord]));
    };
    expect(await sync()).toMatchObject({ pushed: true });
    expect(github.log).toEqual(['GET repo 200', 'GET branch 200', 'GET file 200', 'PUT file 409', 'GET file 200', 'PUT file 200']);
    expect(remoteFile().words).toHaveLength(2);
    expect(await getWord(otherWord.id)).toEqual(otherWord);
  });

  it('gives up after three attempts, keeping the changes waiting', async () => {
    await createWord(emptyDraft('nhập khẩu'));
    let others = 0;
    github.beforePut = () => github.store(fileWith([otherWord], new Date(Date.UTC(2026, 10, ++others)).toISOString()));
    await expect(sync()).rejects.toMatchObject({ kind: 'conflict', message: expect.stringContaining('kept changing') });
    expect(github.log.filter((entry) => entry.startsWith('PUT'))).toEqual(['PUT file 422', 'PUT file 409', 'PUT file 409']);
    expect(isDirty()).toBe(true);
  });

  it('keeps the changes waiting when this device changes something during the sync', async () => {
    await createWord(emptyDraft('nhập khẩu'));
    github.beforePut = async () => {
      await createWord(emptyDraft('quốc gia'));
    };
    await sync();
    expect(isDirty()).toBe(true);
    github.beforePut = null;
    await sync();
    expect(remoteFile().words).toHaveLength(2);
    expect(isDirty()).toBe(false);
  });

  it('keeps the changes waiting when the push fails after the merge, and pushes them on the next sync', async () => {
    await sync();
    const last = lastSync.get();
    await createWord(emptyDraft('nhập khẩu'));
    // The pull and the merge go well; the upload gets a server error.
    const failingPut: FetchFn = (url, init) => {
      if (init?.method === 'PUT') github.failNext(503);
      return github.fetch(url, init);
    };
    await expect(runSyncCycle(TEST_CONFIG, { fetchFn: failingPut, now: () => NOW })).rejects.toMatchObject({ kind: 'server' });
    expect(isDirty()).toBe(true);
    expect(lastSync.get()).toEqual(last);
    expect(remoteFile().words).toHaveLength(0);
    await sync();
    expect(remoteFile().words).toHaveLength(1);
    expect(isDirty()).toBe(false);
  });

  it('carries a deletion to the file', async () => {
    const word = await createWord(emptyDraft('nhập khẩu'));
    await sync();
    await deleteWord(word.id);
    await sync();
    expect(remoteFile().words).toEqual([{ id: word.id, updatedAt: expect.any(String), deleted: true }]);
  });

  it('stops on a file from a newer version of the app, and writes nothing', async () => {
    const newer = { app: 'viet-vocab', schemaVersion: SCHEMA_VERSION + 1, savedAt: T1, words: [otherWord], lists: [], cards: [] };
    await github.store(JSON.stringify(newer));
    await createWord(emptyDraft('nhập khẩu'));
    await expect(sync()).rejects.toMatchObject({ kind: 'newer-schema' });
    expect(await getWord(otherWord.id)).toBeUndefined();
    expect(github.log.some((entry) => entry.startsWith('PUT'))).toBe(false);
  });

  it("never overwrites a file it can't read", async () => {
    await github.store('{ not json');
    await expect(sync()).rejects.toMatchObject({ kind: 'bad-file', message: expect.stringContaining("isn't overwritten") });
    expect(github.text()).toBe('{ not json');
  });

  it("never uploads data other devices couldn't read, and says which record", async () => {
    await db.words.put(toRow({ ...otherWord, source: { wiktionaryTitle: 'quốc gia', fetchedAt: 'yesterday' } }));
    await expect(sync()).rejects.toMatchObject({ kind: 'bad-local-data', message: expect.stringContaining('w-other') });
    expect(github.log.some((entry) => entry.startsWith('PUT'))).toBe(false);
  });

  it("stops before any request on a page that isn't secure, where the sha can't be computed", async () => {
    vi.stubGlobal('crypto', {});
    await expect(sync()).rejects.toMatchObject({ kind: 'insecure-page' });
    await expect(checkConnection(TEST_CONFIG, { fetchFn: github.fetch })).rejects.toMatchObject({ kind: 'insecure-page' });
    expect(github.log).toEqual([]);
  });

  it('refuses a public repository before touching the file (M4 decision 4)', async () => {
    github.isPrivate = false;
    await expect(sync()).rejects.toMatchObject({ kind: 'public-repo' });
    expect(github.log).toEqual(['GET repo 200']);
  });

  it('checks the repository again when the settings name another file', async () => {
    await sync();
    github.log.length = 0;
    const other = { ...TEST_CONFIG, path: 'other.json' };
    await sync(other);
    expect(github.log.slice(0, 2)).toEqual(['GET repo 200', 'GET branch 200']);
    expect(lastSync.get()?.key).toBe(fileKey(other));
  });

  it('reports a refused token', async () => {
    await expect(sync({ ...TEST_CONFIG, token: 'wrong' })).rejects.toMatchObject({ kind: 'auth' });
  });
});

describe('checkConnection', () => {
  it('counts the words in the file, or says there is none yet', async () => {
    expect(await checkConnection(TEST_CONFIG, { fetchFn: github.fetch })).toEqual({ words: null });
    await github.store(fileWith([otherWord, tombstone('gone', T1)]));
    expect(await checkConnection(TEST_CONFIG, { fetchFn: github.fetch })).toEqual({ words: 1 });
    expect(github.log.some((entry) => entry.startsWith('PUT'))).toBe(false);
  });
});
