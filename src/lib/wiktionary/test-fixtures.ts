// Real API responses saved by scripts/fetch-wiktionary-fixtures.mjs (CC BY-SA 4.0, see tests/fixtures/wiktionary/README.md).
import bacSi from '../../../tests/fixtures/wiktionary/bac-si.json';
import charHoc from '../../../tests/fixtures/wiktionary/char-hoc.json';
import charNhap from '../../../tests/fixtures/wiktionary/char-nhap.json';
import charQuoc from '../../../tests/fixtures/wiktionary/char-quoc.json';
import chen from '../../../tests/fixtures/wiktionary/chen.json';
import dienThoai from '../../../tests/fixtures/wiktionary/dien-thoai.json';
import dong from '../../../tests/fixtures/wiktionary/dong.json';
import haNoi from '../../../tests/fixtures/wiktionary/ha-noi.json';
import hanhPhuc from '../../../tests/fixtures/wiktionary/hanh-phuc.json';
import heo from '../../../tests/fixtures/wiktionary/heo.json';
import hocSinh from '../../../tests/fixtures/wiktionary/hoc-sinh.json';
import ipaSentence from '../../../tests/fixtures/wiktionary/ipa-sentence.json';
import kinhTe from '../../../tests/fixtures/wiktionary/kinh-te.json';
import missingPage from '../../../tests/fixtures/wiktionary/missing-page.json';
import nhap from '../../../tests/fixtures/wiktionary/nhap.json';
import nhapKhau from '../../../tests/fixtures/wiktionary/nhap-khau.json';
import nuoc from '../../../tests/fixtures/wiktionary/nuoc.json';
import queryVariants from '../../../tests/fixtures/wiktionary/query-variants.json';
import quocGia from '../../../tests/fixtures/wiktionary/quoc-gia.json';
import tauHoa from '../../../tests/fixtures/wiktionary/tau-hoa.json';
import thanhPho from '../../../tests/fixtures/wiktionary/thanh-pho.json';
import tiengViet from '../../../tests/fixtures/wiktionary/tieng-viet.json';
import vanHoa from '../../../tests/fixtures/wiktionary/van-hoa.json';
import vanHoaStub from '../../../tests/fixtures/wiktionary/van-hoa-stub.json';
import xeLua from '../../../tests/fixtures/wiktionary/xe-lua.json';

/** Raw API responses by fixture file name. */
export const FIXTURES: Record<string, unknown> = {
  'bac-si': bacSi,
  'char-hoc': charHoc,
  'char-nhap': charNhap,
  'char-quoc': charQuoc,
  chen,
  'dien-thoai': dienThoai,
  dong,
  'ha-noi': haNoi,
  'hanh-phuc': hanhPhuc,
  heo,
  'hoc-sinh': hocSinh,
  'ipa-sentence': ipaSentence,
  'kinh-te': kinhTe,
  'missing-page': missingPage,
  nhap,
  'nhap-khau': nhapKhau,
  nuoc,
  'query-variants': queryVariants,
  'quoc-gia': quocGia,
  'tau-hoa': tauHoa,
  'thanh-pho': thanhPho,
  'tieng-viet': tiengViet,
  'van-hoa': vanHoa,
  'van-hoa-stub': vanHoaStub,
  'xe-lua': xeLua,
};

export interface FixturePage {
  title: string;
  wikitext: string;
  html: string;
}

/** The page inside an `action=parse` fixture. */
export function fixturePage(name: string): FixturePage {
  const body = FIXTURES[name] as { parse: { title: string; wikitext: string; text?: string } };
  return { title: body.parse.title, wikitext: body.parse.wikitext, html: body.parse.text ?? '' };
}
