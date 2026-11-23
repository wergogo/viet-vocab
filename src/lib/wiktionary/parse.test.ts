import { afterEach, describe, expect, it, vi } from 'vitest';
import { vietnameseElements } from './html';
import { ipaFromExpanded } from './ipa';
import { parseHtml } from './parse';
import { FIXTURES, fixturePage } from './test-fixtures';

describe('parseHtml', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('drops inline styles, both style elements and style attributes, and keeps everything else', () => {
    const doc = parseHtml(
      '<style data-mw-deduplicate="TemplateStyles:r1">.a > b{color:red}</style>' +
        `<p class="a" style="color:red">x <span style='font-size:90%'>y</span> <b style=bold data-style="kept">z</b></p>` +
        '<STYLE>.b{}</STYLE >',
    );
    expect(doc.querySelector('style')).toBeNull();
    expect(doc.body.innerHTML).toBe('<p class="a">x <span>y</span> <b data-style="kept">z</b></p>');
  });

  it('removes nothing but the inline styles from any saved page', () => {
    const names = Object.keys(FIXTURES).filter(
      (name) => typeof (FIXTURES[name] as { parse?: { text?: unknown } }).parse?.text === 'string',
    );
    expect(names.length).toBeGreaterThan(10);
    for (const name of names) {
      const { html } = fixturePage(name);
      const expected = new DOMParser().parseFromString(html, 'text/html');
      expected.querySelectorAll('style').forEach((el) => el.remove());
      expected.querySelectorAll('[style]').forEach((el) => el.removeAttribute('style'));
      expect(parseHtml(html).documentElement.outerHTML, name).toBe(expected.documentElement.outerHTML);
    }
  });

  it('keeps text that only mentions a style attribute', () => {
    expect(parseHtml('<p>Write style="color:red" here.</p>').body.textContent).toBe('Write style="color:red" here.');
  });

  // Chrome checks inline styles in a parsed document against the page's Content-Security-Policy (`style-src 'self'`),
  // even though the document is never shown, and logs a violation for each one.
  it('is how the Wiktionary parsers read HTML, so no inline style reaches DOMParser', () => {
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    const page = fixturePage('ha-noi').html;
    expect(page).toMatch(/<style[\s>]/);
    expect(page).toMatch(/\sstyle="/);
    expect(vietnameseElements(page)).not.toBeNull();
    const line =
      '* <span class="ib-content qualifier-content" style="font-size:90%"><span class="usage-label-accent">' +
      '[[w:Hanoi|Hà Nội]]</span></span>: <span class="IPA" style="white-space:nowrap">[a]</span>';
    expect(ipaFromExpanded(line)).toEqual({ hanoi: '[a]', saigon: '' });
    expect(parse).toHaveBeenCalledTimes(2);
    for (const [html] of parse.mock.calls) expect(html).not.toMatch(/<style[\s>]|\sstyle\s*=/i);
  });
});
