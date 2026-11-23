import { readable } from 'svelte/store';

export type Route =
  | { name: 'words' }
  | { name: 'word'; id: string }
  | { name: 'add'; word: string; lookup?: boolean }
  | { name: 'edit'; id: string }
  | { name: 'char'; char: string }
  | { name: 'review'; listId?: string }
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
    case 'add': {
      // `lookup=1` (from a character page's compounds) opens the form with the word already looked up.
      const params = new URLSearchParams(query);
      const word = params.get('w') ?? '';
      return word && params.get('lookup') === '1' ? { name: 'add', word, lookup: true } : { name: 'add', word };
    }
    case 'review': {
      // `list=<id>` reviews one list (spec §5.5); the Words screen's chip passes its list filter.
      const listId = new URLSearchParams(query).get('list');
      return listId ? { name: 'review', listId } : { name: 'review' };
    }
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
      if (!route.word) return '#/add';
      return `#/add?w=${encodeURIComponent(route.word)}${route.lookup ? '&lookup=1' : ''}`;
    case 'review':
      return route.listId ? `#/review?list=${encodeURIComponent(route.listId)}` : '#/review';
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
