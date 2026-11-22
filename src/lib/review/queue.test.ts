import { describe, expect, it } from 'vitest';
import { fsrsState } from '../model/test-helpers';
import type { Direction, ReviewCard, ReviewSettings, Word } from '../model/types';
import { buildQueue, type QueueInput } from './queue';

// Local times, so "today" is the same calendar day in every time zone the tests run in.
const NOW = new Date(2026, 10, 22, 12, 0);
const at = (hours: number, minutes = 0) => new Date(2026, 10, 22, hours, minutes).toISOString();
const YESTERDAY = new Date(2026, 10, 21, 20, 0).toISOString();

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
  const id = `${wordId}:${direction === 'forward' ? 'f' : 'r'}`;
  return { id, wordId, direction, fsrs: fsrsState(due), introducedAt, updatedAt: introducedAt };
}

const settings: ReviewSettings = { newCardsPerDay: 20, reverseCards: false };
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

  it('reviews one list when asked', () => {
    const words = [word('a', 1, { listIds: ['l'] }), word('b', 2)];
    const cards = [card('b', at(9))];
    expect(ids({ words, cards, listId: 'l' })).toEqual(['a:f']);
  });

  it('starts reverse cards the day after the forward card, only for words with meanings', () => {
    const words = [word('a', 1), word('b', 2), word('c', 3, { senses: [] }), word('d', 4)];
    const cards = [card('a', at(20), YESTERDAY), card('b', at(20), at(8)), card('c', at(20), YESTERDAY)];
    const reverseOn = { ...settings, reverseCards: true };
    expect(ids({ words, cards, settings: reverseOn })).toEqual(['a:r', 'd:f']);
    expect(ids({ words, cards })).toEqual(['d:f']);
  });

  it('leaves reverse cards out while reverse cards are off', () => {
    const words = [word('a', 1)];
    const cards = [card('a', at(20)), card('a', at(9), YESTERDAY, 'reverse')];
    expect(ids({ words, cards })).toEqual([]);
    expect(ids({ words, cards, settings: { ...settings, reverseCards: true } })).toEqual(['a:r']);
  });

  it('shows cards due within 20 minutes early, but only when nothing else is waiting', () => {
    const words = [word('a', 1), word('b', 2), word('c', 3)];
    const learning = [card('a', at(12, 15), at(11)), card('b', at(12, 5), at(11)), card('c', at(12, 30), at(11))];
    expect(ids({ words, cards: learning })).toEqual(['b:f', 'a:f']);
    expect(queue({ words, cards: learning })).toMatchObject({ due: 0, newToday: 0 });
    const withNew = [...words, word('d', 4)];
    expect(ids({ words: withNew, cards: learning })).toEqual(['d:f']);
  });

  it('ignores cards of words that are gone', () => {
    expect(ids({ words: [word('a', 1)], cards: [card('gone', at(9)), card('a', at(10))] })).toEqual(['a:f']);
  });
});
