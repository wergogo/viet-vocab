import { nfc } from '../text/normalize';
import { parseHtml } from './parse';
import { wikiToText } from './templates';

export interface Ipa {
  hanoi: string;
  saigon: string;
}

interface IpaLine {
  label: string;
  ipas: string[];
}

function readLine(item: Element): IpaLine {
  // The accent label is a link: rendered as text in page HTML, as [[w:Hanoi|Hà Nội]] in expandtemplates output.
  const label = nfc(wikiToText(item.querySelector('.usage-label-accent')?.textContent ?? ''));
  const ipas = Array.from(item.querySelectorAll('.IPA'))
    .map((span) => (span.textContent ?? '').trim())
    .filter(Boolean);
  return { label, ipas };
}

function pick(lines: readonly IpaLine[]): Ipa {
  const join = (label: string) =>
    lines
      .filter((line) => line.label === label)
      .flatMap((line) => line.ipas)
      .join(' ~ ');
  return { hanoi: join('Hà Nội'), saigon: join('Saigon') };
}

/** Hà Nội and Saigon IPA from the pronunciation list items of a rendered page; Huế is ignored. */
export function ipaFromItems(items: readonly Element[]): Ipa {
  return pick(items.map(readLine));
}

/** The same, from the wikitext that `action=expandtemplates` returns for `{{vi-IPA|…}}` (spec §6.3). */
export function ipaFromExpanded(wikitext: string): Ipa {
  const lines = wikitext
    .split('\n')
    .filter((line) => line.startsWith('*'))
    .map((line) => readLine(parseHtml(line.replace(/^\*+\s*/, '')).body));
  return pick(lines);
}
