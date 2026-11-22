import { createEmptyCard, fsrs, generatorParameters, Rating, type Card, type Grade } from 'ts-fsrs';
import type { SerializedFsrsCard } from '../model/types';
import { formatInterval } from './format';

/** Spec §8: ts-fsrs's default parameters with short-term learning steps on (1 and 10 minutes, then days). */
const scheduler = fsrs(generatorParameters({ enable_short_term: true }));

export type { Grade };

export type RatingLabel = 'Again' | 'Hard' | 'Good' | 'Easy';

/** The four ratings in button order; keys 1–4 pick them on desktop (spec §5.5). */
export const RATINGS: readonly { grade: Grade; label: RatingLabel }[] = [
  { grade: Rating.Again, label: 'Again' },
  { grade: Rating.Hard, label: 'Hard' },
  { grade: Rating.Good, label: 'Good' },
  { grade: Rating.Easy, label: 'Easy' },
];

export interface RatingOption {
  grade: Grade;
  label: RatingLabel;
  /** When the card would come back after this rating. */
  due: Date;
  /** The same as short text for the button: "1m", "10m", "2d", "1.5mo". */
  interval: string;
}

export function toFsrs(card: SerializedFsrsCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days ?? 0,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review === undefined ? undefined : new Date(card.last_review),
  };
}

export function fromFsrs(card: Card): SerializedFsrsCard {
  const out: SerializedFsrsCard = {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as SerializedFsrsCard['state'],
  };
  if (card.last_review) out.last_review = card.last_review.toISOString();
  return out;
}

/** The error ts-fsrs throws for a card it can't schedule; ts-fsrs 5.4.2 doesn't export its class. */
function isRefused(e: unknown): boolean {
  return e instanceof Error && e.name === 'FSRSValidationError';
}

/**
 * Runs ts-fsrs on the card at `now`; a word's first review starts from an empty card (spec §4.2). No card can get
 * stuck (decision 16): a review dated before the card's last one (a clock set back, or another device's clock running
 * ahead) counts as made at that last review, and a stored state ts-fsrs refuses (a damaged import) starts over.
 */
function schedule<T>(card: SerializedFsrsCard | undefined, now: Date, run: (card: Card, at: Date) => T): T {
  if (!card) return run(createEmptyCard(now), now);
  const stored = toFsrs(card);
  const last = stored.last_review?.getTime() ?? Number.NEGATIVE_INFINITY;
  const at = last > now.getTime() ? new Date(last) : now;
  try {
    return run(stored, at);
  } catch (e) {
    if (!isRefused(e)) throw e;
    return run(createEmptyCard(at), at);
  }
}

/** What each rating would do, for the rating buttons (spec §5.5). */
export function ratingOptions(card: SerializedFsrsCard | undefined, now: Date): RatingOption[] {
  return schedule(card, now, (current, at) => {
    const preview = scheduler.repeat(current, at);
    return RATINGS.map(({ grade, label }) => {
      const due = preview[grade].card.due;
      return { grade, label, due, interval: formatInterval(due.getTime() - now.getTime()) };
    });
  });
}

/** The card's new state after a rating at `now` (spec §8). */
export function rate(card: SerializedFsrsCard | undefined, grade: Grade, now: Date): SerializedFsrsCard {
  return schedule(card, now, (current, at) => fromFsrs(scheduler.next(current, at, grade).card));
}
