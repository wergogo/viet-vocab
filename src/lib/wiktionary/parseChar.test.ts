import { describe, expect, it } from 'vitest';
import { parseCharPage } from './parseChar';
import { FIXTURES } from './test-fixtures';

const charNhap = (FIXTURES['char-nhap'] as { parse: { title: string; wikitext: string } }).parse;

describe('parseCharPage', () => {
  it('reads readings, meanings and compounds of 入', () => {
    expect(parseCharPage(charNhap.title, charNhap.wikitext)).toEqual({
      title: '入',
      hanViet: ['nhập'],
      nom: ['nhập', 'nhạp', 'nhấp', 'nhắp', 'vào', 'nhép', 'nhẹp'],
      meanings: ['to enter; to join', 'Kangxi radical 11—‘enter’'],
      compounds: [
        { han: '入口', word: 'nhập khẩu' },
        { han: '入居', word: 'nhập cư' },
        { han: '入門', word: 'nhập môn' },
        { han: '入會', word: 'nhập hội' },
        { han: '入學', word: 'nhập học' },
        { han: '入伍', word: 'nhập ngũ' },
        { han: '加入', word: 'gia nhập' },
        { han: '收入', word: 'thu nhập' },
        { han: '登入', word: 'đăng nhập' },
      ],
    });
  });

  it('accepts the Vietnamese word first in vi-l', () => {
    const text = '==Vietnamese==\n===Han character===\n# x\n====Compounds====\n* {{vi-l|nhập khẩu|入口}}\n';
    expect(parseCharPage('入', text)?.compounds).toEqual([{ han: '入口', word: 'nhập khẩu' }]);
  });

  it('returns null without a Vietnamese section', () => {
    expect(parseCharPage('入', '==Chinese==\n===Definitions===\n# to enter\n')).toBeNull();
  });

  it('reads the gloss inside vi-Han form of (國)', () => {
    const quoc = (FIXTURES['char-quoc'] as { parse: { title: string; wikitext: string } }).parse;
    const info = parseCharPage(quoc.title, quoc.wikitext)!;
    expect(info).toMatchObject({
      title: '國',
      hanViet: ['quốc', 'quấc'],
      nom: ['cuốc', 'quốc'],
      meanings: ['country; state; nation'],
    });
    expect(info.compounds).toHaveLength(80);
    expect(info.compounds).toContainEqual({ han: '', word: 'quốc xã' });
    expect(info.compounds.slice(0, 3)).toEqual([
      { han: '愛國', word: 'ái quốc' },
      { han: '英國', word: 'Anh Quốc' },
      { han: '故國', word: 'cố quốc' },
    ]);
  });

  it.each([
    ['# {{vi-Han form of|nhập}}', ''],
    ['# {{vi-Han form of|nhập}} to enter', 'to enter'],
    ['# {{vi-Han form of|quốc|[[country]]; [[state]]; [[nation]]}}', 'country; state; nation'],
    ['# {{vi-Han form of|quốc|[[country]]}} {{q|archaic}}', 'country (archaic)'],
    ['## |[[Kangxi radical]] 11—‘[[enter]]’', 'Kangxi radical 11—‘enter’'],
  ])('reads the meaning line %s', (line, meaning) => {
    const page = `==Vietnamese==\n===Han character===\n${line}\n`;
    expect(parseCharPage('x', page)?.meanings).toEqual(meaning ? [meaning] : []);
  });

  it('reads vi-l-lite compounds and the first spelling of slash-joined ones (學)', () => {
    const hoc = (FIXTURES['char-hoc'] as { parse: { title: string; wikitext: string } }).parse;
    const info = parseCharPage(hoc.title, hoc.wikitext)!;
    expect(info).toMatchObject({ hanViet: ['học'], nom: ['học', 'hục'] });
    expect(info.meanings[0]).toBe('to learn, to study');
    expect(info.compounds).toContainEqual({ han: '大學', word: 'đại học' });
    expect(info.compounds).toContainEqual({ han: '學區', word: 'học khu' });
    expect(info.compounds.length).toBeGreaterThan(100);
    expect(info.compounds.every((c) => !c.word.includes('/'))).toBe(true);
  });

  it('unlinks compounds written with links', () => {
    const text = '==Vietnamese==\n===Han character===\n# x\n====Compounds====\n* {{vi-l|[[入口]]|[[nhập khẩu]]}}\n';
    expect(parseCharPage('入', text)?.compounds).toEqual([{ han: '入口', word: 'nhập khẩu' }]);
  });

  it('skips examples and merges readings from several Han character sections', () => {
    const text =
      '==Vietnamese==\n===Han character 1===\n{{vi-readings|hanviet=hành-gdhn|nom=}}\n# to go\n##: {{uxi|vi|đi}}\n##* a quote\n' +
      '===Han character 2===\n{{vi-readings|hanviet=hạnh-gdhn, hành|nom=hàng-gdhn}}\n# conduct\n';
    expect(parseCharPage('行', text)).toMatchObject({
      hanViet: ['hành', 'hạnh'],
      nom: ['hàng'],
      meanings: ['to go', 'conduct'],
    });
  });
});
