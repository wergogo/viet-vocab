import { expect } from 'vitest';
import { db } from './db';
import { deriveFields, fromRow, isLiveRow } from './derive';

/** Asserts every live word row carries derived fields that match its current content. */
export async function expectDerivedFieldsFresh(): Promise<void> {
  for (const row of await db.words.toArray()) {
    if (!isLiveRow(row)) continue;
    const { searchLoose, searchExact, chars } = row;
    expect({ searchLoose, searchExact, chars }).toEqual(deriveFields(fromRow(row)));
  }
}
