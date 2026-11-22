import { cardId } from './ids';
import { isNewCardsPerDay } from './settings';
import { tombstone, type List, type Rec, type ReviewCard, type Settings, type Word } from './types';

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

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value !== '';
}

/** Optional text is absent or a string; the app never writes null or other types there. */
function isOptionalString(value: unknown): boolean {
  return value === undefined || isString(value);
}

type Fields = Record<string, unknown>;

/** A JSON object: not null and not an array. */
function isObject(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The 1-based position of the first item that fails `ok`, or 0 when every item passes. */
function firstInvalid(items: unknown[], ok: (item: unknown) => boolean): number {
  return items.findIndex((item) => !ok(item)) + 1;
}

const isSyllable = (s: unknown): boolean =>
  isObject(s) && isString(s.text) && isOptionalString(s.char) && isOptionalString(s.gloss);
const isSense = (s: unknown): boolean => isObject(s) && isString(s.pos) && isString(s.meaning);
const isSource = (s: unknown): boolean => isObject(s) && isString(s.wiktionaryTitle) && isCanonicalIso(s.fetchedAt);

const OPTIONAL_WORD_TEXT = ['ipaHanoi', 'ipaSaigon', 'etymology', 'notes', 'audioFile'] as const;

function wordProblem(r: Fields): string | null {
  if (!isNonEmptyString(r.word)) return 'has no word text';
  if (!isCanonicalIso(r.createdAt)) return 'has an invalid createdAt';
  if (!Array.isArray(r.syllables)) return 'has no syllables list';
  const syllable = firstInvalid(r.syllables, isSyllable);
  if (syllable) return `has an invalid syllable #${syllable}`;
  if (!Array.isArray(r.senses)) return 'has no meanings list';
  const sense = firstInvalid(r.senses, isSense);
  if (sense) return `has an invalid meaning #${sense}`;
  if (!Array.isArray(r.listIds)) return 'has no list ids';
  const listId = firstInvalid(r.listIds, isString);
  if (listId) return `has an invalid list id #${listId}`;
  const field = OPTIONAL_WORD_TEXT.find((f) => !isOptionalString(r[f]));
  if (field) return `has an invalid ${field}`;
  if (r.source !== undefined && !isSource(r.source)) return 'has an invalid source';
  return null;
}

const isCount = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isAmount = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** The fields of a stored ts-fsrs state as the app writes them (SerializedFsrsCard). */
const FSRS_FIELDS: readonly [string, (v: unknown) => boolean][] = [
  ['due', isCanonicalIso],
  ['stability', isAmount],
  ['difficulty', isAmount],
  ['elapsed_days', (v) => v === undefined || isAmount(v)],
  ['scheduled_days', isAmount],
  ['learning_steps', isCount],
  ['reps', isCount],
  ['lapses', isCount],
  ['state', (v) => v === 0 || v === 1 || v === 2 || v === 3],
  ['last_review', (v) => v === undefined || isCanonicalIso(v)],
];

function cardProblem(r: Fields): string | null {
  const { wordId, direction, fsrs } = r;
  if (!isString(wordId)) return 'has no word id';
  if (direction !== 'forward' && direction !== 'reverse') return 'has an unknown direction';
  // One card per word and direction (spec §4.1): any other id would be a second card for the same word.
  if (r.id !== cardId(wordId, direction)) return "has an id that doesn't match its word and direction";
  if (!isObject(fsrs)) return 'has no review state';
  const field = FSRS_FIELDS.find(([name, ok]) => !ok(fsrs[name]));
  if (field) return `has an invalid review state (${field[0]})`;
  if (!isCanonicalIso(r.introducedAt)) return 'has an invalid introducedAt';
  return null;
}

type Collection = 'words' | 'lists' | 'cards';

const LABELS: Record<Collection, string> = { words: 'Word', lists: 'List', cards: 'Review card' };

/**
 * Problems with a live (non-deleted) record, or null when its fields have the shapes the app writes.
 * Unknown extra fields are allowed, so files from a newer app version with new optional fields still import.
 */
const LIVE_CHECKS: Record<Collection, (r: Fields) => string | null> = {
  words: wordProblem,
  lists: (r) =>
    !isNonEmptyString(r.name) ? 'has no name' : !isCanonicalIso(r.createdAt) ? 'has an invalid createdAt' : null,
  cards: cardProblem,
};

/**
 * Checks one collection and returns its records as they will be stored: live records unchanged,
 * tombstones rebuilt with only the fields spec §4.2 keeps (id, updatedAt, deleted, and wordId on cards).
 */
function readRecords(key: Collection, records: unknown[]): unknown[] {
  const seen = new Set<string>();
  return records.map((record, index) => {
    const where = `${LABELS[key]} #${index + 1}`;
    if (!isObject(record)) throw new FileFormatError(`${where} is not a record.`);
    const { id, updatedAt } = record;
    if (!isNonEmptyString(id)) throw new FileFormatError(`${where} has no id.`);
    if (!isCanonicalIso(updatedAt)) throw new FileFormatError(`${where} (id ${id}) has an invalid updatedAt.`);
    if (seen.has(id)) throw new FileFormatError(`"${key}" contains the id ${id} twice.`);
    seen.add(id);
    if (record.deleted === true) {
      const wordId = key === 'cards' ? record.wordId : undefined;
      if (wordId !== undefined && !isString(wordId)) {
        throw new FileFormatError(`${where} (id ${id}) has an invalid wordId.`);
      }
      return tombstone(id, updatedAt, wordId);
    }
    if (record.deleted !== undefined) throw new FileFormatError(`${where} (id ${id}) has an invalid deleted flag.`);
    const problem = LIVE_CHECKS[key](record);
    if (problem) throw new FileFormatError(`${where} (id ${id}) ${problem}.`);
    return record;
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
  const checked = {} as Record<Collection, unknown[]>;
  for (const key of ['words', 'lists', 'cards'] as const) {
    const records: unknown = file[key];
    if (!Array.isArray(records)) throw new FileFormatError(`The file has no "${key}" list.`);
    checked[key] = readRecords(key, records);
  }
  if (file.settings !== undefined) {
    const s = file.settings as Partial<Settings> | null;
    if (!isNewCardsPerDay(s?.newCardsPerDay) || typeof s?.reverseCards !== 'boolean' || !isCanonicalIso(s.updatedAt)) {
      throw new FileFormatError('The settings record is invalid.');
    }
  }
  return { ...file, ...checked } as VocabFile; // shape validated above
}
