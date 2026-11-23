import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from './csp';

describe('contentSecurityPolicy', () => {
  it('lets the app load only its own code, and reach only Wiktionary, GitHub and Commons audio', () => {
    expect(contentSecurityPolicy('production').split('; ')).toEqual([
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self'",
      "connect-src 'self' https://en.wiktionary.org https://api.github.com",
      'media-src https://commons.wikimedia.org https://upload.wikimedia.org',
      "object-src 'none'",
      "base-uri 'self'",
    ]);
  });

  it('lets only a fake-sync build reach the local stand-in for GitHub', () => {
    expect(contentSecurityPolicy('fake-sync')).toContain(
      "connect-src 'self' https://en.wiktionary.org https://api.github.com http://localhost:8787;",
    );
    expect(contentSecurityPolicy('production')).not.toContain('localhost');
  });
});
