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

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

type Collection = 'words' | 'lists' | 'cards';

const LABELS: Record<Collection, string> = { words: 'Word', lists: 'List', cards: 'Review card' };

/** Problems with the fields the app reads from live (non-deleted) records, or null when fine. */
const LIVE_CHECKS: Record<Collection, (r: Record<string, unknown>) => string | null> = {
  words: (r) =>
    !isString(r.word)
      ? 'has no word text'
      : !Array.isArray(r.syllables)
        ? 'has no syllables list'
        : !Array.isArray(r.senses)
          ? 'has no meanings list'
          : !Array.isArray(r.listIds)
            ? 'has no list ids'
            : null,
  lists: (r) => (isString(r.name) ? null : 'has no name'),
  cards: (r) =>
    !isString(r.wordId)
      ? 'has no word id'
      : r.direction !== 'forward' && r.direction !== 'reverse'
        ? 'has an unknown direction'
        : typeof r.fsrs !== 'object' || r.fsrs === null
          ? 'has no review state'
          : !isCanonicalIso(r.introducedAt)
            ? 'has an invalid introducedAt'
            : null,
};

function validateRecords(key: Collection, records: unknown[]): void {
  const seen = new Set<string>();
  records.forEach((record, index) => {
    const where = `${LABELS[key]} #${index + 1}`;
    if (typeof record !== 'object' || record === null || Array.isArray(record)) {
      throw new FileFormatError(`${where} is not a record.`);
    }
    const r = record as Record<string, unknown>;
    const id = r.id;
    if (!isString(id)) throw new FileFormatError(`${where} has no id.`);
    if (!isCanonicalIso(r.updatedAt)) throw new FileFormatError(`${where} (id ${id}) has an invalid updatedAt.`);
    if (seen.has(id)) throw new FileFormatError(`"${key}" contains the id ${id} twice.`);
    seen.add(id);
    if (r.deleted !== undefined && r.deleted !== true) {
      throw new FileFormatError(`${where} (id ${id}) has an invalid deleted flag.`);
    }
    if (r.deleted !== true) {
      const problem = LIVE_CHECKS[key](r);
      if (problem) throw new FileFormatError(`${where} (id ${id}) ${problem}.`);
    }
  });
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
  const version = file.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new FileFormatError('The file has an invalid schemaVersion.');
  }
  if (version > SCHEMA_VERSION) {
    throw new NewerSchemaError(
      `This data was saved by a newer version of the app (format ${version}). Update the app by reloading the page, then try again.`,
    );
  }
  if (!isString(file.savedAt)) throw new FileFormatError('The file has no savedAt time.');
  for (const key of ['words', 'lists', 'cards'] as const) {
    const records: unknown = file[key];
    if (!Array.isArray(records)) throw new FileFormatError(`The file has no "${key}" list.`);
    validateRecords(key, records);
  }
  if (file.settings !== undefined) {
    const s = file.settings as Partial<Settings> | null;
    if (typeof s?.newCardsPerDay !== 'number' || typeof s?.reverseCards !== 'boolean' || !isCanonicalIso(s.updatedAt)) {
      throw new FileFormatError('The settings record is invalid.');
    }
  }
  return file as VocabFile; // shape validated above
}
