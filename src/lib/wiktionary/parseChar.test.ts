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
});
