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
  /** When the card would come back after this rating, as short text: "1m", "10m", "2d", "1.5mo". */
  interval: string;
}

export function toFsrs(card: SerializedFsrsCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
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

/** The card as ts-fsrs schedules it; a word's first review starts from an empty card (spec §4.2). */
function current(card: SerializedFsrsCard | undefined, now: Date): Card {
  return card ? toFsrs(card) : createEmptyCard(now);
}

/** What each rating would do, for the labels on the rating buttons (spec §5.5). */
export function ratingOptions(card: SerializedFsrsCard | undefined, now: Date): RatingOption[] {
  const preview = scheduler.repeat(current(card, now), now);
  return RATINGS.map(({ grade, label }) => ({
    grade,
    label,
    interval: formatInterval(preview[grade].card.due.getTime() - now.getTime()),
  }));
}

/** The card's new state after a rating at `now` (spec §8). */
export function rate(card: SerializedFsrsCard | undefined, grade: Grade, now: Date): SerializedFsrsCard {
  return fromFsrs(scheduler.next(current(card, now), now, grade).card);
}
