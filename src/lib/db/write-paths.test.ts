import { beforeEach, describe, expect, it } from 'vitest';
import { parseFile, serializeFile } from '../model/file';
import { nowIso } from '../model/ids';
import { applyEntry } from '../wiktionary/apply';
import { parseWordPage } from '../wiktionary/parseWord';
import { fixturePage } from '../wiktionary/test-fixtures';
import type { LookupResult } from '../wiktionary/types';
import { resetDb } from './db';
import { createList, deleteList, findOrCreateList, renameList } from './lists';
import { exportJson, readLocalData } from './snapshot';
import { createWord, deleteWord, draftFromWord, emptyDraft, updateWord, type WordDraft } from './words';

beforeEach(async () => {
  await resetDb();
  localStorage.clear();
});

// parseFile enforces the shapes the app writes (M1 final review). Extend this when a milestone adds a write path.
describe('write paths', () => {
  it('everything the app writes, lookup-filled words included, passes parseFile', async () => {
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
    await updateWord(city.id, { ...draftFromWord(city), syllables: [{ text: 'thành', char: '' }, { text: 'phố' }] });
    await deleteList(temporary.id);
    await deleteWord(bare.id);

    const withTombstones = await readLocalData(true);
    expect(withTombstones.words.some((w) => w.deleted === true)).toBe(true);
    expect(() => parseFile(serializeFile(withTombstones, nowIso()))).not.toThrow();
    const exported = parseFile(await exportJson());
    expect(exported.words.find((w) => w.id === city.id)).toMatchObject({
      audioFile: entries[0]!.audioFile,
      source: { wiktionaryTitle: 'thành phố' },
    });
  });
});
