import { describe, expect, it } from 'vitest';
import { parseWordPage } from './parseWord';
import { fixturePage } from './test-fixtures';

const parse = (name: string) => {
  const page = fixturePage(name);
  return parseWordPage(page.wikitext, page.html)!;
};

describe('parseWordPage', () => {
  it('parses a single-entry page', () => {
    expect(parse('nhap-khau')).toEqual({
      stubTarget: null,
      entries: [
        {
          label: 'Verb',
          chars: { kind: 'sino', chars: ['入', '口'], glosses: null },
          senses: [{ pos: 'Verb', meaning: 'to import' }],
          etymology:
            'Sino-Vietnamese word from 入口, Chinese 入口 (rùkǒu), orthographic borrowing from Japanese 入口 (iriguchi, “entrance”).',
          ipaHanoi: '[ɲəp̚˧˨ʔ xəw˧˩]',
          ipaSaigon: '[ɲəp̚˨˩˨ kʰəw˨˩˦]',
        },
      ],
    });
  });

  it('keeps every part of speech and the first audio file', () => {
    const [entry] = parse('quoc-gia').entries;
    expect(entry!.label).toBe('Noun, Adjective');
    expect(entry!.senses.map((s) => s.pos)).toEqual(['Noun', 'Adjective', 'Adjective', 'Adjective']);
    expect(entry!.audioFile).toBe('LL-Q9199 (vie)-Penn Zero MSSJ-quốc gia.wav');
  });

  it('adds classifiers to the word class', () => {
    expect(parse('kinh-te').entries[0]!.senses).toEqual([
      { pos: 'Noun (classifier: nền)', meaning: 'economy' },
      { pos: 'Adjective', meaning: 'economic' },
    ]);
    expect(parse('dien-thoai').entries[0]!.senses).toEqual([
      { pos: 'Noun (classifier: chiếc, cái)', meaning: 'telephone' },
      { pos: 'Verb', meaning: 'to telephone; to call' },
    ]);
  });

  it('carries per-character glosses and headword characters', () => {
    expect(parse('hoc-sinh').entries[0]!.chars).toEqual({
      kind: 'sino',
      chars: ['學', '生'],
      glosses: ['to learn', 'learned person; student'],
    });
    expect(parse('tieng-viet').entries[0]!.chars).toEqual({ kind: 'headword', chars: ['㗂', '越'], glosses: null });
  });

  it('splits numbered etymologies, shares the pronunciation and skips Romanization', () => {
    const { entries } = parse('dong');
    expect(entries.map((e) => e.label)).toEqual(['Etymology 1 · Noun', 'Etymology 2 · Noun', 'Etymology 3 · Noun']);
    expect(entries.map((e) => e.chars?.chars.join(''))).toEqual(['垌', '童', '銅']);
    expect(entries[0]!.senses[0]).toEqual({
      pos: 'Noun (classifier: cánh)',
      meaning: 'field (clearly delimited land area free of woodland, cities, and towns)',
    });
    for (const e of entries) {
      expect(e.ipaHanoi).toBe('[ʔɗəwŋ͡m˨˩]');
      expect(e.audioFile).toBe('LL-Q9199 (vie)-Penn Zero MSSJ-đồng.wav');
    }
  });

  it('reports an alternative-spelling stub instead of entries', () => {
    expect(parse('van-hoa-stub')).toEqual({ entries: [], stubTarget: 'văn hoá' });
  });

  it('returns null without a Vietnamese section', () => {
    expect(parseWordPage('==English==\n===Noun===\n# thing\n', '')).toBeNull();
  });

  it('fills what it can when the HTML is missing', () => {
    const page = fixturePage('nhap-khau');
    const { entries } = parseWordPage(page.wikitext, '')!;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.chars?.chars).toEqual(['入', '口']);
    expect(entries[0]!.senses).toEqual([]);
  });

  it('takes Nôm characters from wikilinked headwords', () => {
    const { entries } = parse('nuoc');
    expect(entries.map((e) => [e.label, e.chars?.kind, e.chars?.chars.join('')])).toEqual([
      ['Etymology 1 · Noun', 'headword', '渃'],
      ['Etymology 2 · Noun', 'headword', '渃'],
      ['Etymology 3 · Noun', 'headword', '著'],
    ]);
    expect(entries[1]!.senses[0]!.pos).toBe('Noun (classifier: cái)');
  });

  it('keeps entries aligned when a heading carries a comment', () => {
    const page = fixturePage('dong');
    const wikitext = page.wikitext.replace('===Etymology 2===', '===Etymology 2=== <!-- note -->');
    const { entries } = parseWordPage(wikitext, page.html)!;
    expect(entries.map((e) => e.label)).toEqual(['Etymology 1 · Noun', 'Etymology 2 · Noun', 'Etymology 3 · Noun']);
    expect(entries.map((e) => e.chars?.chars.join(''))).toEqual(['垌', '童', '銅']);
    expect(entries[2]!.senses[0]!.meaning).toBe('copper');
  });

  it('uses each rendered entry once when a page repeats an etymology title', () => {
    const page = fixturePage('dong');
    const wikitext = page.wikitext.replace('===Etymology 2===', '===Etymology 1===');
    const html = page.html.replace('>Etymology 2</h3>', '>Etymology 1</h3>');
    const { entries } = parseWordPage(wikitext, html)!;
    expect(entries.map((e) => e.chars?.chars.join(''))).toEqual(['垌', '童', '銅']);
    expect(entries[1]!.senses[0]!.meaning).toContain('medium');
  });

  it('lists each part of speech once in the label', () => {
    const wikitext = '==Vietnamese==\n===Noun===\n{{vi-noun}}\n# a child\n===Noun===\n{{vi-noun}}\n# a young animal\n';
    const html =
      '<div class="mw-parser-output"><div class="mw-heading mw-heading2"><h2>Vietnamese</h2></div>' +
      '<div class="mw-heading mw-heading3"><h3>Noun</h3></div><ol><li>a child</li></ol>' +
      '<div class="mw-heading mw-heading3"><h3>Noun</h3></div><ol><li>a young animal</li></ol></div>';
    const [entry] = parseWordPage(wikitext, html)!.entries;
    expect(entry!.label).toBe('Noun');
    expect(entry!.senses.map((s) => s.meaning)).toEqual(['a child', 'a young animal']);
  });
});
