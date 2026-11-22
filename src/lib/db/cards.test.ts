import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fsrsState } from '../model/test-helpers';
import { tombstone } from '../model/types';
import { cardId, listLiveCards, saveReview } from './cards';
import { db, resetDb } from './db';
import { dirtySeq } from './dirty';
import { RecordNotFoundError } from './errors';
import { createWord, deleteWord, emptyDraft } from './words';

const DAY1 = new Date('2026-11-20T08:00:00.000Z');
const DAY2 = new Date('2026-11-21T08:00:00.000Z');

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(DAY1);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('saveReview', () => {
  it('creates the card on the first review and keeps introducedAt afterwards', async () => {
    const word = await createWord(emptyDraft('nước'));
    const first = await saveReview(word.id, 'forward', fsrsState('2026-11-20T08:10:00.000Z', 1), DAY1);
    expect(first).toEqual({
      id: `${word.id}:f`,
      wordId: word.id,
      direction: 'forward',
      fsrs: fsrsState('2026-11-20T08:10:00.000Z', 1),
      introducedAt: DAY1.toISOString(),
      updatedAt: DAY1.toISOString(),
    });
    vi.setSystemTime(DAY2);
    const second = await saveReview(word.id, 'forward', fsrsState('2026-11-24T08:00:00.000Z'), DAY2);
    expect(second).toMatchObject({ introducedAt: DAY1.toISOString(), updatedAt: DAY2.toISOString() });
    expect(await listLiveCards()).toEqual([second]);
  });

  it('names reverse cards with :r and marks sync dirty', async () => {
    const word = await createWord(emptyDraft('nước'));
    const before = dirtySeq();
    const card = await saveReview(word.id, 'reverse', fsrsState('2026-11-20T08:10:00.000Z'), DAY1);
    expect(card.id).toBe(cardId(word.id, 'reverse'));
    expect(card.id.endsWith(':r')).toBe(true);
    expect(dirtySeq()).toBe(before + 1);
  });

  it('stamps a card recreated over its tombstone after the tombstone', async () => {
    const word = await createWord(emptyDraft('nước'));
    const ahead = '2026-12-01T00:00:00.000Z';
    await db.cards.put(tombstone(cardId(word.id, 'forward'), ahead, word.id));
    const card = await saveReview(word.id, 'forward', fsrsState('2026-11-20T08:10:00.000Z'), DAY1);
    expect(card.updatedAt).toBe('2026-12-01T00:00:00.001Z');
    expect(card.introducedAt).toBe(DAY1.toISOString());
  });

  it('refuses to review a deleted word', async () => {
    const word = await createWord(emptyDraft('nước'));
    await deleteWord(word.id);
    await expect(saveReview(word.id, 'forward', fsrsState('2026-11-20T08:10:00.000Z'), DAY1)).rejects.toBeInstanceOf(
      RecordNotFoundError,
    );
    expect(await listLiveCards()).toEqual([]);
  });
});
