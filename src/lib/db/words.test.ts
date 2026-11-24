import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fsrsState } from '../model/test-helpers';
import { db, resetDb } from './db';
import { isDirty } from './dirty';
import {
  createWord,
  deleteWord,
  draftFromWord,
  emptyDraft,
  getWord,
  listLiveWords,
  normalizeDraft,
  updateWord,
  type WordDraft,
} from './words';
import { expectDerivedFieldsFresh } from './test-utils';

const draft = (over: Partial<WordDraft> = {}): WordDraft => ({
  ...emptyDraft('nhập khẩu'),
  syllables: [{ text: 'nhập', char: '入' }, { text: 'khẩu', char: '口' }],
  senses: [{ pos: 'Verb', meaning: 'to import' }],
  ...over,
});

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

afterEach(expectDerivedFieldsFresh);

describe('normalizeDraft', () => {
  it('trims fields, drops empty meanings and keeps characters by position', () => {
    const result = normalizeDraft({
      ...emptyDraft(),
      word: '  nhập   khẩu ',
      syllables: [{ text: 'nhập', char: ' 入 ' }, { text: 'khẩu', char: '口', gloss: '  ' }],
      senses: [{ pos: 'Verb', meaning: ' to import ' }, { pos: '', meaning: '' }],
      ipaHanoi: ' [ɲəp̚˧˨ʔ xəw˧˩] ',
      notes: '   ',
      listIds: ['l1', 'l1'],
    });
    expect(result).toEqual({
      word: 'nhập khẩu',
      syllables: [{ text: 'nhập', char: '入' }, { text: 'khẩu', char: '口' }],
      senses: [{ pos: 'Verb', meaning: 'to import' }],
      listIds: ['l1'],
      ipaHanoi: '[ɲəp̚˧˨ʔ xəw˧˩]',
    });
  });

  it('requires a word', () => {
    expect(() => normalizeDraft(emptyDraft('   '))).toThrow('Word is required');
    expect(() => normalizeDraft(emptyDraft('-'))).toThrow('Word is required');
  });

  it('drops zero-width characters from every text field', () => {
    const z = String.fromCodePoint(0x200b);
    const result = normalizeDraft({
      ...emptyDraft('nhập'),
      syllables: [{ text: 'nhập', char: `入${z}`, gloss: z }],
      senses: [{ pos: 'Verb', meaning: `im${z}port` }, { pos: '', meaning: z }],
      notes: `line one${z}\nline two `,
    });
    expect(result.syllables).toEqual([{ text: 'nhập', char: '入' }]);
    expect(result.senses).toEqual([{ pos: 'Verb', meaning: 'import' }]);
    expect(result.notes).toBe('line one\nline two');
  });

  it('stores characters in NFC so compatibility ideographs match search', () => {
    const compat = String.fromCodePoint(0xf900);
    const result = normalizeDraft({ ...emptyDraft('khải'), syllables: [{ text: 'khải', char: compat }] });
    expect(result.syllables[0]?.char).toBe(compat.normalize('NFC'));
    expect(result.syllables[0]?.char).not.toBe(compat);
  });

  it('stores regions in order, each once, and leaves out an empty list', () => {
    expect(normalizeDraft(draft({ regions: ['south', 'north', 'south'] })).regions).toEqual(['north', 'south']);
    expect(normalizeDraft(draft({ regions: [] }))).not.toHaveProperty('regions');
  });

  it('cleans equivalents, and drops empty ones, the word itself and repeats', () => {
    const result = normalizeDraft({
      ...emptyDraft('xe lửa'),
      equivalents: [
        { word: '  tàu   hoả '.normalize('NFD'), regions: ['north', 'north'] },
        { word: '   ', regions: ['south'] },
        { word: 'Xe Lửa', regions: [] },
        { word: 'tàu hỏa', regions: ['central'] },
        { word: 'xe hoả', regions: [] },
      ],
    });
    expect(result.equivalents).toEqual([{ word: 'tàu hoả', regions: ['north'] }, { word: 'xe hoả' }]);
    expect(normalizeDraft({ ...emptyDraft('xe lửa'), equivalents: [{ word: ' ', regions: [] }] })).not.toHaveProperty(
      'equivalents',
    );
  });
});

describe('createWord / getWord / draftFromWord', () => {
  it('stores the word with derived fields and marks sync dirty', async () => {
    const w = await createWord(draft());
    expect(w.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(w.updatedAt).toBe(w.createdAt);
    expect(await getWord(w.id)).toEqual(w);
    expect(await db.words.get(w.id)).toMatchObject({ searchLoose: 'nhap khau\nto import', chars: ['入', '口'] });
    expect(isDirty()).toBe(true);
  });

  it('turns a saved word back into an editable draft', async () => {
    const w = await createWord(draft({ notes: 'news word' }));
    const d = draftFromWord(w);
    expect(d.word).toBe('nhập khẩu');
    expect(d.notes).toBe('news word');
    expect(d.ipaSaigon).toBe('');
    expect(normalizeDraft(d)).toEqual(normalizeDraft(draft({ notes: 'news word' })));
  });

  it('keeps regions and equivalents through an edit, and copies them into the draft', async () => {
    const w = await createWord({
      ...emptyDraft('xe lửa'),
      regions: ['south'],
      equivalents: [{ word: 'tàu hoả', regions: ['north'] }, { word: 'xe hoả', regions: [] }],
    });
    expect(w).toMatchObject({ regions: ['south'], equivalents: [{ word: 'tàu hoả', regions: ['north'] }, { word: 'xe hoả' }] });
    const d = draftFromWord(w);
    expect(d.equivalents).toEqual([{ word: 'tàu hoả', regions: ['north'] }, { word: 'xe hoả', regions: [] }]);
    d.regions.push('north');
    d.equivalents[0]!.regions.push('central');
    expect(w.regions).toEqual(['south']);
    expect(w.equivalents?.[0]?.regions).toEqual(['north']);
    const cleared = await updateWord(w.id, { ...draftFromWord(w), regions: [], equivalents: [] });
    expect(cleared).not.toHaveProperty('regions');
    expect(cleared).not.toHaveProperty('equivalents');
  });
});

describe('updateWord', () => {
  it('keeps createdAt and bumps updatedAt', async () => {
    const w = await createWord(draft());
    vi.setSystemTime(new Date('2026-01-02T00:00:00.000Z'));
    const u = await updateWord(w.id, draft({ notes: 'common in news' }));
    expect(u.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(u.updatedAt).toBe('2026-01-02T00:00:00.000Z');
    expect((await getWord(w.id))?.notes).toBe('common in news');
  });

  it('stamps 1 ms after a future updatedAt left by a fast clock', async () => {
    const w = await createWord(draft());
    const row = await db.words.get(w.id);
    await db.words.put({ ...row!, updatedAt: '2030-01-01T00:00:00.000Z' });
    const u = await updateWord(w.id, draft({ notes: 'later edit' }));
    expect(u.updatedAt).toBe('2030-01-01T00:00:00.001Z');
  });

  it('fails for a missing word', async () => {
    await expect(updateWord('nope', draft())).rejects.toThrow('not found');
  });

  it('refuses to update a deleted word', async () => {
    const w = await createWord(draft());
    await deleteWord(w.id);
    await expect(updateWord(w.id, draft())).rejects.toThrow('not found');
    expect(await getWord(w.id)).toBeUndefined();
  });

  it('marks sync dirty on update and delete', async () => {
    const w = await createWord(draft());
    localStorage.clear();
    await updateWord(w.id, draft({ notes: 'x' }));
    expect(isDirty()).toBe(true);
    localStorage.clear();
    await deleteWord(w.id);
    expect(isDirty()).toBe(true);
  });
});

describe('deleteWord', () => {
  it('tombstones the word and its review cards', async () => {
    const w = await createWord(draft());
    await db.cards.put({ id: `${w.id}:f`, wordId: w.id, direction: 'forward', fsrs: fsrsState('2026-01-01T00:00:00.000Z'), introducedAt: 't', updatedAt: 't' });
    vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
    await deleteWord(w.id);
    expect(await getWord(w.id)).toBeUndefined();
    expect(await db.words.get(w.id)).toEqual({ id: w.id, updatedAt: '2026-01-03T00:00:00.000Z', deleted: true });
    expect(await db.cards.get(`${w.id}:f`)).toEqual({
      id: `${w.id}:f`,
      updatedAt: '2026-01-03T00:00:00.000Z',
      deleted: true,
      wordId: w.id,
    });
    expect(await listLiveWords()).toEqual([]);
  });

  it('is a no-op the second time and still records unknown ids', async () => {
    const w = await createWord(draft());
    vi.setSystemTime(new Date('2026-01-03T00:00:00.000Z'));
    await deleteWord(w.id);
    localStorage.clear();
    vi.setSystemTime(new Date('2026-01-04T00:00:00.000Z'));
    await deleteWord(w.id);
    expect(await db.words.get(w.id)).toEqual({ id: w.id, updatedAt: '2026-01-03T00:00:00.000Z', deleted: true });
    expect(isDirty()).toBe(false);
    await deleteWord('unknown');
    expect(await db.words.get('unknown')).toEqual({ id: 'unknown', updatedAt: '2026-01-04T00:00:00.000Z', deleted: true });
  });
});
