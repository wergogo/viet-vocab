import { describe, expect, it } from 'vitest';
import { parseFile, serializeFile } from '../model/file';
import { cardId } from '../model/ids';
import { fsrsState } from '../model/test-helpers';
import type { ReviewCard, SerializedFsrsCard } from '../model/types';
import { fromFsrs, rate, ratingOptions, RATINGS, toFsrs } from './fsrs';

const NOW = new Date('2026-11-22T09:00:00.000Z');
const MINUTE = 60_000;
const again = RATINGS[0]!.grade;
const good = RATINGS[2]!.grade;

describe('ratingOptions', () => {
  it('labels a new card with the short-term learning steps, and Easy with days (spec §8)', () => {
    const options = ratingOptions(undefined, NOW);
    expect(options.map((o) => `${o.label} ${o.interval}`)).toEqual(['Again 1m', 'Hard 6m', 'Good 10m', 'Easy 8d']);
    expect(options[2]!.due).toEqual(new Date(NOW.getTime() + 10 * MINUTE));
  });

  it('graduates a learning card to days on Good', () => {
    const learning = rate(undefined, good, NOW);
    const later = new Date(NOW.getTime() + 10 * MINUTE);
    expect(ratingOptions(learning, later).map((o) => o.interval)).toEqual(['1m', '6m', '2d', '4d']);
  });
});

describe('rate', () => {
  it('starts a word in learning and stores dates as ISO text', () => {
    const card = rate(undefined, good, NOW);
    expect(card).toMatchObject({ state: 1, reps: 1, lapses: 0, learning_steps: 1, last_review: NOW.toISOString() });
    expect(card.due).toBe(new Date(NOW.getTime() + 10 * MINUTE).toISOString());
  });

  it('puts a forgotten review card into relearning and counts the lapse', () => {
    const review = fsrsState('2026-11-22T08:00:00.000Z');
    expect(rate(review, again, NOW)).toMatchObject({ state: 3, lapses: 1, last_review: NOW.toISOString() });
  });

  it('converts stored cards both ways without loss, and reads one without elapsed_days', () => {
    const stored = fsrsState('2026-11-25T09:00:00.000Z');
    expect(fromFsrs(toFsrs(stored))).toEqual(stored);
    const { last_review: _omitted, ...fresh } = stored;
    expect(fromFsrs(toFsrs(fresh))).toEqual(fresh);
    const { elapsed_days: _dropped, ...newer } = stored;
    expect(toFsrs(newer).elapsed_days).toBe(0);
  });

  it('schedules from the last review when the clock is behind it, on an earlier UTC day', () => {
    const last = '2026-11-23T00:01:00.000Z';
    const learning: SerializedFsrsCard = { ...fsrsState('2026-11-23T00:11:00.000Z', 1), learning_steps: 1, last_review: last };
    const behind = new Date('2026-11-22T23:58:00.000Z');
    expect(ratingOptions(learning, behind).every((o) => o.due.getTime() > Date.parse(last))).toBe(true);
    expect(rate(learning, good, behind).last_review).toBe(last);
  });

  it('starts over a stored state ts-fsrs refuses, instead of getting stuck', () => {
    const damaged = { ...fsrsState('2026-11-22T08:00:00.000Z'), difficulty: 0.5 };
    expect(ratingOptions(damaged, NOW).map((o) => o.interval)).toEqual(['1m', '6m', '10m', '8d']);
    expect(rate(damaged, good, NOW)).toMatchObject({ state: 1, reps: 1, lapses: 0 });
  });

  it('writes only states parseFile accepts, whenever the reviews happen', () => {
    // A fixed pseudo-random run: any rating, each review from 20 minutes early to three intervals late.
    let seed = 42;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cards: ReviewCard[] = [];
    for (let run = 0; run < 40; run++) {
      let state: SerializedFsrsCard | undefined;
      let now = NOW.getTime();
      for (let step = 0; step < 25; step++) {
        state = rate(state, RATINGS[Math.floor(random() * 4)]!.grade, new Date(now));
        const wordId = `w${run}-${step}`;
        const stamp = NOW.toISOString();
        cards.push({ id: cardId(wordId, 'forward'), wordId, direction: 'forward', fsrs: state, introducedAt: stamp, updatedAt: stamp });
        const due = Date.parse(state.due);
        now = due - 20 * MINUTE + random() * (3 * (due - now) + 20 * MINUTE);
      }
    }
    expect(() => parseFile(serializeFile({ words: [], lists: [], cards }, NOW.toISOString()))).not.toThrow();
  });
});
