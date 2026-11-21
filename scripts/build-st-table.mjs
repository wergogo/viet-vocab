// Builds src/lib/text/st-table.json from OpenCC's character tables (Apache-2.0).
// Usage: npm run build:st-table
import { writeFile } from 'node:fs/promises';

const BASE = 'https://raw.githubusercontent.com/BYVoid/OpenCC/master/data/dictionary/';

async function load(name) {
  const res = await fetch(BASE + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return res.text();
}

/** "国\t國" / "发\t發 髮" → { 国: "國", 发: "發髮" } (single characters only; inline # comments ignored). */
function parse(text) {
  const map = {};
  for (const line of text.split('\n')) {
    const content = line.split('#')[0].trim();
    if (!content) continue;
    const [from, ...to] = content.split(/\s+/);
    if (!from || to.length === 0 || Array.from(from).length !== 1) continue;
    map[from] = to.join('');
  }
  return map;
}

const s2t = parse(await load('STCharacters.txt'));
const t2s = parse(await load('TSCharacters.txt'));
if (Object.keys(s2t).length < 3000 || s2t['国'] !== '國' || t2s['學'] !== '学') {
  throw new Error('Unexpected OpenCC data; st-table.json was not written');
}
const out = {
  _source: 'OpenCC data/dictionary STCharacters.txt + TSCharacters.txt (Apache-2.0), https://github.com/BYVoid/OpenCC',
  s2t,
  t2s,
};
await writeFile(new URL('../src/lib/text/st-table.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`s2t: ${Object.keys(s2t).length} entries, t2s: ${Object.keys(t2s).length} entries`);
