import { readable } from 'svelte/store';

export type Route =
  | { name: 'words' }
  | { name: 'word'; id: string }
  | { name: 'add'; word: string }
  | { name: 'edit'; id: string }
  | { name: 'char'; char: string }
  | { name: 'settings' };

/** decodeURIComponent that returns '' for malformed escapes, so a bad link falls back instead of throwing. */
function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return '';
  }
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q);
  const query = q < 0 ? '' : raw.slice(q + 1);
  const [name = '', arg = ''] = path.split('/');
  const param = arg ? safeDecode(arg) : '';
  switch (name) {
    case 'word':
      return param ? { name: 'word', id: param } : { name: 'words' };
    case 'edit':
      return param ? { name: 'edit', id: param } : { name: 'words' };
    case 'char':
      return param ? { name: 'char', char: param } : { name: 'words' };
    case 'add':
      return { name: 'add', word: new URLSearchParams(query).get('w') ?? '' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'words' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'words':
      return '#/words';
    case 'word':
      return `#/word/${encodeURIComponent(route.id)}`;
    case 'edit':
      return `#/edit/${encodeURIComponent(route.id)}`;
    case 'char':
      return `#/char/${encodeURIComponent(route.char)}`;
    case 'add':
      return route.word ? `#/add?w=${encodeURIComponent(route.word)}` : '#/add';
    case 'settings':
      return '#/settings';
  }
}

/** The current route, updated on every hash change. */
export const route = readable<Route>(parseHash(location.hash), (set) => {
  const update = () => set(parseHash(location.hash));
  update();
  window.addEventListener('hashchange', update);
  return () => window.removeEventListener('hashchange', update);
});

export function navigate(r: Route): void {
  location.hash = href(r);
}
