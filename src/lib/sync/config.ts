import { deviceSetting } from '../db/deviceSetting';
import type { ISO } from '../model/types';

/**
 * GitHub's REST API. Browser checks point it at a local stand-in with `VITE_GITHUB_API`, in fake-sync mode only (M4
 * decision 17), so a stray variable in a production build can't send tokens elsewhere.
 */
export const GITHUB_API: string =
  (import.meta.env.MODE === 'fake-sync' && import.meta.env.VITE_GITHUB_API) || 'https://api.github.com';

/** Where this device syncs, and the token (spec §7.1). Kept in this browser's localStorage only. */
export interface SyncConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
}

/** The suggested repository name and the default branch and file (spec §5.6, §7.1). */
export const SYNC_DEFAULTS = { repo: 'viet-vocab-data', branch: 'main', path: 'vocab.json' } as const;

/** What the last successful sync left (spec §4.3 sync bookkeeping, M4 decision 3). */
export interface LastSync {
  /** The repository, branch and file it synced with (`fileKey`). */
  key: string;
  /** The file's git blob sha after it. */
  sha: string;
  /** How many word, list and card records the file held, tombstones included. */
  records: number;
  /** When it finished. */
  at: ISO;
}

export type ConfigField = keyof SyncConfig;
export type ConfigProblems = Partial<Record<ConfigField, string>>;

/** The form's text with surrounding spaces trimmed, and the slip-ups GitHub's own forms allow: a leading slash, `.git`. */
export function cleanConfig(form: SyncConfig): SyncConfig {
  return {
    owner: form.owner.trim().replace(/^@/, ''),
    repo: form.repo.trim().replace(/\.git$/i, ''),
    branch: form.branch.trim(),
    path: form.path.trim().replace(/^\/+/, ''),
    token: form.token.trim(),
  };
}

/** GitHub user and organization names: letters, digits and single hyphens between them, up to 39 characters. */
const OWNER = /^[A-Za-z\d](?:[A-Za-z\d]|-(?=[A-Za-z\d])){0,38}$/;
const REPO = /^[A-Za-z\d._-]{1,100}$/;

/** git's rules for branch names (check-ref-format), less the rare ones GitHub reports itself. */
function isBranchName(name: string): boolean {
  return (
    name !== '' &&
    name !== '@' &&
    !/[\s~^:?*[\\]|\.\.|@\{|\/\/|^[-/]|[/.]$|\.lock$/.test(name) &&
    !name.split('/').some((part) => part.startsWith('.'))
  );
}

function isFilePath(path: string): boolean {
  return path !== '' && !path.includes('\\') && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/** What is wrong with each field of a cleaned config; empty when nothing is. */
export function configProblems(c: SyncConfig): ConfigProblems {
  const problems: ConfigProblems = {};
  if (!OWNER.test(c.owner)) problems.owner = 'Enter the GitHub user name that owns the repository.';
  if (!REPO.test(c.repo) || c.repo === '.' || c.repo === '..') {
    problems.repo = 'Enter the repository name: letters, digits, hyphens, underscores and dots.';
  }
  if (!isBranchName(c.branch)) problems.branch = 'Enter a branch name, such as main.';
  if (!isFilePath(c.path)) problems.path = "Enter the file's path in the repository, such as vocab.json.";
  // Printable ASCII only: fetch throws on any other character in the Authorization header, and that would show as a
  // network error for good.
  if (c.token === '') problems.token = 'Paste the token from GitHub.';
  else if (!/^[!-~]+$/.test(c.token)) {
    problems.token = "The token has a character GitHub tokens don't have. Paste it again from GitHub.";
  }
  return problems;
}

/** A classic token reaches every repository of the account; a fine-grained one can be limited to the data repository. */
export function isClassicToken(token: string): boolean {
  return /^(?:ghp_|gho_|ghu_)/.test(token) || /^[0-9a-f]{40}$/.test(token);
}

/**
 * Names the file a sync went to, and the API it went through, so a stand-in's record never matches GitHub's. GitHub
 * matches owner and repository names in any case, but not branches or paths.
 */
export function fileKey(c: Pick<SyncConfig, 'owner' | 'repo' | 'branch' | 'path'>): string {
  return `${GITHUB_API} ${c.owner.toLowerCase()}/${c.repo.toLowerCase()}@${c.branch}:${c.path}`;
}

function readJson(text: string | null): Record<string, unknown> | null {
  if (text === null) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const isText = (v: unknown): v is string => typeof v === 'string';

function toConfig(text: string | null): SyncConfig | null {
  const v = readJson(text);
  if (!v || !isText(v.owner) || !isText(v.repo) || !isText(v.branch) || !isText(v.path) || !isText(v.token)) return null;
  return { owner: v.owner, repo: v.repo, branch: v.branch, path: v.path, token: v.token };
}

function toLastSync(text: string | null): LastSync | null {
  const v = readJson(text);
  if (!v || !isText(v.key) || !isText(v.sha) || !isText(v.at) || !Number.isFinite(Date.parse(v.at))) return null;
  if (typeof v.records !== 'number' || !Number.isInteger(v.records) || v.records < 0) return null;
  return { key: v.key, sha: v.sha, records: v.records, at: v.at };
}

const toText = (value: object | null) => (value === null ? null : JSON.stringify(value));

/** The sync settings on this device, or null when sync isn't set up here. */
export const syncConfig = deviceSetting<SyncConfig | null>('vv.sync.config', toConfig, toText);

/** What the last successful sync left, or null before the first one with the current settings. */
export const lastSync = deviceSetting<LastSync | null>('vv.sync.last', toLastSync, toText);
