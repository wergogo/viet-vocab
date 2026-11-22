import { describe, expect, it } from 'vitest';
import { fsrsState } from '../model/test-helpers';
import { fromFsrs, rate, ratingOptions, RATINGS, toFsrs } from './fsrs';

const NOW = new Date('2026-11-22T09:00:00.000Z');
const MINUTE = 60_000;
const good = RATINGS[2]!.grade;

describe('ratingOptions', () => {
  it('labels a new card with the short-term learning steps, and Easy with days (spec §8)', () => {
    expect(ratingOptions(undefined, NOW).map((o) => `${o.label} ${o.interval}`)).toEqual([
      'Again 1m',
      'Hard 6m',
      'Good 10m',
      'Easy 8d',
    ]);
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

  it('converts stored cards both ways without loss', () => {
    const stored = fsrsState('2026-11-25T09:00:00.000Z');
    expect(fromFsrs(toFsrs(stored))).toEqual(stored);
    const { last_review: _omitted, ...fresh } = stored;
    expect(fromFsrs(toFsrs(fresh))).toEqual(fresh);
  });
});
