/** UTC ISO-8601 timestamp, e.g. "2026-11-21T08:15:00.000Z". */
export type ISO = string;

export interface Syllable {
  text: string;
  /** Hán or Nôm character(s) for this syllable. */
  char?: string;
  /** Per-character meaning, e.g. "city" for 城. */
  gloss?: string;
}

export interface Sense {
  /** Word class, free text: "Verb", "Noun (classifier: chiếc, cái)". */
  pos: string;
  meaning: string;
}

export interface Word {
  id: string;
  /** As entered, Unicode NFC: "nhập khẩu". */
  word: string;
  syllables: Syllable[];
  senses: Sense[];
  ipaHanoi?: string;
  ipaSaigon?: string;
  etymology?: string;
  notes?: string;
  listIds: string[];
  /** Wikimedia Commons file name of a recording. */
  audioFile?: string;
  source?: { wiktionaryTitle: string; fetchedAt: ISO };
  createdAt: ISO;
  updatedAt: ISO;
  deleted?: undefined;
}

export interface List {
  id: string;
  name: string;
  createdAt: ISO;
  updatedAt: ISO;
  deleted?: undefined;
}

/** Serialized ts-fsrs card (dates as ISO strings). Milestone 3 gives it a precise type. */
export type SerializedFsrsCard = Record<string, unknown>;

export interface ReviewCard {
  /** `${wordId}:f` (forward) or `${wordId}:r` (reverse). */
  id: string;
  wordId: string;
  direction: 'forward' | 'reverse';
  fsrs: SerializedFsrsCard;
  /** Time of the first review; used for the daily new-card allowance. */
  introducedAt: ISO;
  updatedAt: ISO;
  deleted?: undefined;
}

export interface Settings {
  newCardsPerDay: number;
  reverseCards: boolean;
  updatedAt: ISO;
}

export interface Tombstone {
  id: string;
  updatedAt: ISO;
  deleted: true;
  /** Present on card tombstones. */
  wordId?: string;
}

/** A stored record: either live or a tombstone. */
export type Rec<T> = T | Tombstone;

export function isLive<T extends { deleted?: undefined }>(r: Rec<T>): r is T {
  return r.deleted !== true;
}

export function tombstone(id: string, updatedAt: ISO, wordId?: string): Tombstone {
  return wordId === undefined ? { id, updatedAt, deleted: true } : { id, updatedAt, deleted: true, wordId };
}

export const DEFAULT_SETTINGS: Readonly<Omit<Settings, 'updatedAt'>> = {
  newCardsPerDay: 20,
  reverseCards: false,
};
