import { describe, expect, it } from 'vitest';
import { fixturePage } from './test-fixtures';
import { audioFileIn, splitEntries, stubTarget, vietnameseSection } from './wikitext';

const section = (name: string) => vietnameseSection(fixturePage(name).wikitext)!;

describe('vietnameseSection', () => {
  it('cuts the Vietnamese section, even after other languages', () => {
    expect(section('nhap-khau').trim().startsWith('===Etymology===')).toBe(true);
    const dong = section('dong');
    expect(dong).toContain('===Etymology 4===');
    expect(dong).not.toContain('Hungarian');
    expect(dong).not.toContain('==English==');
  });

  it('returns null when there is no Vietnamese section', () => {
    expect(vietnameseSection('==English==\n===Noun===\n# a thing\n')).toBeNull();
  });
});

describe('splitEntries', () => {
  it('keeps a page without numbered etymologies as one entry', () => {
    const { shared, entries } = splitEntries(section('nhap-khau'));
    expect(shared).toBe('');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.pos.map((p) => [p.name, p.headword?.name])).toEqual([['Verb', 'vi-verb']]);
    expect(splitEntries(section('quoc-gia')).entries[0]!.pos.map((p) => p.name)).toEqual(['Noun', 'Adjective']);
  });

  it('splits numbered etymologies and keeps the shared pronunciation apart', () => {
    const { shared, entries } = splitEntries(section('dong'));
    expect(shared).toContain('{{vi-IPA}}');
    expect(entries).toHaveLength(4);
    expect(entries[0]!.pos[0]).toMatchObject({ name: 'Noun', headword: { positional: ['垌'], named: { cls: 'cánh' } } });
    expect(entries[2]!.text).toContain('{{vi-etym-sino|銅|[[copper]]}}');
    expect(entries[3]!.pos.map((p) => p.name)).toEqual(['Romanization']);
  });
});

describe('audioFileIn', () => {
  it('returns the first Vietnamese audio file', () => {
    expect(audioFileIn(section('quoc-gia'))).toBe('LL-Q9199 (vie)-Penn Zero MSSJ-quốc gia.wav');
    expect(audioFileIn(section('bac-si'))).toBe('LL-Q9199_(vie)-Jessica_Nguyen_(Pamputt)-bác_sĩ.wav');
    expect(audioFileIn(section('nhap-khau'))).toBeUndefined();
  });
});

describe('stubTarget', () => {
  it('follows an alternative-spelling stub', () => {
    expect(stubTarget(section('van-hoa-stub'))).toBe('văn hoá');
  });

  it('is null for real entries', () => {
    expect(stubTarget(section('van-hoa'))).toBeNull();
    expect(stubTarget(section('nhap-khau'))).toBeNull();
  });

  it('understands the generic templates, whose target is parameter 2', () => {
    expect(stubTarget('===Noun===\n{{vi-noun}}\n\n# {{alternative form of|vi|thuỷ}}\n')).toBe('thuỷ');
  });
});
