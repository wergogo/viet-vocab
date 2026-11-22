export const API_URL = 'https://en.wiktionary.org/w/api.php';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Calls the global fetch unbound, which some browsers require ("Illegal invocation" otherwise). */
export const defaultFetch: FetchFn = (url, init) => fetch(url, init);

export type LookupErrorKind = 'offline' | 'network' | 'http' | 'response';

/** A failed request the user can retry (spec §6.5). The message is ready to show. */
export class LookupError extends Error {
  override name = 'LookupError';
  readonly kind: LookupErrorKind;
  readonly status: number | undefined;

  constructor(kind: LookupErrorKind, message: string, status?: number) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

const UNREADABLE = 'Wiktionary sent a response the app could not read. Retry later.';

/** GET on the action API with the parameters every request carries (spec §6). */
export async function apiGet(params: Record<string, string>, fetchFn: FetchFn = defaultFetch): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new LookupError('offline', "You're offline. Lookups need a connection; you can still fill in the word by hand.");
  }
  const url = new URL(API_URL);
  for (const [key, value] of Object.entries({ ...params, format: 'json', formatversion: '2', origin: '*' })) {
    url.searchParams.set(key, value);
  }
  let response: Response;
  try {
    response = await fetchFn(url.toString(), { headers: { 'Api-User-Agent': 'VietVocab/1.0' } });
  } catch {
    throw new LookupError('network', "Couldn't reach Wiktionary. Check the connection, then retry.");
  }
  if (!response.ok) {
    const message =
      response.status === 429
        ? 'Wiktionary is busy. Wait a moment, then retry.'
        : `Wiktionary returned an error (HTTP ${response.status}). Retry later.`;
    throw new LookupError('http', message, response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new LookupError('response', UNREADABLE);
  }
}

export interface PageSource {
  title: string;
  wikitext: string;
  /** Rendered HTML; empty when the request didn't ask for it. */
  html: string;
}

/** An `action=parse` response: the page, or null when it doesn't exist. */
export function readParse(body: unknown): PageSource | null {
  const b = body as { parse?: { title?: unknown; wikitext?: unknown; text?: unknown }; error?: { code?: unknown } } | null;
  const code = b?.error?.code;
  if (code === 'missingtitle' || code === 'invalidtitle') return null;
  const p = b?.parse;
  if (b?.error || !p || typeof p.title !== 'string' || typeof p.wikitext !== 'string') {
    throw new LookupError('response', UNREADABLE);
  }
  return { title: p.title, wikitext: p.wikitext, html: typeof p.text === 'string' ? p.text : '' };
}

/** The titles that exist, from an `action=query&titles=…` response. */
export function existingTitles(body: unknown): Set<string> {
  type QueryPage = { title?: unknown; missing?: unknown; invalid?: unknown };
  const pages = (body as { query?: { pages?: QueryPage[] } } | null)?.query?.pages ?? [];
  const titles = pages.filter((p) => !p.missing && !p.invalid).map((p) => p.title);
  return new Set(titles.filter((t): t is string => typeof t === 'string'));
}

/** The wikitext of an `action=expandtemplates` response. */
export function readExpanded(body: unknown): string {
  const text = (body as { expandtemplates?: { wikitext?: unknown } } | null)?.expandtemplates?.wikitext;
  if (typeof text !== 'string') throw new LookupError('response', UNREADABLE);
  return text;
}
