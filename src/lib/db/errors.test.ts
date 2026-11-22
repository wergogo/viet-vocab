import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb } from './db';
import { RecordNotFoundError } from './errors';
import { createList, deleteList, renameList } from './lists';
import { createWord, deleteWord, emptyDraft, updateWord } from './words';

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
});

describe('RecordNotFoundError', () => {
  it('is thrown when updating a deleted or unknown word', async () => {
    await expect(updateWord('nope', emptyDraft('x'))).rejects.toBeInstanceOf(RecordNotFoundError);
    const word = await createWord(emptyDraft('xin chào'));
    await deleteWord(word.id);
    await expect(updateWord(word.id, emptyDraft('xin chào'))).rejects.toBeInstanceOf(RecordNotFoundError);
  });

  it('is thrown when renaming a deleted or unknown list', async () => {
    await expect(renameList('nope', 'X')).rejects.toBeInstanceOf(RecordNotFoundError);
    const list = await createList('Economy');
    await deleteList(list.id);
    await expect(renameList(list.id, 'Other')).rejects.toBeInstanceOf(RecordNotFoundError);
  });
});
