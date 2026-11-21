import type { ISO } from './types';

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
    let winner: T;
    if (l && r) winner = l.updatedAt > r.updatedAt ? l : r;
    else winner = (l ?? r) as T;
    merged.push(winner);
    if (!l || l.updatedAt !== winner.updatedAt) toApply.push(winner);
    if (!r || r.updatedAt !== winner.updatedAt) remoteStale = true;
  }

  merged.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { merged, toApply, remoteStale };
}

export interface SingleMergeResult<T> {
  winner: T | undefined;
  applyLocal: boolean;
  remoteStale: boolean;
}

/** Same rule for a single record (the settings record). */
export function mergeSingle<T extends { updatedAt: ISO }>(local: T | undefined, remote: T | undefined): SingleMergeResult<T> {
  if (!local && !remote) return { winner: undefined, applyLocal: false, remoteStale: false };
  if (!remote) return { winner: local, applyLocal: false, remoteStale: true };
  if (!local) return { winner: remote, applyLocal: true, remoteStale: false };
  if (local.updatedAt > remote.updatedAt) return { winner: local, applyLocal: false, remoteStale: true };
  return { winner: remote, applyLocal: remote.updatedAt !== local.updatedAt, remoteStale: false };
}
