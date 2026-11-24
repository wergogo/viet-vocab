import { describe, expect, it } from 'vitest';
import { parseHtml } from './parse';
import { labelRegions, regionsIn, regionsNamed } from './regions';

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
