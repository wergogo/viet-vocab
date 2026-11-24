import { clearDirty, dirtySeq, isDirty } from '../db/dirty';
import { countLocalRecords, mergeIntoLocal } from '../db/snapshot';
import { FileFormatError, NewerSchemaError, parseFile, serializeFile, type VocabData, type VocabFile } from '../model/file';
import { isLive } from '../model/types';
import { fileKey, lastSync, type SyncConfig } from './config';
import { SyncError } from './errors';
import { GitHubFiles, type FetchFn } from './github';

/** Pull, merge and push at most this many times when the file keeps changing in between (spec §7.3). */
export const MAX_ATTEMPTS = 3;

export interface CycleOptions {
  fetchFn?: FetchFn;
  now?: () => Date;
}

export interface CycleResult {
  /** Records written on this device. */
  applied: number;
  /** Whether this device uploaded the file. */
  pushed: boolean;
}

const NOTHING: VocabData = { words: [], lists: [], cards: [] };

/** Reads the pulled file. One from a newer app version, or one this app can't read, stops sync (M4 decision 5). */
function readRemote(text: string, config: SyncConfig): VocabFile {
  try {
    return parseFile(text);
  } catch (e) {
    if (e instanceof NewerSchemaError) {
      // A plain reload keeps the old version while it controls the page: the update bar's Reload switches (spec §10).
      throw new SyncError(
        'newer-schema',
        'The synced data was saved by a newer version of the app. Update this one: press Reload on its “A new version is ready” bar, or if there is none, close all of its windows and open it again.',
      );
    }
    if (e instanceof FileFormatError) {
      throw new SyncError(
        'bad-file',
        `${config.path} in ${config.owner}/${config.repo} can't be read, so it isn't overwritten: ${e.message}`,
      );
    }
    throw e;
  }
}

/**
 * Every device must be able to read what is uploaded, so data this app can't read back never leaves (M4 decision 5).
 * Retrying can't fix that record, so sync stops until it is edited or deleted.
 */
function checkUpload(text: string): void {
  try {
    parseFile(text);
  } catch (e) {
    if (e instanceof FileFormatError) {
      throw new SyncError(
        'bad-local-data',
        `A record on this device can't be synced: ${e.message} Edit or delete it, then press Sync now.`,
      );
    }
    throw e;
  }
}

/** The blob sha needs crypto.subtle, which browsers offer only on secure pages: https, or localhost. */
function requireSecurePage(): void {
  if (!globalThis.crypto?.subtle) {
    throw new SyncError('insecure-page', "Sync works only on a secure page (https, or localhost). Open the app's https address.");
  }
}

const recordCount = (data: VocabData) => data.words.length + data.lists.length + data.cards.length;

/**
 * One sync cycle (spec §7.3): pull the file, merge it into this device's data, and push the merged data when the file
 * lacks some of it. Rejects with a SyncError, or with the database's error when this device's storage fails.
 */
export async function runSyncCycle(
  config: SyncConfig,
  { fetchFn, now = () => new Date() }: CycleOptions = {},
): Promise<CycleResult> {
  requireSecurePage();
  const github = new GitHubFiles(config, fetchFn);
  const key = fileKey(config);
  let last = lastSync.get();
  if (last?.key !== key) {
    await github.checkRepository();
    last = null;
  }
  // Ask only whether the file changed when nothing here waits to go up and none of the data the last sync left is
  // missing: an unchanged file then means there is nothing to do (M4 decision 2).
  let knownSha = last && !isDirty() && (await countLocalRecords()) >= last.records ? last.sha : undefined;
  for (let attempt = 1; ; attempt++) {
    const seen = dirtySeq();
    const pulled = await github.pull(knownSha);
    if (pulled.status === 'unchanged') {
      if (last) lastSync.set({ ...last, at: now().toISOString() });
      return { applied: 0, pushed: false };
    }
    const outcome = await mergeIntoLocal(pulled.status === 'found' ? readRemote(pulled.text, config) : NOTHING);
    let sha: string;
    let pushed = false;
    if (pulled.status === 'found' && !outcome.remoteStale) {
      sha = pulled.sha;
    } else {
      const time = now().toISOString();
      const text = serializeFile(outcome.merged, time);
      checkUpload(text);
      try {
        sha = await github.push(text, pulled.status === 'found' ? pulled.sha : null, `sync ${time}`);
        pushed = true;
      } catch (e) {
        if (!(e instanceof SyncError) || e.kind !== 'conflict') throw e;
        if (attempt === MAX_ATTEMPTS) {
          throw new SyncError('conflict', `${config.path} kept changing on GitHub during the sync.`);
        }
        knownSha = undefined;
        continue;
      }
    }
    lastSync.set({ key, sha, records: recordCount(outcome.merged), at: now().toISOString() });
    // An edit made during the cycle keeps the flag set, so another cycle picks it up (spec §7.3 step 6).
    clearDirty(seen);
    return { applied: outcome.applied, pushed };
  }
}

/** For Test connection: checks the repository, and counts the words in the file (null while there is no file). */
export async function checkConnection(config: SyncConfig, { fetchFn }: CycleOptions = {}): Promise<{ words: number | null }> {
  requireSecurePage();
  const github = new GitHubFiles(config, fetchFn);
  await github.checkRepository();
  const pulled = await github.pull();
  if (pulled.status !== 'found') return { words: null };
  return { words: readRemote(pulled.text, config).words.filter(isLive).length };
}
