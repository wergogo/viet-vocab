import { NUMBERED_ETYMOLOGY, POS_HEADINGS } from './wikitext';

// Rendered Wiktionary HTML is only read, with DOMParser; it is never inserted into the app's page (spec §6.2).

interface Heading {
  level: number;
  text: string;
}

/** `<div class="mw-heading mw-headingN"><hN>…</hN></div>`, or a bare `<hN>` in older output. */
function headingOf(el: Element): Heading | null {
  const h = /^H[2-6]$/.test(el.tagName)
    ? el
    : el.classList.contains('mw-heading')
      ? el.querySelector('h2, h3, h4, h5, h6')
      : null;
  return h ? { level: Number(h.tagName.slice(1)), text: (h.textContent ?? '').trim() } : null;
}

/** Visible text without nested lists, examples, references or styles; whitespace collapsed. */
export function plainText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('dl, ul, ol, sup.reference, style, link').forEach((n) => n.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** The top-level elements of the Vietnamese section, or null when the page has none. */
export function vietnameseElements(html: string): Element[] | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('.mw-parser-output') ?? doc.body;
  const out: Element[] = [];
  let found = false;
  for (const el of Array.from(root.children)) {
    const h = headingOf(el);
    if (h?.level === 2) {
      if (found) break;
      found = h.text === 'Vietnamese';
      continue;
    }
    if (found) out.push(el);
  }
  return found ? out : null;
}

/** One row per top-level definition item; examples are dropped and sub-definitions appended with "; ". */
export function definitionsOf(list: Element): string[] {
  const rows: string[] = [];
  for (const li of Array.from(list.children)) {
    if (li.tagName !== 'LI') continue;
    const subs = Array.from(li.children)
      .filter((c) => c.tagName === 'OL')
      .flatMap((ol) => Array.from(ol.children))
      .filter((c) => c.tagName === 'LI')
      .map(plainText);
    const row = [plainText(li), ...subs].filter(Boolean).join('; ');
    if (row) rows.push(row);
  }
  return rows;
}

export interface HtmlPos {
  name: string;
  definitions: string[];
}

export interface HtmlEntry {
  /** Etymology paragraphs as plain text, one paragraph per line. */
  etymology: string;
  /** List items of the entry's own pronunciation section. */
  pronunciation: Element[];
  pos: HtmlPos[];
}

export interface HtmlSection {
  /** Pronunciation items that come before the first `Etymology N` heading. */
  sharedPronunciation: Element[];
  entries: HtmlEntry[];
}

/** Splits the Vietnamese elements into entries, the same way `splitEntries` splits the wikitext. */
export function splitHtmlEntries(elements: readonly Element[]): HtmlSection {
  const numbered = elements.some((el) => NUMBERED_ETYMOLOGY.test(headingOf(el)?.text ?? ''));
  const sharedPronunciation: Element[] = [];
  const entries: HtmlEntry[] = [];
  const newEntry = (): HtmlEntry => {
    const e: HtmlEntry = { etymology: '', pronunciation: [], pos: [] };
    entries.push(e);
    return e;
  };
  let entry: HtmlEntry | null = numbered ? null : newEntry();
  let mode: 'etymology' | 'pronunciation' | 'pos' | 'other' = 'other';
  let pos: HtmlPos | null = null;
  for (const el of elements) {
    const h = headingOf(el);
    if (h) {
      pos = null;
      if (NUMBERED_ETYMOLOGY.test(h.text)) {
        entry = newEntry();
        mode = 'etymology';
      } else if (h.text === 'Etymology') {
        mode = 'etymology';
      } else if (h.text === 'Pronunciation') {
        mode = 'pronunciation';
      } else if (POS_HEADINGS.has(h.text) && entry) {
        pos = { name: h.text, definitions: [] };
        entry.pos.push(pos);
        mode = 'pos';
      } else {
        mode = 'other';
      }
      continue;
    }
    if (mode === 'etymology' && entry && el.tagName === 'P') {
      const text = plainText(el);
      if (text) entry.etymology = entry.etymology ? `${entry.etymology}\n${text}` : text;
    } else if (mode === 'pronunciation') {
      (entry ? entry.pronunciation : sharedPronunciation).push(...Array.from(el.querySelectorAll('li')));
    } else if (mode === 'pos' && pos && pos.definitions.length === 0 && el.tagName === 'OL') {
      pos.definitions = definitionsOf(el);
    }
  }
  return { sharedPronunciation, entries };
}
