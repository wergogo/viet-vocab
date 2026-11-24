import { describe, expect, it } from 'vitest';
import type { Equivalent } from '../model/types';
import { parseHtml } from './parse';
import { equivalentsOf, labelRegions, regionalTerms, regionsIn, regionsNamed } from './regions';

describe('regionsIn', () => {
  it('reads regional labels as Wiktionary shows them, and qualifiers as they are typed', () => {
    const cases: [string, string[]][] = [
      ['Northern Vietnam', ['north']],
      ['northern Vietnamese', ['north']],
      ['Hà Nội', ['north']],
      ['Hanoi', ['north']],
      ['Southern Vietnam', ['south']],
      ['chiefly Southern Vietnam', ['south']],
      ['Saigon', ['south']],
      ['Central Vietnam', ['central']],
      ['Huế dialect', ['central']],
      ['Nghệ An', ['central']],
      ['(Northern)', ['north']],
    ];
    for (const [text, regions] of cases) expect(regionsIn(text), text).toEqual(regions);
  });

  it('counts North Central and South Central as Central only, and finds every region a text names', () => {
    expect(regionsIn('North Central Vietnam')).toEqual(['central']);
    expect(regionsIn('South Central Coast')).toEqual(['central']);
    expect(regionsIn('Central and Southern Vietnam')).toEqual(['central', 'south']);
    expect(regionsIn('Northern and Central Vietnam')).toEqual(['north', 'central']);
  });

  it('finds no region in other labels, or where a place name is only part of a word', () => {
    for (const text of ['archaic', 'card games', 'Vietnam', 'Overseas Vietnamese', 'Southeast Asia', 'thuế', 'Hồ Chí Minh']) {
      expect(regionsIn(text), text).toEqual([]);
    }
  });
});

describe('regionsNamed', () => {
  it('reads each comma-separated part on its own, and gives each region once, in order', () => {
    expect(regionsNamed(['colloquial, Northern'])).toEqual(['north']);
    expect(regionsNamed(['(Southern Vietnam, card games)', 'Saigon', 'Hanoi'])).toEqual(['north', 'south']);
    expect(regionsNamed(['archaic'])).toEqual([]);
  });
});

describe('labelRegions', () => {
  it('reads the labels in front of meanings and sub-meanings', () => {
    const list = parseHtml(
      '<ol><li><span class="usage-label-sense">(Central Vietnam, Southern Vietnam)</span> pig' +
        '<ol><li><span class="usage-label-sense">(Hà Nội)</span> piglet</li></ol></li>' +
        '<li><span class="usage-label-sense">(colloquial)</span> pork</li></ol>',
    ).querySelector('ol')!;
    expect(labelRegions(list)).toEqual(['north', 'central', 'south']);
  });
});

describe('regionalTerms', () => {
  const item = (html: string) => parseHtml(`<ul><li>${html}</li></ul>`).querySelector('li')!;
  const q = (text: string) =>
    `<span class="ib-brac qualifier-brac">(</span><span class="ib-content qualifier-content">${text}</span><span class="ib-brac qualifier-brac">)</span>`;
  const sense = (text: string) => `${q(text)}<span class="ib-colon sense-qualifier-colon">:</span>`;
  const term = (word: string) => `<span class="Latn" lang="vi"><a href="#">${word}</a></span>`;

  it('gives each term the regions of the qualifiers in its part, before or after it', () => {
    expect(regionalTerms(item(`${sense('pig')} ${term('lợn')} ${q('northern Vietnam')}; ${term('cúi')} ${q('archaic')}`))).toEqual([
      { word: 'lợn', regions: ['north'] },
    ]);
    const line = `Synonyms: ${q('Northern Vietnam')} ${term('bát')}, ${term('chén')} ${q('Central Vietnam, Southern Vietnam')}`;
    expect(regionalTerms(item(line))).toEqual([
      { word: 'bát', regions: ['north'] },
      { word: 'chén', regions: ['central', 'south'] },
    ]);
  });

  it('skips the sense qualifier, and Han spellings', () => {
    expect(regionalTerms(item(`${sense('Hanoi')} ${term('Thăng Long')} ${q('historical')}`))).toEqual([]);
    const han = `${term('tàu hoả')} (<span class="Hani" lang="vi">艚火</span>) ${q('northern Vietnam')}`;
    expect(regionalTerms(item(han))).toEqual([{ word: 'tàu hoả', regions: ['north'] }]);
  });
});

describe('equivalentsOf', () => {
  it('merges a term named twice, and leaves out terms used only where the word is', () => {
    const terms: Equivalent[] = [
      { word: 'lợn', regions: ['north'] },
      { word: 'tàu hỏa', regions: ['north'] },
      { word: 'tàu hoả', regions: ['central'] },
      { word: 'heo nái', regions: ['south'] },
    ];
    expect(equivalentsOf(terms, ['central', 'south'])).toEqual([
      { word: 'lợn', regions: ['north'] },
      { word: 'tàu hỏa', regions: ['north', 'central'] },
    ]);
  });
});
