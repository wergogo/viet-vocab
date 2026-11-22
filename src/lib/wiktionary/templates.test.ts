import { describe, expect, it } from 'vitest';
import { findTemplates, firstTemplate, normalizeName, splitParams, wikiToText } from './templates';

describe('splitParams', () => {
  it('splits on pipes outside {{…}} and [[…]]', () => {
    expect(splitParams('vi-etym-sino|博|{{l|en|[[wide]]; [[vast]]}}|士|{{l|en|-ist}}|suffix=sĩ')).toEqual([
      'vi-etym-sino',
      '博',
      '{{l|en|[[wide]]; [[vast]]}}',
      '士',
      '{{l|en|-ist}}',
      'suffix=sĩ',
    ]);
    expect(splitParams('x|[[a|b]]|c')).toEqual(['x', '[[a|b]]', 'c']);
  });
});

describe('findTemplates', () => {
  it('reads positional and named parameters, trimmed', () => {
    const [call] = findTemplates('{{vi-etym-sino|城|city|庯|street}}.', 'vi-etym-sino');
    expect(call).toMatchObject({ name: 'vi-etym-sino', positional: ['城', 'city', '庯', 'street'], named: {} });
    const [noun] = findTemplates('{{vi-noun|cls=[[chiếc]], [[cái]]}}', 'vi-noun');
    expect(noun?.named).toEqual({ cls: '[[chiếc]], [[cái]]' });
    expect(noun?.positional).toEqual([]);
  });

  it('finds a template in the middle of a sentence, with nested templates in a parameter', () => {
    const text = 'Alternatively, it may be a {{vi-etym-sino|童|child; servant; {{q|dialectal}} shaman|nocap=y}}.';
    const [call] = findTemplates(text, 'vi-etym-sino');
    expect(call?.positional).toEqual(['童', 'child; servant; {{q|dialectal}} shaman']);
    expect(call?.named).toEqual({ nocap: 'y' });
    expect(text.slice(call!.start, call!.end)).toBe('{{vi-etym-sino|童|child; servant; {{q|dialectal}} shaman|nocap=y}}');
  });

  it('finds calls nested inside other templates, and multi-line named parameters', () => {
    const text = '{{col3|vi\n|{{vi-l|入口|nhập khẩu}}\n|{{vi-l|入居|nhập cư}}\n}}';
    expect(findTemplates(text, 'vi-l').map((c) => c.positional)).toEqual([
      ['入口', 'nhập khẩu'],
      ['入居', 'nhập cư'],
    ]);
    const [readings] = findTemplates('{{vi-readings|rs=入00\n|hanviet=nhập-tdcndg;gdhn\n|nom=\n}}', 'vi-readings');
    expect(readings?.named).toEqual({ rs: '入00', hanviet: 'nhập-tdcndg;gdhn', nom: '' });
  });

  it('matches names with a case-insensitive first letter and underscores as spaces', () => {
    expect(normalizeName('Vi-alternative_spelling of')).toBe('vi-alternative spelling of');
    expect(findTemplates('{{Audio|vi|a.wav}}', 'audio')).toHaveLength(1);
    expect(findTemplates('{{audio-x|vi|a.wav}}', 'audio')).toHaveLength(0);
  });

  it('ignores an unclosed template', () => {
    expect(findTemplates('{{vi-etym-sino|入口', 'vi-etym-sino')).toEqual([]);
  });

  it('firstTemplate returns the first call of any name', () => {
    expect(firstTemplate('\n{{vi-noun|cls=cánh|垌}}\n\n# field')?.positional).toEqual(['垌']);
    expect(firstTemplate('no templates')).toBeNull();
  });
});

describe('wikiToText', () => {
  it('turns links, l and q into text and drops other templates', () => {
    expect(wikiToText('[[electric]]')).toBe('electric');
    expect(wikiToText('[[w:Hanoi|Hà Nội]]')).toBe('Hà Nội');
    expect(wikiToText('{{l|en|[[wide]]; [[vast]]; [[broad]]}}')).toBe('wide; vast; broad');
    expect(wikiToText('child; servant; {{q|dialectal}} shaman')).toBe('child; servant; (dialectal) shaman');
    expect(wikiToText("to [[enter]]; to [[join]] {{gl|x}} '''bold'''")).toBe('to enter; to join bold');
  });

  it('drops references and tags', () => {
    expect(wikiToText('a<ref>Norman (1976)</ref> b<ref name="x"/> <sup>c</sup>')).toBe('a b c');
  });
});
