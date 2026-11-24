import { beforeEach, describe, expect, it } from 'vitest';
import { parseFile, serializeFile } from '../model/file';
import { nowIso } from '../model/ids';
import { rate, RATINGS } from '../review/fsrs';
import { applyEntry } from '../wiktionary/apply';
import { parseWordPage } from '../wiktionary/parseWord';
import { fixturePage } from '../wiktionary/test-fixtures';
import type { LookupResult } from '../wiktionary/types';
import { saveReview } from './cards';
import { rederiveIfNeeded, resetDb } from './db';
import { createList, deleteList, findOrCreateList, renameList } from './lists';
import { saveSettings } from './settings';
import { exportJson, importJson, readLocalData } from './snapshot';
import { expectDerivedFieldsFresh } from './test-utils';
import { createWord, deleteWord, draftFromWord, emptyDraft, updateWord, type WordDraft } from './words';

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
});

/** Every kind of write the app makes, lookup-filled words, reviews, settings and deletions included. */
async function writeEverything() {
  const economy = await createList('Kinh tế');
  await findOrCreateList('KINH TẾ');
  await renameList(economy.id, 'Kinh tế học');
  const temporary = await createList('Tạm');

  const page = fixturePage('thanh-pho');
  const { entries } = parseWordPage(page.wikitext, page.html)!;
  const result: LookupResult = { query: 'thành phố', title: page.title, entries, ipaHanoi: '', ipaSaigon: '', fetchedAt: nowIso() };
  const filled: WordDraft = {
    ...applyEntry(emptyDraft('thành phố'), result, entries[0]!).draft,
    notes: 'line 1\nline 2',
    listIds: [economy.id, temporary.id, economy.id],
  };
  const city = await createWord(filled);
  const bare = await createWord({ ...emptyDraft('xin chào'), senses: [] });

  // Regional words (M6): one filled from a lookup, one from a messy draft, and one whose regions are cleared again.
  const trainPage = fixturePage('xe-lua');
  const trainEntries = parseWordPage(trainPage.wikitext, trainPage.html)!.entries;
  const trainResult: LookupResult = { ...result, query: 'xe lửa', title: trainPage.title, entries: trainEntries };
  const train = await createWord(applyEntry(emptyDraft('xe lửa'), trainResult, trainEntries[0]!).draft);
  const pig = await createWord({
    ...emptyDraft('heo'),
    regions: ['south', 'central', 'south'],
    equivalents: [
      { word: ' lợn ', regions: ['north', 'north'] },
      { word: '', regions: ['south'] },
      { word: 'Heo', regions: [] },
      { word: 'lợn', regions: [] },
      { word: 'cúi', regions: [] },
    ],
  });
  const bowl = await createWord({ ...emptyDraft('bát'), regions: ['north'], equivalents: [{ word: 'chén', regions: ['south'] }] });
  await updateWord(bowl.id, { ...draftFromWord(bowl), regions: [], equivalents: [] });
  await updateWord(city.id, { ...draftFromWord(city), syllables: [{ text: 'thành', char: '' }, { text: 'phố' }] });
  await saveSettings({ newCardsPerDay: 7, reverseCards: true });
  const good = RATINGS[2]!.grade;
  const now = new Date();
  for (const id of [city.id, bare.id]) await saveReview(id, 'forward', rate(undefined, good, now), now);
  await saveReview(city.id, 'reverse', rate(undefined, good, now), now);
  await deleteList(temporary.id);
  await deleteWord(bare.id);
  return { city, audioFile: entries[0]!.audioFile, train, pig, bowl };
}

// parseFile enforces the shapes the app writes (M1 final review), and a sync file that fails it would stop loading on
// every device. Extend this when a milestone adds a write path.
describe('write paths', () => {
  it('everything the app writes, lookup-filled words, reviews and settings included, passes parseFile', async () => {
    const { city, audioFile, train, pig, bowl } = await writeEverything();
    const withTombstones = await readLocalData(true);
    expect(withTombstones.words.some((w) => w.deleted === true)).toBe(true);
    expect(withTombstones.cards.filter((c) => c.deleted === true)).toHaveLength(1);
    expect(withTombstones.settings).toMatchObject({ newCardsPerDay: 7, reverseCards: true });
    expect(() => parseFile(serializeFile(withTombstones, nowIso()))).not.toThrow();
    const exported = parseFile(await exportJson());
    expect(exported.words.find((w) => w.id === city.id)).toMatchObject({ audioFile, source: { wiktionaryTitle: 'thành phố' } });
    const byId = (id: string) => exported.words.find((w) => w.id === id);
    expect(byId(train.id)).toMatchObject({ regions: ['south'], equivalents: [{ word: 'tàu hoả', regions: ['north'] }] });
    expect(byId(pig.id)).toMatchObject({
      regions: ['central', 'south'],
      equivalents: [{ word: 'lợn', regions: ['north'] }, { word: 'cúi' }],
    });
    expect(byId(bowl.id)).not.toHaveProperty('regions');
    expect(byId(bowl.id)).not.toHaveProperty('equivalents');
  });

  it('comes back the same through export, import and a forced re-derive, and the sync file holds only synced data', async () => {
    await writeEverything();
    const exported = await exportJson();
    const syncFile = serializeFile(await readLocalData(true), nowIso());
    // The lookup cache and derived search keys stay on the device (spec §4.3).
    expect(Object.keys(JSON.parse(syncFile) as object)).toEqual(['app', 'schemaVersion', 'savedAt', 'words', 'lists', 'cards', 'settings']);
    expect(syncFile).not.toContain('searchLoose');

    await resetDb();
    await importJson(exported);
    localStorage.removeItem('vv.derive.version');
    expect(await rederiveIfNeeded()).toBe(true);
    await expectDerivedFieldsFresh();
    expect(parseFile(await exportJson()).words).toEqual(parseFile(exported).words);

    await importJson(syncFile);
    expect(serializeFile(await readLocalData(true), 'same time')).toBe(serializeFile(parseFile(syncFile), 'same time'));
  });
});
