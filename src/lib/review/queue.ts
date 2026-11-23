import { startOfLocalDay } from '../model/dates';
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
  /** Live words, in any order. */
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

/** A reviewed card and its stored due time. */
interface Scheduled {
  item: QueueItem;
  due: string;
}

/** Oldest word first, and a word's forward card before its reverse card (spec §5.5: the order words were added). */
function byAdded(a: QueueItem, b: QueueItem): number {
  if (a.word.createdAt !== b.word.createdAt) return a.word.createdAt < b.word.createdAt ? -1 : 1;
  if (a.word.id !== b.word.id) return a.word.id < b.word.id ? -1 : 1;
  return a.direction === b.direction ? 0 : a.direction === 'forward' ? -1 : 1;
}

/** Earliest due first, then in word order. */
function byDue(a: Scheduled, b: Scheduled): number {
  return a.due < b.due ? -1 : a.due > b.due ? 1 : byAdded(a.item, b.item);
}

/** A reverse card shows the meanings, so its word needs at least one with text (decision 5). */
function hasMeaning(word: Word): boolean {
  return word.senses.some((s) => s.meaning !== '');
}

/** Takes from both lists in turn, starting with the first, then the rest of the longer one. */
function alternate<T>(first: readonly T[], second: readonly T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(first.length, second.length); i++) {
    if (i < first.length) out.push(first[i]!);
    if (i < second.length) out.push(second[i]!);
  }
  return out;
}

/**
 * Builds the review queue at `now` (spec §5.5). Pure, so the screen can rebuild it after every rating. That happens
 * inside a tap, so it stays quick at 10,000 words (spec §14): it compares stored times as text instead of reading a date
 * from every card (they are canonical ISO text, which `parseFile` checks and which sorts in time order), and it sorts
 * only the cards it may show, not every word.
 */
export function buildQueue({ words, cards, settings, now, listId }: QueueInput): Queue {
  const nowIso = now.toISOString();
  const soonIso = new Date(now.getTime() + LEARN_AHEAD_MS).toISOString();
  // A card introduced from local midnight today until tomorrow's was introduced today (spec §5.5, local time).
  const todayStart = startOfLocalDay(now).toISOString();
  const tomorrowStart = startOfLocalDay(now, 1).toISOString();
  const introducedToday = (card: ReviewCard | undefined) =>
    card !== undefined && card.introducedAt >= todayStart && card.introducedAt < tomorrowStart;

  const forwardOf = new Map<string, ReviewCard>();
  const reverseOf = new Map<string, ReviewCard>();
  for (const card of cards) (card.direction === 'forward' ? forwardOf : reverseOf).set(card.wordId, card);

  // The allowance counts every card introduced today, whatever list its word is in (decision 4).
  let forwardToday = 0;
  let reverseToday = 0;
  for (const word of words) {
    if (introducedToday(forwardOf.get(word.id))) forwardToday++;
    if (introducedToday(reverseOf.get(word.id))) reverseToday++;
  }
  const allowance = Math.max(0, settings.newCardsPerDay - forwardToday - reverseToday);

  const scoped = listId === undefined ? words : words.filter((w) => w.listIds.includes(listId));
  const scheduled: Scheduled[] = [];
  const newForward: QueueItem[] = [];
  const newReverse: QueueItem[] = [];
  for (const word of scoped) {
    const forward = forwardOf.get(word.id);
    if (forward) scheduled.push({ item: { word, direction: 'forward', card: forward }, due: forward.fsrs.due });
    else newForward.push({ word, direction: 'forward' });
    if (!settings.reverseCards || !hasMeaning(word)) continue;
    const reverse = reverseOf.get(word.id);
    if (reverse) scheduled.push({ item: { word, direction: 'reverse', card: reverse }, due: reverse.fsrs.due });
    // A reverse card is first shown no earlier than the day after its forward card was introduced (spec §5.5).
    else if (forward && forward.introducedAt < todayStart) newReverse.push({ word, direction: 'reverse' });
  }

  const due = scheduled.filter((s) => s.due <= nowIso).sort(byDue);
  const later = scheduled.filter((s) => s.due > nowIso);
  const soon = later.filter((s) => s.due <= soonIso).sort(byDue);
  const nextDue = later.reduce<string | null>((min, s) => (min === null || s.due < min ? s.due : min), null);
  // New words and reverse cards take turns (decision 15). The queue is rebuilt after every rating, so the turn comes
  // from today's introductions: reverse cards go first while fewer of them than new words were introduced today.
  newForward.sort(byAdded);
  newReverse.sort(byAdded);
  const fresh = reverseToday < forwardToday ? alternate(newReverse, newForward) : alternate(newForward, newReverse);
  const newItems = fresh.slice(0, allowance);
  const waiting = [...due.map((s) => s.item), ...newItems];
  return {
    items: waiting.length > 0 ? waiting : soon.map((s) => s.item),
    due: due.length,
    newToday: newItems.length,
    newLater: fresh.length - newItems.length,
    nextDue: nextDue === null ? null : new Date(nextDue),
  };
}
