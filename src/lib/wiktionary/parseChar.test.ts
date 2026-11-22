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
