import { describe, expect, it } from 'vitest';
import { splitHtmlEntries, vietnameseElements } from './html';
import { ipaFromExpanded, ipaFromItems } from './ipa';
import { FIXTURES, fixturePage } from './test-fixtures';

const sectionOf = (name: string) => splitHtmlEntries(vietnameseElements(fixturePage(name).html)!);

describe('vietnameseElements', () => {
  it('returns null when the page has no Vietnamese section', () => {
    expect(vietnameseElements('<div class="mw-parser-output"><div class="mw-heading mw-heading2"><h2 id="English">English</h2></div><p>x</p></div>')).toBeNull();
  });

  it('stops at the next language', () => {
    const els = vietnameseElements(fixturePage('dong').html)!;
    expect(els.some((el) => el.textContent?.includes('Hungarian'))).toBe(false);
  });
});

describe('splitHtmlEntries', () => {
  it('reads a single-entry page', () => {
    const { sharedPronunciation, entries } = sectionOf('nhap-khau');
    expect(sharedPronunciation).toEqual([]);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.etymology).toBe(
      'Sino-Vietnamese word from 入口, Chinese 入口 (rùkǒu), orthographic borrowing from Japanese 入口 (iriguchi, “entrance”).',
    );
    expect(entries[0]!.pos).toEqual([{ name: 'Verb', definitions: ['to import'] }]);
  });

  it('drops examples and keeps labels and glosses in definitions', () => {
    expect(sectionOf('nhap').entries[0]!.pos[0]!.definitions).toEqual([
      'to join (a group)',
      'to take goods into stock',
      'clipping of nhập khẩu (“to import”)',
      '(occult) to possess',
    ]);
    expect(sectionOf('quoc-gia').entries[0]!.pos.map((p) => [p.name, p.definitions])).toEqual([
      ['Noun', ['(usually formal) state, nation, country']],
      [
        'Adjective',
        [
          'national',
          '(dated) nationalist, particularly in a non-communist context',
          '(historical) of or relating to the former State of Vietnam and the Republic of Vietnam',
        ],
      ],
    ]);
  });

  it('splits numbered etymologies with a shared pronunciation', () => {
    const { sharedPronunciation, entries } = sectionOf('dong');
    expect(sharedPronunciation.length).toBeGreaterThan(0);
    expect(entries).toHaveLength(4);
    expect(entries[1]!.etymology.split('\n')).toHaveLength(2);
    expect(entries[1]!.etymology).not.toContain('[1]');
    expect(entries[2]!.etymology).toBe('Sino-Vietnamese word from 銅 (“copper”).');
    expect(entries[2]!.pos[0]!.definitions).toEqual([
      'copper',
      'dong (currency of Vietnam, or of the historical state of South Vietnam)',
      '(colloquial, chiefly Southern Vietnam) a thousand dongs',
      '(by extension) a currency',
    ]);
    expect(entries[3]!.pos.map((p) => p.name)).toEqual(['Romanization']);
  });
});

describe('IPA', () => {
  it('reads Hà Nội and Saigon from a rendered page', () => {
    expect(ipaFromItems(sectionOf('nhap-khau').entries[0]!.pronunciation)).toEqual({
      hanoi: '[ɲəp̚˧˨ʔ xəw˧˩]',
      saigon: '[ɲəp̚˨˩˨ kʰəw˨˩˦]',
    });
  });

  it('joins variants with " ~ "', () => {
    expect(ipaFromItems(sectionOf('bac-si').entries[0]!.pronunciation).saigon).toBe(
      '[ʔɓaːk̚˦˥ ʂɪj˨˩˦] ~ [ʔɓaːk̚˦˥ sɪj˨˩˦]',
    );
  });

  it('reads expandtemplates output', () => {
    const body = FIXTURES['ipa-sentence'] as { expandtemplates: { wikitext: string } };
    expect(ipaFromExpanded(body.expandtemplates.wikitext)).toEqual({
      hanoi: '[toj˧˧ ʔɗaːŋ˧˧ hawk͡p̚˧˨ʔ tɨ˨˩ vɨŋ˧˨ʔ məːj˧˦]',
      saigon: '[toj˧˧ ʔɗaːŋ˧˧ hawk͡p̚˨˩˨ tɨ˨˩ vɨŋ˨˩˨ məːj˦˥] ~ [toj˧˧ ʔɗaːŋ˧˧ hawk͡p̚˨˩˨ tɨ˨˩ jɨŋ˨˩˨ məːj˦˥]',
    });
  });

  it('is empty without labeled lines', () => {
    expect(ipaFromItems([])).toEqual({ hanoi: '', saigon: '' });
  });
});
