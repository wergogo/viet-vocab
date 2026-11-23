/**
 * The Content-Security-Policy that production builds carry in a meta tag (spec §7.5). The dev server goes without,
 * since its module reloading needs more. A `fake-sync` build also reaches the local stand-in for GitHub (M4 decision 17).
 */
export function contentSecurityPolicy(mode: string): string {
  const connect = ["'self'", 'https://en.wiktionary.org', 'https://api.github.com'];
  if (mode === 'fake-sync') connect.push('http://localhost:8787');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self'",
    `connect-src ${connect.join(' ')}`,
    // Special:FilePath on Commons redirects to upload.wikimedia.org.
    'media-src https://commons.wikimedia.org https://upload.wikimedia.org',
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}
