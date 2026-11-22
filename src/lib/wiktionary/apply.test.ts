import { describe, expect, it } from 'vitest';
import { emptyDraft } from '../db/words';
import { applyEntry, applyIpaOnly, sameLookupWord } from './apply';
import { parseWordPage } from './parseWord';
import { fixturePage } from './test-fixtures';
import type { LookupResult } from './types';

const FETCHED = '2026-11-21T10:00:00.000Z';

function resultFor(name: string): LookupResult {
  const page = fixturePage(name);
  const { entries } = parseWordPage(page.wikitext, page.html)!;
  return { query: page.title, title: page.title, entries, ipaHanoi: '', ipaSaigon: '', fetchedAt: FETCHED };
}

describe('applyEntry', () => {
  it('fills the lookup fields and leaves the word, notes and lists alone', () => {
    const result = resultFor('thanh-pho');
    const draft = { ...emptyDraft('thành phố'), notes: 'my note', listIds: ['l1'] };
    const { draft: next, note } = applyEntry(draft, result, result.entries[0]!);
    expect(note).toBeNull();
    expect(next).toMatchObject({
      word: 'thành phố',
      notes: 'my note',
      listIds: ['l1'],
      syllables: [
        { text: 'thành', char: '城', gloss: 'city' },
        { text: 'phố', char: '庯', gloss: 'street' },
      ],
      ipaHanoi: '[tʰajŋ̟˨˩ fo˧˦]',
      ipaSaigon: '[tʰan˨˩ fow˦˥]',
      etymology: 'Sino-Vietnamese word from 城庯, composed of 城 (“city”) and 庯 (“street”).',
      audioFile: 'LL-Q9199 (vie)-Penn Zero MSSJ-thành phố.wav',
      source: { wiktionaryTitle: 'thành phố', fetchedAt: FETCHED },
    });
    expect(next.senses[0]).toEqual({ pos: 'Noun', meaning: 'a city' });
  });

  it('switching entries replaces the characters and meanings', () => {
    const result = resultFor('dong');
    const first = applyEntry(emptyDraft('đồng'), result, result.entries[0]!).draft;
    const third = applyEntry(first, result, result.entries[2]!).draft;
    expect(third.syllables).toEqual([{ text: 'đồng', char: '銅', gloss: 'copper' }]);
    expect(third.senses.map((s) => s.meaning)).toContain('copper');
    expect(third.senses.map((s) => s.pos)).not.toContain('Noun (classifier: cánh)');
  });

  it('pairs against the word as typed in the form', () => {
    const result = resultFor('nhap-khau');
    const applied = applyEntry(emptyDraft('xuất nhập khẩu'), result, result.entries[0]!);
    expect(applied.note).toBe('2 characters (入口), 3 syllables — fill in by hand.');
    expect(applied.draft.syllables.every((s) => !s.char)).toBe(true);
  });

  it('keeps one empty meaning row when the entry has none', () => {
    const result = resultFor('nhap-khau');
    const entry = { ...result.entries[0]!, senses: [] };
    expect(applyEntry(emptyDraft('nhập khẩu'), result, entry).draft.senses).toEqual([{ pos: '', meaning: '' }]);
  });
});

describe('applyIpaOnly', () => {
  it('fills IPA and keeps typed IPA where the lookup has none', () => {
    const result: LookupResult = { query: 'x', title: null, entries: [], ipaHanoi: '[a]', ipaSaigon: '', fetchedAt: FETCHED };
    expect(applyIpaOnly({ ...emptyDraft('x'), ipaSaigon: '[typed]' }, result)).toMatchObject({
      ipaHanoi: '[a]',
      ipaSaigon: '[typed]',
    });
  });
});

describe('sameLookupWord', () => {
  it('ignores case, spacing and tone-mark placement', () => {
    expect(sameLookupWord('Văn  hóa', 'văn hoá')).toBe(true);
    expect(sameLookupWord('văn hóa', 'văn hoa')).toBe(false);
  });
});
