import { describe, expect, it } from 'vitest';
import { readExpanded } from './api';
import { ipaFromExpanded } from './ipa';
import { CACHE_VERSION } from './lookup';
import { parseCharPage } from './parseChar';
import { parseWordPage } from './parseWord';
import { FIXTURES, fixturePage } from './test-fixtures';

/** FNV-1a: enough to notice any change in the parsed output. */
function digest(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** What the parsers make of every fixture: word pages, character pages and IPA answers. */
function parsedFixtures(): unknown[] {
  return Object.keys(FIXTURES)
    .sort()
    .map((name) => {
      const body = FIXTURES[name] as { parse?: { text?: string }; expandtemplates?: unknown };
      if (name.startsWith('char-')) {
        const page = fixturePage(name);
        return parseCharPage(page.title, page.wikitext);
      }
      if (body.parse?.text !== undefined) {
        const page = fixturePage(name);
        return parseWordPage(page.wikitext, page.html);
      }
      if (body.expandtemplates !== undefined) return ipaFromExpanded(readExpanded(body));
      return null;
    });
}

describe('CACHE_VERSION', () => {
  // M2 decision 13: cached lookups keep what older parsing returned until the version changes. When this test fails
  // because parsing returns something else, bump CACHE_VERSION in lookup.ts and update both values below. A new
  // fixture changes the digest too; then only the digest needs updating.
  it('changes whenever parsing changes what a lookup returns', () => {
    expect({ CACHE_VERSION, parsed: digest(JSON.stringify(parsedFixtures())) }).toEqual({
      CACHE_VERSION: 1,
      parsed: '7babda26',
    });
  });
});
