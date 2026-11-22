import { cjkChars } from '../text/cjk';
import { findTemplates, wikiToText } from './templates';
import type { CharCompound, CharInfo } from './types';
import { bodyAfter, vietnameseSection, wikiHeadings } from './wikitext';

/** "nhập-tdcntd;gdhn, nhạp-gdhn" → ["nhập", "nhạp"]: split on commas, drop the source codes after "-". */
function readings(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((r) => r.replace(/-[\s\S]*$/, '').trim())
    .filter(Boolean);
}

/** One meaning from a `#` line of a Han character section, or '' for examples, quotations and bare forms. */
function meaningOf(line: string): string {
  const item = /^#+(.*)$/.exec(line);
  // "#:" and "#*" lines, at any depth, are examples and quotations.
  if (!item || /^[:*]/.test(item[1]!)) return '';
  // {{vi-Han form of|quốc|gloss}} carries the meaning in parameter 2 (國); without one it only names the reading.
  const [form] = findTemplates(item[1]!, 'vi-Han form of');
  const text = wikiToText(form ? (form.positional[1] ?? '') : item[1]!);
  // A stray leading "|" appears on real pages (入: "## |[[Kangxi radical]] 11…").
  return text.replace(/^\|\s*/, '');
}

/** The Vietnamese part of a character page, from its wikitext (spec §6.4), or null when there is none. */
export function parseCharPage(title: string, wikitext: string): CharInfo | null {
  const section = vietnameseSection(wikitext);
  if (section === null) return null;
  const readingCalls = findTemplates(section, 'vi-readings');
  const unique = (values: string[]) => [...new Set(values)];
  const headings = wikiHeadings(section);
  const meanings: string[] = [];
  const compounds: CharCompound[] = [];
  headings.forEach((h, i) => {
    const body = bodyAfter(section, headings, i);
    if (h.title.startsWith('Han character')) {
      for (const line of body.split('\n')) {
        const meaning = meaningOf(line);
        if (meaning) meanings.push(meaning);
      }
    } else if (h.title === 'Compounds') {
      for (const call of findTemplates(body, 'vi-l')) {
        // {{vi-l|入口|nhập khẩu}}, sometimes reversed; the Han part can be empty ({{vi-l||quốc xã|}} on 國).
        const params = call.positional.slice(0, 2);
        const han = params.find((p) => cjkChars(p).length > 0) ?? '';
        const word = wikiToText(params.find((p) => p !== han && p.trim() !== '') ?? '');
        if (word && !compounds.some((c) => c.han === han && c.word === word)) compounds.push({ han, word });
      }
    }
  });
  return {
    title,
    hanViet: unique(readingCalls.flatMap((c) => readings(c.named.hanviet))),
    nom: unique(readingCalls.flatMap((c) => readings(c.named.nom))),
    meanings,
    compounds,
  };
}
