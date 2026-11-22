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

/** The Vietnamese part of a character page, from its wikitext (spec §6.4), or null when there is none. */
export function parseCharPage(title: string, wikitext: string): CharInfo | null {
  const section = vietnameseSection(wikitext);
  if (section === null) return null;
  const [readingsCall] = findTemplates(section, 'vi-readings');
  const headings = wikiHeadings(section);
  const meanings: string[] = [];
  const compounds: CharCompound[] = [];
  headings.forEach((h, i) => {
    const body = bodyAfter(section, headings, i);
    if (h.title.startsWith('Han character')) {
      for (const line of body.split('\n')) {
        const item = /^#+(?![:*])\s*(.*)$/.exec(line);
        if (!item) continue;
        const text = wikiToText(item[1]!).replace(/^\|\s*/, '');
        if (text) meanings.push(text);
      }
    } else if (h.title === 'Compounds') {
      for (const call of findTemplates(body, 'vi-l')) {
        const [a = '', b = ''] = call.positional;
        const [han, word] = cjkChars(a).length > 0 ? [a, wikiToText(b)] : [b, wikiToText(a)];
        if (han && word && !compounds.some((c) => c.han === han && c.word === word)) compounds.push({ han, word });
      }
    }
  });
  return {
    title,
    hanViet: readings(readingsCall?.named.hanviet),
    nom: readings(readingsCall?.named.nom),
    meanings,
    compounds,
  };
}
