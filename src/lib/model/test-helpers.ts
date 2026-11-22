import type { ISO, SerializedFsrsCard } from './types';

/** For tests only: a stored ts-fsrs state due at `due` (the shape ts-fsrs 5 writes after a few reviews). */
export function fsrsState(due: ISO, state: SerializedFsrsCard['state'] = 2): SerializedFsrsCard {
  return {
    due,
    stability: 3.17,
    difficulty: 5.28,
    elapsed_days: 0,
    scheduled_days: 3,
    learning_steps: 0,
    reps: 2,
    lapses: 0,
    state,
    last_review: '2026-01-01T00:00:00.000Z',
  };
}
