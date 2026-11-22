import { describe, expect, it } from 'vitest';
import { cardId } from '../model/ids';
import { fsrsState } from '../model/test-helpers';
import type { Direction, ReviewCard, ReviewSettings, Word } from '../model/types';
import { buildQueue, type QueueInput } from './queue';

// Local times, so "today" is the same calendar day in every time zone the tests run in.
const NOW = new Date(2026, 10, 22, 12, 0);
const at = (hours: number, minutes = 0) => new Date(2026, 10, 22, hours, minutes).toISOString();
// Late yesterday in local time, which in the tests' zone (UTC−3:30) is already today in UTC.
const YESTERDAY = new Date(2026, 10, 21, 23, 0).toISOString();

function word(id: string, added: number, extra: Partial<Word> = {}): Word {
  return {
    id,
    word: id,
    syllables: [{ text: id }],
    senses: [{ pos: 'Noun', meaning: `meaning of ${id}` }],
    listIds: [],
    createdAt: new Date(2026, 0, added).toISOString(),
    updatedAt: new Date(2026, 0, added).toISOString(),
    ...extra,
  };
}

function card(wordId: string, due: string, introducedAt = YESTERDAY, direction: Direction = 'forward'): ReviewCard {
  return { id: cardId(wordId, direction), wordId, direction, fsrs: fsrsState(due), introducedAt, updatedAt: introducedAt };
}

const settings: ReviewSettings = { newCardsPerDay: 20, reverseCards: false };
const reverseOn: ReviewSettings = { ...settings, reverseCards: true };
const queue = (over: Partial<QueueInput>) => buildQueue({ words: [], cards: [], settings, now: NOW, ...over });
const ids = (input: Partial<QueueInput>) => queue(input).items.map((i) => `${i.word.id}:${i.direction[0]}`);

describe('buildQueue', () => {
  it('puts due cards first, earliest due first, then new cards in the order the words were added', () => {
    const words = [word('c', 3), word('a', 1), word('d', 4), word('b', 2), word('e', 5)];
    const cards = [card('c', at(11)), card('a', at(9)), card('d', at(13))];
    expect(ids({ words, cards })).toEqual(['a:f', 'c:f', 'b:f', 'e:f']);
    expect(queue({ words, cards })).toMatchObject({ due: 2, newToday: 2, newLater: 0 });
    expect(queue({ words, cards }).nextDue).toEqual(new Date(at(13)));
  });

  it('limits new cards to the allowance left after the cards introduced today', () => {
    const words = [word('a', 1), word('b', 2), word('c', 3), word('d', 4), word('e', 5)];
    const cards = [card('a', at(20), at(8))];
    const limited = queue({ words, cards, settings: { ...settings, newCardsPerDay: 3 } });
    expect(limited.items.map((i) => i.word.id)).toEqual(['b', 'c']);
    expect(limited).toMatchObject({ newToday: 2, newLater: 2 });
    expect(queue({ words, cards, settings: { ...settings, newCardsPerDay: 0 } }).items).toEqual([]);
  });

  it('counts cards introduced today in any list toward the allowance', () => {
    const words = [word('a', 1, { listIds: ['other'] }), word('b', 2, { listIds: ['l'] }), word('c', 3, { listIds: ['l'] })];
    const cards = [card('a', at(20), at(9))];
    expect(ids({ words, cards, listId: 'l', settings: { ...settings, newCardsPerDay: 2 } })).toEqual(['b:f']);
  });

  it('counts the allowance and the reverse-card delay in local days', () => {
    const words = [word('a', 1), word('b', 2), word('c', 3)];
    const beforeMidnight = new Date(2026, 10, 21, 23, 59).toISOString();
    const afterMidnight = new Date(2026, 10, 22, 0, 1).toISOString();
    const cards = [card('a', at(20), beforeMidnight), card('b', at(20), afterMidnight)];
    // Only b's card was introduced today, and only a's reverse card is ready.
    expect(ids({ words, cards, settings: { newCardsPerDay: 3, reverseCards: true } })).toEqual(['c:f', 'a:r']);
    expect(queue({ words, cards, settings: { newCardsPerDay: 1, reverseCards: true } })).toMatchObject({
      newToday: 0,
      newLater: 2,
    });
  });

  it('reviews one list when asked', () => {
    const words = [word('a', 1, { listIds: ['l'] }), word('b', 2)];
    const cards = [card('b', at(9))];
    expect(ids({ words, cards, listId: 'l' })).toEqual(['a:f']);
  });

  it('starts reverse cards the day after the forward card, only for words with a meaning', () => {
    const words = [word('a', 1), word('b', 2), word('c', 3, { senses: [{ pos: 'Noun', meaning: '' }] }), word('d', 4)];
    const cards = [card('a', at(20), YESTERDAY), card('b', at(20), at(8)), card('c', at(20), YESTERDAY)];
    expect(ids({ words, cards, settings: reverseOn })).toEqual(['d:f', 'a:r']);
    expect(ids({ words, cards })).toEqual(['d:f']);
  });

  it('lets new words and reverse cards take turns, so reverse cards never hold back new words', () => {
    const learned = [word('a', 1), word('b', 2), word('c', 3)];
    const unseen = [word('d', 4), word('e', 5), word('f', 6)];
    const cards = learned.map((w) => card(w.id, at(20)));
    const input = { words: [...learned, ...unseen], cards, settings: { newCardsPerDay: 4, reverseCards: true } };
    expect(ids(input)).toEqual(['d:f', 'a:r', 'e:f', 'b:r']);
    expect(queue(input)).toMatchObject({ newToday: 4, newLater: 2 });
  });

  it('leaves reverse cards out while reverse cards are off', () => {
    const words = [word('a', 1)];
    const cards = [card('a', at(20)), card('a', at(9), YESTERDAY, 'reverse')];
    expect(ids({ words, cards })).toEqual([]);
    expect(ids({ words, cards, settings: reverseOn })).toEqual(['a:r']);
  });

  it('shows cards due within 20 minutes early, but only when nothing else is waiting', () => {
    const words = [word('a', 1), word('b', 2), word('c', 3)];
    const learning = [card('a', at(12, 15), at(11)), card('b', at(12, 5), at(11)), card('c', at(12, 30), at(11))];
    expect(ids({ words, cards: learning })).toEqual(['b:f', 'a:f']);
    expect(queue({ words, cards: learning })).toMatchObject({ due: 0, newToday: 0 });
    const withNew = [...words, word('d', 4)];
    expect(ids({ words: withNew, cards: learning })).toEqual(['d:f']);
  });

  it('has no next due time when no card waits for a later time', () => {
    expect(queue({ words: [word('a', 1)] }).nextDue).toBeNull();
    expect(queue({ words: [word('a', 1)], cards: [card('a', at(9))] }).nextDue).toBeNull();
  });

  it('ignores cards of words that are gone', () => {
    expect(ids({ words: [word('a', 1)], cards: [card('gone', at(9)), card('a', at(10))] })).toEqual(['a:f']);
  });
});
