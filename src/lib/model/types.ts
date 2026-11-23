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

/**
 * A ts-fsrs card with its dates as ISO strings (spec §4.1). `state` is ts-fsrs's State: 0 new, 1 learning, 2 review,
 * 3 relearning. The field names are ts-fsrs's own, so a card converts both ways without renaming. `elapsed_days` may
 * be absent: ts-fsrs 5 writes it but doesn't schedule with it, and ts-fsrs 6 drops it.
 */
export interface SerializedFsrsCard {
  due: ISO;
  stability: number;
  difficulty: number;
  elapsed_days?: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: 0 | 1 | 2 | 3;
  last_review?: ISO;
}

/** Forward cards show the word and ask for its meaning; reverse cards show the meanings and ask for the word. */
export type Direction = 'forward' | 'reverse';

export interface ReviewCard {
  /** `${wordId}:f` (forward) or `${wordId}:r` (reverse). */
  id: string;
  wordId: string;
  direction: Direction;
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
  /**
   * When each setting was last changed, so a merge keeps the latest change of each (M4 decision 8). A record from
   * before M4 has none, and all of its settings count as changed at `updatedAt`. In a record that has it, a setting it
   * doesn't name was never changed.
   */
  changedAt?: SettingTimes;
}

/** The settings the user edits; `updatedAt` and `changedAt` are stamped on save. */
export type ReviewSettings = Omit<Settings, 'updatedAt' | 'changedAt'>;

export type SettingName = keyof ReviewSettings;

/** When each setting was last changed. */
export type SettingTimes = Partial<Record<SettingName, ISO>>;

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

export const DEFAULT_SETTINGS: Readonly<ReviewSettings> = {
  newCardsPerDay: 20,
  reverseCards: false,
};

/** Every setting, in a fixed order. `DEFAULT_SETTINGS` must name each one, so none can be left out. */
export const SETTING_NAMES = Object.keys(DEFAULT_SETTINGS) as readonly SettingName[];
