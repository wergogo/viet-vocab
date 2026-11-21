import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '../db/db';
import type { LiveWordRow } from '../db/derive';
import { createWord, deleteWord, draftFromWord, emptyDraft, updateWord } from '../db/words';
import type { Word } from '../model/types';
import { liveWord, liveWords } from './stores';

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
});

describe('liveWords', () => {
  it('starts undefined, then emits the words and every change', async () => {
    const values: (LiveWordRow[] | undefined)[] = [];
    const unsubscribe = liveWords.subscribe((v) => values.push(v));
    expect(values[0]).toBeUndefined();
    await vi.waitFor(() => expect(values.at(-1)).toEqual([]));
    await createWord({ ...emptyDraft('nhập'), senses: [] });
    await vi.waitFor(() => expect(values.at(-1)?.map((w) => w.word)).toEqual(['nhập']));
    unsubscribe();
  });
});

describe('liveWord', () => {
  it('starts undefined, then emits null for an unknown id', async () => {
    const values: (Word | null | undefined)[] = [];
    const unsubscribe = liveWord('missing').subscribe((v) => values.push(v));
    expect(values[0]).toBeUndefined();
    await vi.waitFor(() => expect(values.at(-1)).toBeNull());
    unsubscribe();
  });

  it('emits the word and its changes, then null once it is deleted', async () => {
    const created = await createWord({ ...emptyDraft('nhập'), senses: [] });
    const values: (Word | null | undefined)[] = [];
    const unsubscribe = liveWord(created.id).subscribe((v) => values.push(v));
    await vi.waitFor(() => expect(values.at(-1)?.word).toBe('nhập'));
    await updateWord(created.id, { ...draftFromWord(created), notes: 'hello' });
    await vi.waitFor(() => expect(values.at(-1)?.notes).toBe('hello'));
    await deleteWord(created.id);
    await vi.waitFor(() => expect(values.at(-1)).toBeNull());
    unsubscribe();
  });
});
