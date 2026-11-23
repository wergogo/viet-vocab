import { RecordNotFoundError } from '../db/errors';
import { cardId } from '../model/ids';
import type { Direction, ReviewCard, SerializedFsrsCard } from '../model/types';
import { rate, ratingOptions, type Grade, type RatingOption } from './fsrs';
import type { QueueItem } from './queue';

export interface SessionDeps {
  /**
   * The first card of the queue built over `cards` at this moment, or null when nothing waits. The session always
   * passes its current `cards`, so the screen may use a queue it has already built over them.
   */
  next: (cards: readonly ReviewCard[]) => QueueItem | null;
  /** Stores a rating (db/cards.ts saveReview). */
  save: (wordId: string, direction: Direction, fsrs: SerializedFsrsCard, reviewedAt: Date) => Promise<unknown>;
  /** Plays the word. Called inside the tap that shows it, since phones allow sound only then. */
  pronounce: (item: QueueItem) => void;
  /** Whether review plays each word (the per-device autoplay setting). */
  autoplay: () => boolean;
  now: () => Date;
  /** Holds automatic syncs while the session runs (M4 decision 11); returns the release. */
  holdSync: () => () => void;
}

export type Phase = 'start' | 'card' | 'done';

/**
 * A review session (spec §5.5), apart from the screen so it can be tested (M4 decision 12). It keeps its own copy of
 * the cards: a rating updates the copy at once and saves in the background, so the next card appears within the tap.
 */
export class ReviewSession {
  phase = $state<Phase>('start');
  /** The cards as this session knows them, or null before it starts: the stored ones plus every rating made. */
  cards = $state.raw<ReviewCard[] | null>(null);
  current = $state.raw<QueueItem | null>(null);
  revealed = $state(false);
  options = $state.raw<RatingOption[]>([]);
  /** When the answer was shown, which the rating buttons' due times count from. */
  revealedAt = $state.raw(new Date(0));
  reviewed = $state(0);
  saveError = $state('');

  readonly #deps: SessionDeps;
  /** Cards rated in this session: the session's copy of each is the newest. */
  readonly #rated = new Set<string>();
  #release: (() => void) | null = null;

  constructor(deps: SessionDeps) {
    this.#deps = deps;
  }

  /** Starts (or restarts) a session over the stored cards. */
  start(stored: readonly ReviewCard[]): void {
    this.cards = [...stored];
    this.#rated.clear();
    this.reviewed = 0;
    this.saveError = '';
    this.#release ??= this.#deps.holdSync();
    this.#show(this.#deps.next(this.cards));
  }

  reveal(): void {
    const item = this.current;
    if (this.phase !== 'card' || !item || this.revealed) return;
    this.revealed = true;
    this.revealedAt = this.#deps.now();
    this.options = ratingOptions(item.card?.fsrs, this.revealedAt);
    if (item.direction === 'reverse') this.#say(item);
  }

  rate(grade: Grade): void {
    const item = this.current;
    if (this.phase !== 'card' || !item || !this.revealed) return;
    const at = this.#deps.now();
    const fsrs = rate(item.card?.fsrs, grade, at);
    const id = cardId(item.word.id, item.direction);
    const card: ReviewCard = {
      id,
      wordId: item.word.id,
      direction: item.direction,
      fsrs,
      introducedAt: item.card?.introducedAt ?? at.toISOString(),
      updatedAt: at.toISOString(),
    };
    this.cards = [...(this.cards ?? []).filter((c) => c.id !== id), card];
    this.#rated.add(id);
    this.reviewed++;
    this.#deps.save(item.word.id, item.direction, fsrs, at).catch((e: unknown) => {
      // A word deleted meanwhile (another tab, a sync) simply leaves the queue.
      if (e instanceof RecordNotFoundError) return;
      console.error(e);
      this.saveError = `Couldn't save the review of “${item.word.word}”. Your other reviews are saved.`;
    });
    this.#show(this.#deps.next(this.cards));
  }

  /**
   * Takes in cards stored meanwhile, by a sync or another tab, when they are newer than the session's copy, or have the
   * same time but another review state (a merge tie applies the remote copy, M4 decision 7). Cards rated
   * in this session are skipped: their stored copy is the session's own rating, stamped a little later (roadmap M4).
   * When the card on screen is one of them, it was reviewed on another device meanwhile, so a rating made from its old
   * state would undo that review (M4 decision 12). Before the answer shows, the session moves to the next card; after,
   * the rating options come from the new state. Either way nothing plays, since no tap asked for it.
   */
  mergeStored(stored: readonly ReviewCard[]): void {
    if (!this.cards) return;
    const byId = new Map(this.cards.map((c) => [c.id, c]));
    const changed = new Set<string>();
    for (const card of stored) {
      if (this.#rated.has(card.id)) continue;
      const mine = byId.get(card.id);
      if (mine && mine.updatedAt >= card.updatedAt) {
        // Cheap on purpose: every unchanged card ties on every emission, so whole cards aren't compared.
        const tied = mine.updatedAt === card.updatedAt;
        if (!tied || (card.fsrs.reps === mine.fsrs.reps && card.fsrs.due === mine.fsrs.due)) continue;
      }
      byId.set(card.id, card);
      changed.add(card.id);
    }
    if (changed.size === 0) return;
    this.cards = [...byId.values()];
    const item = this.current;
    const id = item && cardId(item.word.id, item.direction);
    if (this.phase !== 'card' || !item || !id || !changed.has(id)) return;
    if (!this.revealed) {
      this.#show(this.#deps.next(this.cards), false);
      return;
    }
    const card = byId.get(id)!;
    this.current = { ...item, card };
    this.revealedAt = this.#deps.now();
    this.options = ratingOptions(card.fsrs, this.revealedAt);
  }

  /** Ends the hold on sync when the screen closes mid-session. */
  stop(): void {
    this.#release?.();
    this.#release = null;
  }

  #show(item: QueueItem | null, sound = true): void {
    this.current = item;
    this.revealed = false;
    this.options = [];
    if (!item) {
      this.phase = 'done';
      this.stop();
      return;
    }
    this.phase = 'card';
    if (sound && item.direction === 'forward') this.#say(item);
  }

  #say(item: QueueItem): void {
    if (this.#deps.autoplay()) this.#deps.pronounce(item);
  }
}
