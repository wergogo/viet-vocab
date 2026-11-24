import { sortRegions, type Equivalent, type Region } from '../model/types';
import { hasCjk } from '../text/cjk';
import { cleanText } from '../text/normalize';
import { wordKey } from '../text/tone';

/**
 * Places whose names put a label or qualifier in a region (spec §6.2), lowercase. They follow the regional categories
 * of Wiktionary's Vietnamese labels (Module:labels/data/lang/vi), as labels show them ("Hà Nội") and as qualifiers
 * are often typed ("Hanoi"). Wiktionary's South Central and Nẫu labels count as Central.
 */
const PLACES: readonly (readonly [Region, readonly string[]])[] = [
  [
    'central',
    [
      'huế',
      'nghệ an',
      'nghệ tĩnh',
      'hà tĩnh',
      'thanh hoá',
      'thanh hóa',
      'quảng bình',
      'quảng trị',
      'đà nẵng',
      'quảng nam',
      'quảng ngãi',
      'bình định',
      'phú yên',
      'nẫu',
      'central coast',
    ],
  ],
  ['north', ['hà nội', 'hanoi', 'hải phòng', 'haiphong']],
  ['south', ['saigon', 'sài gòn', 'ho chi minh city', 'hồ chí minh city', 'mekong delta']],
];

/** Compass words. They count only in a text that names Vietnam ("Central and Southern Vietnam"), or that is one alone. */
const DIRECTIONS: readonly (readonly [Region, readonly string[]])[] = [
  ['north', ['north', 'northern', 'northeast', 'northeastern', 'northwest', 'northwestern']],
  ['central', ['central', 'southcentral']],
  ['south', ['south', 'southern', 'southeast', 'southeastern', 'southwest', 'southwestern']],
];

/** A phrase as a whole word: no letter may touch it, so "huế" doesn't match inside "thuế". */
const whole = (phrase: string) => new RegExp(`(?<![\\p{L}\\p{M}])${phrase}(?![\\p{L}\\p{M}])`, 'u');

const PLACE_PATTERNS = PLACES.map(([region, names]) => [region, names.map(whole)] as const);
const VIETNAM = whole('vietnam(?:ese)?');
/** "North Central Vietnam" and "South Central Vietnam" are Central, and not Northern or Southern as well. */
const CENTRAL_PART = /(?:north|south)(?:ern)?[\s-]+central/g;
const COMPASS_WORDS = new Set(DIRECTIONS.flatMap(([, names]) => names));

/** The regions one label or qualifier names, ignoring case: "Central and Southern Vietnam" names two, "archaic" none. */
export function regionsIn(text: string): Region[] {
  const t = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  const found = PLACE_PATTERNS.filter(([, patterns]) => patterns.some((p) => p.test(t))).map(([region]) => region);
  if (VIETNAM.test(t) || COMPASS_WORDS.has(t)) {
    const words = t.replace(CENTRAL_PART, 'central').split(/[^\p{L}]+/u);
    for (const [region, names] of DIRECTIONS) if (names.some((n) => words.includes(n))) found.push(region);
  }
  return sortRegions(found);
}

/** The regions that labels or qualifiers name. Each text is read in parts, split at its commas. */
export function regionsNamed(texts: readonly string[]): Region[] {
  return sortRegions(texts.flatMap((t) => t.split(',')).flatMap(regionsIn));
}

/** The regions named by the labels in front of the meanings in a definition list (`span.usage-label-sense`). */
export function labelRegions(list: Element): Region[] {
  return regionsNamed(Array.from(list.querySelectorAll('.usage-label-sense'), (el) => el.textContent ?? ''));
}

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * The regionally qualified Vietnamese terms in a synonym list item or a synonym line (spec §6.2), such as
 * `{{vi-l|tàu hoả}} {{qualifier|northern Vietnam}}` or `{{syn|vi|bát<q:Northern Vietnam>}}`. The item is split into
 * parts at "," and ";", and each term takes the regions that the qualifiers of its part name, before or after it. A
 * sense qualifier ("(train):") belongs to the whole item, so it is skipped. Terms with no regional qualifier, and Han
 * spellings, are left out.
 */
export function regionalTerms(item: Element): Equivalent[] {
  const out: Equivalent[] = [];
  let words: string[] = [];
  let qualifiers: string[] = [];
  const endPart = () => {
    const regions = regionsNamed(qualifiers);
    if (regions.length > 0) for (const word of words) out.push({ word, regions });
    words = [];
    qualifiers = [];
  };
  for (const node of Array.from(item.childNodes)) {
    if (node.nodeType === TEXT_NODE && /[,;]/.test(node.textContent ?? '')) endPart();
    if (node.nodeType !== ELEMENT_NODE) continue;
    const el = node as Element;
    if (el.classList.contains('qualifier-content')) qualifiers.push(el.textContent ?? '');
    else if (el.classList.contains('sense-qualifier-colon')) qualifiers = [];
    else if (el.getAttribute('lang') === 'vi') {
      const word = cleanText(el.textContent ?? '');
      if (word && !hasCjk(word)) words.push(word);
    }
  }
  endPart();
  return out;
}

/** The regionally qualified terms on the synonym lines under the meanings of a definition list (`span.nyms.synonym`). */
export function synonymLineTerms(list: Element): Equivalent[] {
  return Array.from(list.querySelectorAll('.nyms.synonym')).flatMap(regionalTerms);
}

/**
 * An entry's equivalents, from its regionally qualified synonyms: each term once (by the duplicate check's key), with
 * the regions of all its mentions. Terms used only where the entry's word is used are left out.
 */
export function equivalentsOf(terms: readonly Equivalent[], own: readonly Region[]): Equivalent[] {
  const byKey = new Map<string, { word: string; regions: Region[] }>();
  for (const t of terms) {
    const key = wordKey(t.word);
    const found = byKey.get(key);
    if (found) found.regions = sortRegions([...found.regions, ...(t.regions ?? [])]);
    else byKey.set(key, { word: t.word, regions: [...(t.regions ?? [])] });
  }
  return [...byKey.values()].filter((e) => e.regions.some((r) => !own.includes(r)));
}
