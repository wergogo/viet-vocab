import type { Sense } from '../model/types';
import { charactersFromEntry } from './characters';
import { splitHtmlEntries, vietnameseElements } from './html';
import { wikiToText } from './templates';
import type { LookupEntry } from './types';
import { COUNTED_POS, audioFileIn, splitEntries, stubTarget, vietnameseSection } from './wikitext';

export interface ParsedWordPage {
  /**
   * Entries with at least one counted part of speech; Romanization-only entries are skipped. When no entry has one,
   * the first entry is kept so it can fill what it has (decision 8).
   */
  entries: LookupEntry[];
  /** Set when the Vietnamese section is only an alternative-spelling stub (entries are then empty). */
  stubTarget: string | null;
}

function takeByTitle<T extends { title: string | null }>(pool: T[], title: string | null): T | undefined {
  const i = pool.findIndex((e) => e.title === title);
  return i >= 0 ? pool.splice(i, 1)[0] : undefined;
}

/**
 * Parses the Vietnamese section of a word page from its wikitext and rendered HTML (spec §6.2).
 * Returns null when the page has no Vietnamese section. A partial parse fills what it found.
 */
export function parseWordPage(wikitext: string, html: string): ParsedWordPage | null {
  const section = vietnameseSection(wikitext);
  if (section === null) return null;
  const stub = stubTarget(section);
  if (stub) return { entries: [], stubTarget: stub };

  const wiki = splitEntries(section);
  const rendered = splitHtmlEntries(vietnameseElements(html) ?? []);
  const sharedAudio = audioFileIn(wiki.shared);

  // Paired by title, each rendered entry used once: an entry the HTML split differently, or a page that repeats a
  // title, gets no rendered data instead of another entry's.
  const pool = [...rendered.entries];
  const built = wiki.entries.map((we) => {
    const he = wiki.numbered ? takeByTitle(pool, we.title) : rendered.entries[0];
    const ipa = he && (he.ipa.hanoi || he.ipa.saigon) ? he.ipa : rendered.sharedIpa;
    const senses: Sense[] = [];
    const posNames: string[] = [];
    (he?.pos ?? []).forEach((hp, j) => {
      if (!COUNTED_POS.has(hp.name)) return;
      posNames.push(hp.name);
      const wp = we.pos[j];
      const cls = wp?.name === hp.name ? wp.headword?.named.cls : undefined;
      const pos = cls ? `${hp.name} (classifier: ${wikiToText(cls)})` : hp.name;
      for (const meaning of hp.definitions) senses.push({ pos, meaning });
    });
    const entry: LookupEntry = {
      label: [we.title, [...new Set(posNames)].join(', ')].filter(Boolean).join(' · '),
      chars: charactersFromEntry(we),
      senses,
      etymology: he?.etymology ?? '',
      ipaHanoi: ipa.hanoi,
      ipaSaigon: ipa.saigon,
    };
    const audio = audioFileIn(we.text) ?? sharedAudio;
    if (audio) entry.audioFile = audio;
    return { entry, counted: posNames.length > 0 };
  });

  const kept = built.filter((b) => b.counted);
  return { entries: (kept.length > 0 ? kept : built.slice(0, 1)).map((b) => b.entry), stubTarget: null };
}
