import { afterEach, describe, expect, it, vi } from 'vitest';
import { RecordNotFoundError } from '../db/errors';
import { fsrsState } from '../model/test-helpers';
import type { ReviewCard, ReviewSettings, Word } from '../model/types';
import { RATINGS, ratingOptions } from './fsrs';
import { buildQueue } from './queue';
import { ReviewSession } from './session.svelte';

const NOW = new Date('2026-11-22T15:00:00.000Z');
const YESTERDAY = '2026-11-21T15:00:00.000Z';
const [AGAIN, , GOOD, EASY] = RATINGS.map((r) => r.grade) as [number, number, number, number];

const word = (id: string, createdAt = '2026-11-01T00:00:00.000Z'): Word => ({
  id,
  word: `từ ${id}`,
  syllables: [{ text: 'từ' }, { text: id }],
  senses: [{ pos: 'Noun', meaning: `meaning of ${id}` }],
  listIds: [],
  createdAt,
  updatedAt: createdAt,
});

const card = (wordId: string, due: string, updatedAt = YESTERDAY): ReviewCard => ({
  id: `${wordId}:f`,
  wordId,
  direction: 'forward',
  fsrs: fsrsState(due),
  introducedAt: YESTERDAY,
  updatedAt,
});

/** A session over `words`, with a clock, a log of what it played, and saves that wait for the test. */
function setup(words: Word[], settings: ReviewSettings = { newCardsPerDay: 20, reverseCards: false }) {
  let clock = NOW;
  let autoplay = true;
  const played: string[] = [];
  const saves: { wordId: string; resolve: () => void; reject: (e: unknown) => void }[] = [];
  const sync = { holds: 0, releases: 0 };
  const session = new ReviewSession({
    next: (cards) => buildQueue({ words, cards, settings, now: clock }).items[0] ?? null,
    save: (wordId) => new Promise<void>((resolve, reject) => saves.push({ wordId, resolve, reject })),
    pronounce: (item) => played.push(`${item.direction} ${item.word.id}`),
    autoplay: () => autoplay,
    now: () => clock,
    holdSync: () => {
      sync.holds++;
      return () => sync.releases++;
    },
  });
  return {
    session,
    played,
    saves,
    sync,
    later(ms: number) {
      clock = new Date(clock.getTime() + ms);
    },
    autoplayOff() {
      autoplay = false;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReviewSession', () => {
  it('shows the first card and plays a forward card at once', () => {
    const { session, played, sync } = setup([word('a'), word('b')]);
    expect(session.phase).toBe('start');
    session.start([]);
    expect(session.phase).toBe('card');
    expect(session.current).toMatchObject({ direction: 'forward', word: { id: 'a' } });
    expect(session.revealed).toBe(false);
    expect(played).toEqual(['forward a']);
    expect(sync.holds).toBe(1);
  });

  it('shows the rating options with the answer, and plays a reverse card then', () => {
    const { session, played } = setup([word('a')], { newCardsPerDay: 20, reverseCards: true });
    session.start([card('a', '2026-12-01T00:00:00.000Z')]);
    expect(session.current).toMatchObject({ direction: 'reverse', word: { id: 'a' } });
    expect(played).toEqual([]);
    session.reveal();
    expect(session.revealed).toBe(true);
    expect(session.revealedAt).toEqual(NOW);
    expect(session.options.map((o) => o.label)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
    expect(played).toEqual(['reverse a']);
  });

  it('moves on at once after a rating, and saves it in the background', () => {
    const { session, saves } = setup([word('a'), word('b')]);
    session.start([]);
    session.reveal();
    session.rate(GOOD);
    expect(session.reviewed).toBe(1);
    expect(session.current).toMatchObject({ word: { id: 'b' } });
    expect(session.cards).toEqual([expect.objectContaining({ id: 'a:f', introducedAt: NOW.toISOString(), updatedAt: NOW.toISOString() })]);
    expect(saves.map((s) => s.wordId)).toEqual(['a']);
  });

  it('ignores a rating before the answer shows, and a second reveal', () => {
    const { session, saves } = setup([word('a')]);
    session.start([]);
    session.rate(GOOD);
    expect(saves).toEqual([]);
    session.reveal();
    const options = session.options;
    session.reveal();
    expect(session.options).toBe(options);
  });

  it('ends when nothing waits, and stops holding sync', () => {
    const { session, sync } = setup([word('a')]);
    session.start([]);
    session.reveal();
    session.rate(EASY);
    expect(session.phase).toBe('done');
    expect(session.current).toBeNull();
    expect(sync.releases).toBe(1);
    session.start(session.cards ?? []);
    expect(sync.holds).toBe(2);
  });

  it('shows a card again within the session when it comes back within 20 minutes', () => {
    const { session, later } = setup([word('a')]);
    session.start([]);
    session.reveal();
    session.rate(AGAIN);
    expect(session.current).toMatchObject({ word: { id: 'a' } });
    later(60_000);
    session.reveal();
    session.rate(EASY);
    expect(session.reviewed).toBe(2);
    expect(session.phase).toBe('done');
  });

  it("says which review couldn't be saved, and keeps going", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { session, saves } = setup([word('a'), word('b')]);
    session.start([]);
    session.reveal();
    session.rate(GOOD);
    saves[0]!.reject(new Error('disk full'));
    await Promise.resolve();
    expect(session.saveError).toBe("Couldn't save the review of “từ a”. Your other reviews are saved.");
    expect(session.current).toMatchObject({ word: { id: 'b' } });
  });

  it('lets a word deleted meanwhile leave quietly', async () => {
    const { session, saves } = setup([word('a'), word('b')]);
    session.start([]);
    session.reveal();
    session.rate(GOOD);
    saves[0]!.reject(new RecordNotFoundError('Word a not found'));
    await Promise.resolve();
    expect(session.saveError).toBe('');
  });

  it('takes in newer cards stored meanwhile, but keeps its own ratings (roadmap M4)', () => {
    const { session } = setup([word('a'), word('b'), word('c')]);
    session.start([card('a', YESTERDAY), card('c', YESTERDAY)]);
    session.reveal();
    session.rate(EASY);
    const rated = session.cards!.find((c) => c.id === 'a:f')!;
    // The stored copy of the rating is stamped a little later; b was reviewed on another device; c's copy is older.
    session.mergeStored([
      { ...rated, updatedAt: '2026-11-22T15:00:00.005Z', fsrs: fsrsState(YESTERDAY) },
      card('b', '2026-12-01T00:00:00.000Z', '2026-11-22T14:00:00.000Z'),
      card('c', '2026-12-01T00:00:00.000Z', '2026-11-20T00:00:00.000Z'),
    ]);
    expect(session.cards!.find((c) => c.id === 'a:f')).toBe(rated);
    expect(session.cards!.find((c) => c.id === 'b:f')?.updatedAt).toBe('2026-11-22T14:00:00.000Z');
    expect(session.cards!.find((c) => c.id === 'c:f')?.updatedAt).toBe(YESTERDAY);
    const before = session.cards;
    session.mergeStored([card('c', YESTERDAY)]);
    expect(session.cards).toBe(before);
  });

  it('moves on when the card on screen was reviewed on another device meanwhile (M4 decision 12)', () => {
    const { session, played } = setup([word('a'), word('b')]);
    session.start([card('a', YESTERDAY), card('b', YESTERDAY)]);
    expect(session.current).toMatchObject({ word: { id: 'a' } });
    // A sync brings the other device's review of a, due next month: b shows instead, silently.
    session.mergeStored([card('a', '2026-12-22T00:00:00.000Z', '2026-11-22T14:00:00.000Z')]);
    expect(session.current).toMatchObject({ word: { id: 'b' } });
    expect(session.revealed).toBe(false);
    expect(played).toEqual(['forward a']);
  });

  it('rates the card on screen from its new state when it was reviewed elsewhere after its answer showed', () => {
    const { session, later } = setup([word('a')]);
    session.start([card('a', YESTERDAY)]);
    session.reveal();
    later(5000);
    const elsewhere: ReviewCard = {
      ...card('a', '2026-11-22T15:10:00.000Z', '2026-11-22T15:00:03.000Z'),
      fsrs: { ...fsrsState('2026-11-22T15:10:00.000Z', 1), stability: 0.5, last_review: '2026-11-22T15:00:02.000Z' },
    };
    session.mergeStored([elsewhere]);
    expect(session.current?.card).toBe(elsewhere);
    expect(session.revealed).toBe(true);
    expect(session.options).toEqual(ratingOptions(elsewhere.fsrs, session.revealedAt));
    expect(session.revealedAt).toEqual(new Date(NOW.getTime() + 5000));
  });

  it('plays nothing with autoplay off', () => {
    const { session, played, autoplayOff } = setup([word('a')]);
    autoplayOff();
    session.start([]);
    session.reveal();
    expect(played).toEqual([]);
  });

  it('stops holding sync once when the screen closes mid-session', () => {
    const { session, sync } = setup([word('a'), word('b')]);
    session.start([]);
    session.start([]);
    expect(sync.holds).toBe(1);
    session.stop();
    session.stop();
    expect(sync.releases).toBe(1);
  });
});
