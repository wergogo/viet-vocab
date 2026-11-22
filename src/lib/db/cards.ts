import { cardId, nextTimestamp } from '../model/ids';
import { isLive, type Direction, type ReviewCard, type SerializedFsrsCard } from '../model/types';
import { db } from './db';
import { isLiveRow } from './derive';
import { markDirty } from './dirty';
import { RecordNotFoundError } from './errors';

export async function listLiveCards(): Promise<ReviewCard[]> {
  return (await db.cards.toArray()).filter(isLive);
}

/**
 * Saves a review: the card's new ts-fsrs state with a new updatedAt, plus introducedAt on its first review (spec §8).
 * A card recreated over its tombstone has the same id, so it is stamped after the tombstone and wins the merge.
 * Throws RecordNotFoundError when the word was deleted meanwhile (another tab, or a sync).
 */
export async function saveReview(
  wordId: string,
  direction: Direction,
  fsrs: SerializedFsrsCard,
  reviewedAt: Date,
): Promise<ReviewCard> {
  const card = await db.transaction('rw', db.words, db.cards, async () => {
    const word = await db.words.get(wordId);
    if (!word || !isLiveRow(word)) throw new RecordNotFoundError(`Word ${wordId} not found`);
    const id = cardId(wordId, direction);
    const existing = await db.cards.get(id);
    const saved: ReviewCard = {
      id,
      wordId,
      direction,
      fsrs,
      introducedAt: existing && isLive(existing) ? existing.introducedAt : reviewedAt.toISOString(),
      updatedAt: nextTimestamp(existing?.updatedAt),
    };
    await db.cards.put(saved);
    return saved;
  });
  markDirty();
  return card;
}
