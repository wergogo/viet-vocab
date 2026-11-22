import { findTemplates, firstTemplate, normalizeName, wikiToText, type TemplateCall } from './templates';

/** Part-of-speech headings whose definitions become meaning rows (spec §6.2). */
export const PARTS_OF_SPEECH: readonly string[] = [
  'Noun',
  'Verb',
  'Adjective',
  'Adverb',
  'Pronoun',
  'Numeral',
  'Classifier',
  'Particle',
  'Preposition',
  'Conjunction',
  'Interjection',
  'Determiner',
  'Proper noun',
  'Phrase',
  'Idiom',
  'Prefix',
  'Suffix',
];
export const COUNTED_POS: ReadonlySet<string> = new Set(PARTS_OF_SPEECH);
/** Headings that open a part-of-speech block. Romanization is tracked so entries made only of it can be skipped. */
export const POS_HEADINGS: ReadonlySet<string> = new Set([...PARTS_OF_SPEECH, 'Romanization']);
export const NUMBERED_ETYMOLOGY = /^Etymology \d+$/;

export interface WikiHeading {
  level: number;
  title: string;
  /** Offsets of the heading line, without its newline. */
  start: number;
  end: number;
}

export function wikiHeadings(text: string): WikiHeading[] {
  const out: WikiHeading[] = [];
  // The title can't contain "=", so this pattern never backtracks (a lazy title made long lines cubic).
  for (const m of text.matchAll(/^(={2,6})([^=\n]+)\1[ \t]*$/gm)) {
    out.push({ level: m[1]!.length, title: m[2]!.trim(), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

/** The text after heading `i`, up to the next heading of any level. */
export function bodyAfter(text: string, headings: readonly WikiHeading[], i: number): string {
  return text.slice(headings[i]!.end, headings[i + 1]?.start ?? text.length);
}

/** The `==Vietnamese==` section without its heading line or comments, or null when the page has none. */
export function vietnameseSection(wikitext: string): string | null {
  // Comments don't show on the page; read as content they would hide headings or add stale templates.
  const text = wikitext.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  const hs = wikiHeadings(text);
  const i = hs.findIndex((h) => h.level === 2 && h.title === 'Vietnamese');
  if (i < 0) return null;
  const next = hs.slice(i + 1).find((h) => h.level === 2);
  return text.slice(hs[i]!.end, next?.start ?? text.length);
}

export interface WikiPos {
  name: string;
  /** The headword template under the heading, e.g. `{{vi-noun|cls=cánh|垌}}`. */
  headword: TemplateCall | null;
}

export interface WikiEntry {
  /** "Etymology 2" for numbered entries, otherwise null. */
  title: string | null;
  text: string;
  /** The body of the entry's etymology heading, where `{{vi-etym-sino}}` belongs; empty without one. */
  etymology: string;
  pos: WikiPos[];
}

export interface WikiSection {
  numbered: boolean;
  /** Text before the first `Etymology N` heading (a shared pronunciation); empty without numbered etymologies. */
  shared: string;
  entries: WikiEntry[];
}

/** Headword templates: `{{head|vi|…}}` or a `{{vi-…}}` one (boxes such as `{{wikipedia}}` can come first). */
function isHeadword(call: TemplateCall): boolean {
  const name = normalizeName(call.name);
  return name === 'head' || name.startsWith('vi-');
}

function readEntry(text: string, title: string | null): WikiEntry {
  const hs = wikiHeadings(text);
  const pos: WikiPos[] = [];
  let etymology = '';
  hs.forEach((h, i) => {
    if (h.title === 'Etymology' || NUMBERED_ETYMOLOGY.test(h.title)) {
      etymology ||= bodyAfter(text, hs, i);
      return;
    }
    if (!POS_HEADINGS.has(h.title)) return;
    const beforeDefinitions = bodyAfter(text, hs, i).split(/^#/m)[0] ?? '';
    pos.push({ name: h.title, headword: firstTemplate(beforeDefinitions, isHeadword) });
  });
  return { title, text, etymology, pos };
}

/** Splits a Vietnamese section into entries at `Etymology N` headings; without them it is one entry. */
export function splitEntries(section: string): WikiSection {
  const starts = wikiHeadings(section).filter((h) => NUMBERED_ETYMOLOGY.test(h.title));
  if (starts.length === 0) return { numbered: false, shared: '', entries: [readEntry(section, null)] };
  return {
    numbered: true,
    shared: section.slice(0, starts[0]!.start),
    entries: starts.map((h, i) =>
      readEntry(section.slice(h.start, starts[i + 1]?.start ?? section.length), h.title),
    ),
  };
}

/** The file of the first `{{audio|vi|<file>|…}}`, if any. */
export function audioFileIn(text: string): string | undefined {
  for (const call of findTemplates(text, 'audio')) {
    const [lang, file] = call.positional;
    if (lang === 'vi' && file) return file;
  }
  return undefined;
}

/** Vietnamese alternative-spelling templates take the target as parameter 1… */
const ALT_VI = ['vi-alternative spelling of', 'vi-alt sp', 'vi-alternative form of', 'vi-alt form'];
/** …the generic ones as parameter 2, after the language code. */
const ALT_ANY = ['alternative spelling of', 'alt sp', 'alternative form of', 'alt form'];

/** X, when every definition in the section is "alternative spelling/form of X"; otherwise null. */
export function stubTarget(section: string): string | null {
  const definitions = section.split('\n').filter((line) => /^#(?![#:*])/.test(line));
  if (definitions.length === 0) return null;
  let target: string | null = null;
  for (const line of definitions) {
    const [call] = findTemplates(line, [...ALT_VI, ...ALT_ANY]);
    if (!call) return null;
    const param = ALT_VI.includes(normalizeName(call.name)) ? call.positional[0] : call.positional[1];
    target ??= wikiToText(param ?? '') || null;
  }
  return target;
}
