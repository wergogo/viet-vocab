import { sortRegions, type Region } from '../model/types';

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
const DIRECTION_ONLY = /^(?:north|northern|central|south|southern)$/;

/** The regions one label or qualifier names, ignoring case: "Central and Southern Vietnam" names two, "archaic" none. */
export function regionsIn(text: string): Region[] {
  const t = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
  const found = PLACE_PATTERNS.filter(([, patterns]) => patterns.some((p) => p.test(t))).map(([region]) => region);
  if (VIETNAM.test(t) || DIRECTION_ONLY.test(t)) {
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
