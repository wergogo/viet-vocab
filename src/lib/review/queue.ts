import { localDate, localDateOf } from '../model/dates';
import type { Direction, ReviewCard, ReviewSettings, Word } from '../model/types';

/** Cards due within this long are shown early when nothing else is waiting (spec §5.5). */
export const LEARN_AHEAD_MS = 20 * 60_000;

export interface QueueItem {
  word: Word;
  direction: Direction;
  /** The stored card; absent for a card the user hasn't reviewed yet (a new card, spec §4.2). */
  card?: ReviewCard;
}

export interface QueueInput {
  /** Live words. */
  words: readonly Word[];
  /** Live cards. Cards of words that aren't live are ignored (spec §4.2 references). */
  cards: readonly ReviewCard[];
  settings: ReviewSettings;
  now: Date;
  /** Review only this list's words; all words when absent (spec §5.5). */
  listId?: string;
}

export interface Queue {
  /** What to review now, in order: due cards, then new cards, or cards due soon when nothing else waits. */
  items: QueueItem[];
  /** Cards due now. */
  due: number;
  /** New cards that today's allowance still covers. */
  newToday: number;
  /** New cards beyond today's allowance. */
  newLater: number;
  /** When the earliest card that isn't due yet comes due, or null when there is none. */
  nextDue: Date | null;
}

/** Due-time order, keeping word order for equal times. */
interface Timed {
  item: QueueItem;
  at: number;
}

const key = (wordId: string, direction: Direction) => `${wordId}:${direction}`;

/** Oldest word first: new cards come in the order the words were added (spec §5.5). */
function byAdded(a: Word, b: Word): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** A reverse card is first shown no earlier than the day after its forward card was introduced (spec §5.5). */
function reverseReady(forward: ReviewCard | undefined, today: string): boolean {
  return forward !== undefined && localDateOf(forward.introducedAt) < today;
}

/** Builds the review queue at `now` (spec §5.5). Pure, so the screen can rebuild it after every rating. */
export function buildQueue({ words, cards, settings, now, listId }: QueueInput): Queue {
  const today = localDate(now);
  const nowMs = now.getTime();
  const liveIds = new Set(words.map((w) => w.id));
  const cardOf = new Map<string, ReviewCard>();
  for (const card of cards) if (liveIds.has(card.wordId)) cardOf.set(key(card.wordId, card.direction), card);

  // The allowance counts every card introduced today, whatever list it belongs to.
  let introducedToday = 0;
  for (const card of cardOf.values()) if (localDateOf(card.introducedAt) === today) introducedToday++;
  const allowance = Math.max(0, settings.newCardsPerDay - introducedToday);

  const scoped = listId === undefined ? [...words] : words.filter((w) => w.listIds.includes(listId));
  const directions: Direction[] = settings.reverseCards ? ['forward', 'reverse'] : ['forward'];
  const due: Timed[] = [];
  const soon: Timed[] = [];
  const fresh: QueueItem[] = [];
  let nextDue = Number.POSITIVE_INFINITY;

  for (const word of scoped.sort(byAdded)) {
    for (const direction of directions) {
      // A reverse card shows the meanings, so a word without any has nothing to ask.
      if (direction === 'reverse' && word.senses.length === 0) continue;
      const card = cardOf.get(key(word.id, direction));
      if (!card) {
        if (direction === 'forward' || reverseReady(cardOf.get(key(word.id, 'forward')), today)) {
          fresh.push({ word, direction });
        }
        continue;
      }
      const at = Date.parse(card.fsrs.due);
      if (at <= nowMs) {
        due.push({ item: { word, direction, card }, at });
      } else {
        nextDue = Math.min(nextDue, at);
        if (at - nowMs <= LEARN_AHEAD_MS) soon.push({ item: { word, direction, card }, at });
      }
    }
  }

  const byTime = (a: Timed, b: Timed) => a.at - b.at;
  const newItems = fresh.slice(0, allowance);
  const waiting = [...due.sort(byTime).map((t) => t.item), ...newItems];
  return {
    items: waiting.length > 0 ? waiting : soon.sort(byTime).map((t) => t.item),
    due: due.length,
    newToday: newItems.length,
    newLater: fresh.length - newItems.length,
    nextDue: Number.isFinite(nextDue) ? new Date(nextDue) : null,
  };
}
