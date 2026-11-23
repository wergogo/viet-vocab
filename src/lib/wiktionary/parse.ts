/** A `<style>` element with its CSS, such as the TemplateStyles that Wiktionary puts inside an entry. */
const STYLE_ELEMENT = /<style\b[^>]*>[\s\S]*?<\/style\s*>/gi;
/** A start tag. Text can't match one, since Wiktionary's HTML escapes a `<` in text as `&lt;`. */
const START_TAG = /<[a-z][^>]*>/gi;
const STYLE_ATTRIBUTE = /\sstyle\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * Parses Wiktionary HTML, to be read only (spec §6.2). Its inline styles are dropped first, both `<style>` elements
 * and `style` attributes: Chrome checks them against the page's Content-Security-Policy (`style-src 'self'`) even in
 * a parsed document that is never shown, and logs a violation for each one. The parsers read only text, and skip
 * `<style>` elements anyway, so nothing they use is lost.
 */
export function parseHtml(html: string): Document {
  const unstyled = html.replace(STYLE_ELEMENT, '').replace(START_TAG, (tag) => tag.replace(STYLE_ATTRIBUTE, ''));
  return new DOMParser().parseFromString(unstyled, 'text/html');
}
