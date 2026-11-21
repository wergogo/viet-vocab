import type { List, Rec, ReviewCard, Settings, Word } from './types';

export const APP_ID = 'viet-vocab';
export const SCHEMA_VERSION = 1;

export interface VocabData {
  words: Rec<Word>[];
  lists: Rec<List>[];
  cards: Rec<ReviewCard>[];
  settings?: Settings;
}

export interface VocabFile extends VocabData {
  app: typeof APP_ID;
  schemaVersion: number;
  savedAt: string;
}

export class FileFormatError extends Error {
  override name = 'FileFormatError';
}

export class NewerSchemaError extends Error {
  override name = 'NewerSchemaError';
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

const CANONICAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

/** True for timestamps exactly as `Date.prototype.toISOString()` writes them. */
function isCanonicalIso(value: unknown): value is string {
  if (typeof value !== 'string' || !CANONICAL_ISO.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

export function serializeFile(data: VocabData, savedAt: string): string {
  const file: VocabFile = {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    savedAt,
    words: [...data.words].sort(byId),
    lists: [...data.lists].sort(byId),
    cards: [...data.cards].sort(byId),
    ...(data.settings ? { settings: data.settings } : {}),
  };
  return JSON.stringify(file, null, 2) + '\n';
}

export function parseFile(text: string): VocabFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new FileFormatError('This file is not valid JSON.');
  }
  if (typeof raw !== 'object' || raw === null) throw new FileFormatError('This is not a Viet Vocab file.');
  const file = raw as Partial<VocabFile>;
  if (file.app !== APP_ID) throw new FileFormatError('This is not a Viet Vocab file.');
  if (typeof file.schemaVersion !== 'number') throw new FileFormatError('The file has no schemaVersion.');
  if (file.schemaVersion > SCHEMA_VERSION) {
    throw new NewerSchemaError(
      `This data was saved by a newer version of the app (format ${file.schemaVersion}). Reload the page to update.`,
    );
  }
  for (const key of ['words', 'lists', 'cards'] as const) {
    const records: unknown = file[key];
    if (!Array.isArray(records)) throw new FileFormatError(`The file has no "${key}" list.`);
    const seen = new Set<string>();
    for (const record of records) {
      const r = record as { id?: unknown; updatedAt?: unknown } | null;
      if (typeof r?.id !== 'string' || !isCanonicalIso(r.updatedAt)) {
        throw new FileFormatError(`A record in "${key}" is missing its id or has an invalid updatedAt.`);
      }
      if (seen.has(r.id)) throw new FileFormatError(`"${key}" contains the id ${r.id} twice.`);
      seen.add(r.id);
    }
  }
  if (file.settings !== undefined) {
    const s = file.settings as Partial<Settings> | null;
    if (typeof s?.newCardsPerDay !== 'number' || typeof s?.reverseCards !== 'boolean' || !isCanonicalIso(s.updatedAt)) {
      throw new FileFormatError('The settings record is invalid.');
    }
  }
  return file as VocabFile;
}
