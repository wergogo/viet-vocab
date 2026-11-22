import { describe, expect, it } from 'vitest';
import { rebuildSyllables } from '../text/syllables';
import { charactersFromEntry, pairCharacters } from './characters';
import { fixturePage } from './test-fixtures';
import { splitEntries, vietnameseSection, type WikiEntry } from './wikitext';

const entries = (name: string) => splitEntries(vietnameseSection(fixturePage(name).wikitext)!).entries;
const first = (name: string) => charactersFromEntry(entries(name)[0]!);
const entryOf = (text: string): WikiEntry => ({ title: null, text, pos: [] });

describe('charactersFromEntry', () => {
  it('reads whole-word terms without per-character glosses', () => {
    expect(first('nhap-khau')).toEqual({ kind: 'sino', chars: ['入', '口'], glosses: null });
    expect(first('hanh-phuc')).toEqual({ kind: 'sino', chars: ['幸', '福'], glosses: null });
  });

  it('reads per-character terms with their glosses as plain text', () => {
    expect(first('thanh-pho')).toEqual({ kind: 'sino', chars: ['城', '庯'], glosses: ['city', 'street'] });
    expect(first('dien-thoai')).toEqual({ kind: 'sino', chars: ['電', '話'], glosses: ['electric', 'conversation'] });
    expect(first('bac-si')).toEqual({ kind: 'sino', chars: ['博', '士'], glosses: ['wide; vast; broad', '-ist'] });
    expect(first('nhap')).toEqual({ kind: 'sino', chars: ['入'], glosses: ['to enter; to take in'] });
  });

  it('falls back to a CJK headword parameter', () => {
    expect(first('tieng-viet')).toEqual({ kind: 'headword', chars: ['㗂', '越'], glosses: null });
    const dong = entries('dong');
    expect(charactersFromEntry(dong[0]!)).toEqual({ kind: 'headword', chars: ['垌'], glosses: null });
    expect(charactersFromEntry(dong[1]!)).toEqual({
      kind: 'sino',
      chars: ['童'],
      glosses: ['child; servant; (dialectal) shaman'],
    });
    expect(charactersFromEntry(dong[2]!)).toEqual({ kind: 'sino', chars: ['銅'], glosses: ['copper'] });
  });

  it('flags non-Sino-Vietnamese readings', () => {
    expect(charactersFromEntry(entryOf('{{vi-etym-sino|帆|hv=phàm|sail}}'))).toEqual({
      kind: 'reading',
      chars: ['帆'],
      glosses: null,
    });
  });

  it('is null without a source of characters', () => {
    expect(charactersFromEntry(entryOf('From French.'))).toBeNull();
  });
});

describe('pairCharacters', () => {
  it('pairs characters and glosses by position when the counts match', () => {
    const paired = pairCharacters(rebuildSyllables('thành phố'), first('thanh-pho'));
    expect(paired).toEqual({
      syllables: [
        { text: 'thành', char: '城', gloss: 'city' },
        { text: 'phố', char: '庯', gloss: 'street' },
      ],
      note: null,
    });
  });

  it('replaces characters already in the boxes', () => {
    const before = [{ text: 'nhập', char: 'x', gloss: 'old' }, { text: 'khẩu' }];
    expect(pairCharacters(before, first('nhap-khau')).syllables).toEqual([
      { text: 'nhập', char: '入' },
      { text: 'khẩu', char: '口' },
    ]);
  });

  it('leaves the boxes empty with a note when the counts differ', () => {
    expect(pairCharacters(rebuildSyllables('xuất nhập khẩu'), first('nhap-khau'))).toEqual({
      syllables: [{ text: 'xuất' }, { text: 'nhập' }, { text: 'khẩu' }],
      note: '2 characters (入口), 3 syllables — fill in by hand.',
    });
  });

  it('notes headword characters and does not pair readings', () => {
    expect(pairCharacters(rebuildSyllables('tiếng Việt'), first('tieng-viet')).note).toBe(
      '㗂越 comes from the headword and may be chữ Nôm.',
    );
    const reading = pairCharacters(rebuildSyllables('buồm'), { kind: 'reading', chars: ['帆'], glosses: null });
    expect(reading.syllables).toEqual([{ text: 'buồm' }]);
    expect(reading.note).toContain('帆');
  });

  it('clears the boxes when nothing was found', () => {
    expect(pairCharacters([{ text: 'xin', char: '?' }], null)).toEqual({ syllables: [{ text: 'xin' }], note: null });
  });
});
