import type { Sense, Syllable, Word } from '../model/types';
import { isLive, tombstone } from '../model/types';
import { newId, nextTimestamp, nowIso } from '../model/ids';
import { cleanMultiline, cleanText } from '../text/normalize';
import { rebuildSyllables } from '../text/syllables';
import { db } from './db';
import { fromRow, isLiveRow, toRow, type LiveWordRow } from './derive';
import { markDirty } from './dirty';
import { RecordNotFoundError } from './errors';

/** What the add/edit form edits. Empty strings mean "not set". */
export interface WordDraft {
  word: string;
  syllables: Syllable[];
  senses: Sense[];
  ipaHanoi: string;
  ipaSaigon: string;
  etymology: string;
  notes: string;
  listIds: string[];
  audioFile?: string;
  source?: Word['source'];
}

export type WordFields = Omit<Word, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>;

export function emptyDraft(word = ''): WordDraft {
  return {
    word,
    syllables: rebuildSyllables(word),
    senses: [{ pos: '', meaning: '' }],
    ipaHanoi: '',
    ipaSaigon: '',
    etymology: '',
    notes: '',
    listIds: [],
  };
}

export function draftFromWord(w: Word): WordDraft {
  return {
    word: w.word,
    syllables: w.syllables.map((s) => ({ ...s })),
    senses: w.senses.length > 0 ? w.senses.map((s) => ({ ...s })) : [{ pos: '', meaning: '' }],
    ipaHanoi: w.ipaHanoi ?? '',
    ipaSaigon: w.ipaSaigon ?? '',
    etymology: w.etymology ?? '',
    notes: w.notes ?? '',
    listIds: [...w.listIds],
    audioFile: w.audioFile,
    source: w.source ? { ...w.source } : undefined,
  };
}

/** Cleaned text (zero-width characters removed, trimmed, NFC), or undefined when empty. */
function optional(s: string | undefined, multiline = false): string | undefined {
  if (s === undefined) return undefined;
  const t = multiline ? cleanMultiline(s) : cleanText(s);
  return t ? t : undefined;
}

/** Cleans a draft into stored word fields. Throws if the word is empty. */
export function normalizeDraft(d: WordDraft): WordFields {
  const word = cleanText(d.word);
  const syllables = rebuildSyllables(word, d.syllables).map((s) => {
    const out: Syllable = { text: s.text };
    const char = optional(s.char);
    const gloss = optional(s.gloss);
    if (char) out.char = char;
    if (gloss) out.gloss = gloss;
    return out;
  });
  if (!word || syllables.length === 0) throw new Error('Word is required');
  const senses: Sense[] = d.senses
    .map((s) => ({ pos: cleanText(s.pos), meaning: cleanText(s.meaning) }))
    .filter((s) => s.pos || s.meaning);
  const fields: WordFields = { word, syllables, senses, listIds: [...new Set(d.listIds)] };
  const ipaHanoi = optional(d.ipaHanoi);
  const ipaSaigon = optional(d.ipaSaigon);
  const etymology = optional(d.etymology, true);
  const notes = optional(d.notes, true);
  const audioFile = optional(d.audioFile);
  if (ipaHanoi) fields.ipaHanoi = ipaHanoi;
  if (ipaSaigon) fields.ipaSaigon = ipaSaigon;
  if (etymology) fields.etymology = etymology;
  if (notes) fields.notes = notes;
  if (audioFile) fields.audioFile = audioFile;
  if (d.source) fields.source = { ...d.source };
  return fields;
}

export async function createWord(d: WordDraft): Promise<Word> {
  const now = nowIso();
  const word: Word = { id: newId(), ...normalizeDraft(d), createdAt: now, updatedAt: now };
  await db.words.put(toRow(word));
  markDirty();
  return word;
}

export async function getWord(id: string): Promise<Word | undefined> {
  const row = await db.words.get(id);
  if (!row) return undefined;
  const record = fromRow(row);
  return isLive(record) ? record : undefined;
}

/**
 * Saves an edit. Reads and writes in one transaction, so a concurrent delete can't be overwritten. The ids of lists
 * that were deleted are dropped now, since deleting a list leaves them on its words (M4 decision 9); unknown ids stay.
 */
export async function updateWord(id: string, d: WordDraft): Promise<Word> {
  const fields = normalizeDraft(d);
  const word = await db.transaction('rw', db.words, db.lists, async () => {
    const row = await db.words.get(id);
    if (!row || !isLiveRow(row)) throw new RecordNotFoundError(`Word ${id} not found`);
    const lists = await db.lists.bulkGet(fields.listIds);
    const listIds = fields.listIds.filter((_, i) => lists[i]?.deleted !== true);
    const next: Word = { id, ...fields, listIds, createdAt: row.createdAt, updatedAt: nextTimestamp(row.updatedAt) };
    await db.words.put(toRow(next));
    return next;
  });
  markDirty();
  return word;
}

/**
 * Tombstones the word and its review cards. Deleting an unknown id still records a tombstone
 * (harmless for sync); deleting an already deleted word does nothing.
 */
export async function deleteWord(id: string): Promise<void> {
  const changed = await db.transaction('rw', db.words, db.cards, async () => {
    const row = await db.words.get(id);
    if (row && !isLiveRow(row)) return false;
    await db.words.put(tombstone(id, nextTimestamp(row?.updatedAt)));
    const cards = await db.cards.where('wordId').equals(id).toArray();
    await db.cards.bulkPut(
      cards.filter((c) => isLive(c)).map((c) => tombstone(c.id, nextTimestamp(c.updatedAt), id)),
    );
    return true;
  });
  if (changed) markDirty();
}

export async function listLiveWords(): Promise<LiveWordRow[]> {
  return (await db.words.toArray()).filter(isLiveRow);
}
