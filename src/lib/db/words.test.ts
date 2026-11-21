import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  });

  it('stores characters in NFC so compatibility ideographs match search', () => {
    const compat = String.fromCodePoint(0xf900);
    const result = normalizeDraft({ ...emptyDraft('khải'), syllables: [{ text: 'khải', char: compat }] });
    expect(result.syllables[0]?.char).toBe(compat.normalize('NFC'));
    expect(result.syllables[0]?.char).not.toBe(compat);
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
});

describe('deleteWord', () => {
  it('tombstones the word and its review cards', async () => {
    const w = await createWord(draft());
    await db.cards.put({ id: `${w.id}:f`, wordId: w.id, direction: 'forward', fsrs: {}, introducedAt: 't', updatedAt: 't' });
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
});
