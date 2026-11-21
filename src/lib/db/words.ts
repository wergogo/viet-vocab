import type { Sense, Syllable, Word } from '../model/types';
import { isLive, tombstone } from '../model/types';
import { newId, nextTimestamp, nowIso } from '../model/ids';
import { cleanText } from '../text/normalize';
import { rebuildSyllables } from '../text/syllables';
import { db } from './db';
import { fromRow, isLiveRow, toRow, type LiveWordRow } from './derive';
import { markDirty } from './dirty';

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

function optional(s: string | undefined): string | undefined {
  const t = s?.trim();
  return t ? t : undefined;
}

/** Cleans a draft into stored word fields. Throws if the word is empty. */
export function normalizeDraft(d: WordDraft): WordFields {
  const word = cleanText(d.word);
  if (!word) throw new Error('Word is required');
  const syllables = rebuildSyllables(word, d.syllables).map((s) => {
    const out: Syllable = { text: s.text };
    const char = optional(s.char)?.normalize('NFC');
    const gloss = optional(s.gloss);
    if (char) out.char = char;
    if (gloss) out.gloss = gloss;
    return out;
  });
  const senses: Sense[] = d.senses
    .map((s) => ({ pos: s.pos.trim(), meaning: s.meaning.trim() }))
    .filter((s) => s.pos || s.meaning);
  const fields: WordFields = { word, syllables, senses, listIds: [...new Set(d.listIds)] };
  const ipaHanoi = optional(d.ipaHanoi);
  const ipaSaigon = optional(d.ipaSaigon);
  const etymology = optional(d.etymology);
  const notes = optional(d.notes);
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

export async function updateWord(id: string, d: WordDraft): Promise<Word> {
  const existing = await getWord(id);
  if (!existing) throw new Error(`Word ${id} not found`);
  const word: Word = { id, ...normalizeDraft(d), createdAt: existing.createdAt, updatedAt: nextTimestamp(existing.updatedAt) };
  await db.words.put(toRow(word));
  markDirty();
  return word;
}

/** Tombstones the word and its review cards. */
export async function deleteWord(id: string): Promise<void> {
  await db.transaction('rw', db.words, db.cards, async () => {
    const row = await db.words.get(id);
    await db.words.put(tombstone(id, nextTimestamp(row?.updatedAt)));
    const cards = await db.cards.where('wordId').equals(id).toArray();
    await db.cards.bulkPut(
      cards.filter((c) => isLive(c)).map((c) => tombstone(c.id, nextTimestamp(c.updatedAt), id)),
    );
  });
  markDirty();
}

export async function listLiveWords(): Promise<LiveWordRow[]> {
  return (await db.words.toArray()).filter(isLiveRow);
}
