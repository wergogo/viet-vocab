// Fetches the Wiktionary API responses used as test fixtures into tests/fixtures/wiktionary/.
// Run: node scripts/fetch-wiktionary-fixtures.mjs           (fetches only missing files)
//      node scripts/fetch-wiktionary-fixtures.mjs --force   (re-fetches everything)
// Wiktionary content is CC BY-SA 4.0 (see tests/fixtures/wiktionary/README.md). Re-run when the markup changes;
// the parser tests' expected values may then need updating.
import { access, mkdir, writeFile } from 'node:fs/promises';

const API = 'https://en.wiktionary.org/w/api.php';
const OUT = new URL('../tests/fixtures/wiktionary/', import.meta.url);
const HEADERS = { 'Api-User-Agent': 'VietVocab/1.0', 'User-Agent': 'VietVocab/1.0 (test fixture refresh)' };

const parseWord = (page) => ({
  action: 'parse',
  page,
  prop: 'wikitext|text',
  redirects: '1',
  disableeditsection: '1',
  disablelimitreport: '1',
});

/** [file name, request parameters] — the same requests the app makes. */
const FIXTURES = [
  ['nhap-khau', parseWord('nhập khẩu')],
  ['quoc-gia', parseWord('quốc gia')],
  ['kinh-te', parseWord('kinh tế')],
  ['hanh-phuc', parseWord('hạnh phúc')],
  ['thanh-pho', parseWord('thành phố')],
  ['dien-thoai', parseWord('điện thoại')],
  ['hoc-sinh', parseWord('học sinh')],
  ['bac-si', parseWord('bác sĩ')],
  ['nhap', parseWord('nhập')],
  ['tieng-viet', parseWord('tiếng Việt')],
  ['dong', parseWord('đồng')],
  ['nuoc', parseWord('nước')],
  ['van-hoa-stub', parseWord('văn hóa')],
  ['van-hoa', parseWord('văn hoá')],
  ['missing-page', parseWord('xyzkhongcotu')],
  ['query-variants', { action: 'query', titles: 'xyzkhongcotu|văn hoá' }],
  ['char-nhap', { action: 'parse', page: '入', prop: 'wikitext', redirects: '1' }],
  ['char-quoc', { action: 'parse', page: '國', prop: 'wikitext', redirects: '1' }],
  ['ipa-sentence', { action: 'expandtemplates', text: '{{vi-IPA|tôi đang học từ vựng mới}}', prop: 'wikitext' }],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const force = process.argv.includes('--force');

/** GET with retries on 429/503, honouring Retry-After (the API rate-limits bursts). */
async function getJson(url, name) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status === 503) && attempt <= 3) {
      const wait = Number(res.headers.get('retry-after')) || 15;
      console.log(`${name}: HTTP ${res.status}, retrying in ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    throw new Error(`${name}: HTTP ${res.status}`);
  }
}

await mkdir(OUT, { recursive: true });
for (const [name, params] of FIXTURES) {
  const file = new URL(`${name}.json`, OUT);
  if (!force && (await access(file).then(() => true, () => false))) {
    console.log(`${name}.json  exists, skipped`);
    continue;
  }
  const url = new URL(API);
  for (const [k, v] of Object.entries({ ...params, format: 'json', formatversion: '2', origin: '*' })) {
    url.searchParams.set(k, v);
  }
  const body = await getJson(url, name);
  await writeFile(file, JSON.stringify(body, null, 2) + '\n');
  console.log(`${name}.json  ${JSON.stringify(body).length} bytes`);
  await sleep(1000); // be gentle with the API
}
