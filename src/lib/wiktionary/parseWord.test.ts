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
});
