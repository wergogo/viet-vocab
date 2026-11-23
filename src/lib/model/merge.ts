import { SETTING_NAMES, type ISO, type ReviewSettings, type SettingName, type Settings, type SettingTimes } from './types';

interface Stamped {
  id: string;
  updatedAt: ISO;
}

export interface MergeResult<T> {
  /** Union of both sides, newest copy per id, sorted by id. */
  merged: T[];
  /** Merged records that differ from the local copy (write these locally). */
  toApply: T[];
  /** True when the merged set differs from the remote set (upload needed). */
  remoteStale: boolean;
}

/** JSON text with every object's keys in sorted order, so the same content gives the same text in any key order. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

/** Whether two records hold the same content. Copies of a record usually list their keys in the same order, so plain JSON settles most pairs. */
export function sameContent(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b) || canonicalJson(a) === canonicalJson(b);
}

/**
 * Last-write-wins merge by `updatedAt`. Assumes canonical `toISOString()` timestamps (validated by `parseFile`), so
 * string comparison orders them correctly, and unique ids on each side. On equal timestamps the remote copy is kept,
 * and applied locally when its content differs, so both sides end up the same (M4 decision 7).
 */
export function mergeRecords<T extends Stamped>(local: T[], remote: T[]): MergeResult<T> {
  const localById = new Map(local.map((r) => [r.id, r]));
  const remoteById = new Map(remote.map((r) => [r.id, r]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);
  const merged: T[] = [];
  const toApply: T[] = [];
  let remoteStale = false;

  for (const id of ids) {
    const l = localById.get(id);
    const r = remoteById.get(id);
    if (l && r) {
      if (l.updatedAt > r.updatedAt) {
        merged.push(l);
        remoteStale = true;
      } else {
        merged.push(r);
        if (l.updatedAt !== r.updatedAt || !sameContent(l, r)) toApply.push(r);
      }
    } else if (l) {
      merged.push(l);
      remoteStale = true;
    } else if (r) {
      merged.push(r);
      toApply.push(r);
    }
  }

  merged.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { merged, toApply, remoteStale };
}

/** When each setting in the record was last changed; a record from before M4 counts all of them as changed at its `updatedAt`. */
export function settingTimes(settings: Settings): SettingTimes {
  if (settings.changedAt) return settings.changedAt;
  const times: SettingTimes = {};
  for (const name of SETTING_NAMES) times[name] = settings.updatedAt;
  return times;
}

function copySetting<K extends SettingName>(target: ReviewSettings, source: ReviewSettings, name: K): void {
  target[name] = source[name];
}

export interface SettingsMergeResult {
  /** The merged record; undefined when neither side has one. */
  merged: Settings | undefined;
  /** True when the merged record differs from the local one (write it locally). */
  applyLocal: boolean;
  /** True when the merged record differs from the remote one (upload needed). */
  remoteStale: boolean;
}

/**
 * Merges the settings record setting by setting (M4 decision 8): each takes the value that was changed last, the
 * remote one on a tie, so two devices that each changed a different setting keep both changes.
 */
export function mergeSettings(local: Settings | undefined, remote: Settings | undefined): SettingsMergeResult {
  if (!local || !remote) return { merged: local ?? remote, applyLocal: !local && !!remote, remoteStale: !!local && !remote };
  const localTimes = settingTimes(local);
  const remoteTimes = settingTimes(remote);
  const values: ReviewSettings = { newCardsPerDay: remote.newCardsPerDay, reverseCards: remote.reverseCards };
  const changedAt: SettingTimes = {};
  for (const name of SETTING_NAMES) {
    const l = localTimes[name];
    const r = remoteTimes[name];
    const fromLocal = l !== undefined && (r === undefined || l > r);
    if (fromLocal) copySetting(values, local, name);
    const time = fromLocal ? l : r;
    if (time !== undefined) changedAt[name] = time;
  }
  const updatedAt = local.updatedAt > remote.updatedAt ? local.updatedAt : remote.updatedAt;
  const merged: Settings = { ...values, updatedAt, changedAt };
  return { merged, applyLocal: !sameContent(merged, local), remoteStale: !sameContent(merged, remote) };
}
