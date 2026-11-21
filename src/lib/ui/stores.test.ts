import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb } from '../db/db';
import type { LiveWordRow } from '../db/derive';
import { createWord, emptyDraft } from '../db/words';
import { liveWords } from './stores';

describe('liveWords', () => {
  beforeEach(async () => {
    await resetDb();
    localStorage.clear();
  });

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
