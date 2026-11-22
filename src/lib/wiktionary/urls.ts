/** The Vietnamese section of a Wiktionary page. Callers pass the page title (traditional form for characters). */
export function wiktionaryUrl(title: string): string {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}#Vietnamese`;
}
