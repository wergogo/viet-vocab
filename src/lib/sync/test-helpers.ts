import type { SyncConfig } from './config';
import { blobSha } from './encoding';
import { GITHUB_API, type FetchFn } from './github';

/** For tests only: the settings the fake repository answers to. */
export const TEST_CONFIG: SyncConfig = {
  owner: 'me',
  repo: 'viet-vocab-data',
  branch: 'main',
  path: 'vocab.json',
  token: 'github_pat_test',
};

export interface FakeGitHub {
  /** Answers like GitHub for the repository in TEST_CONFIG. */
  fetch: FetchFn;
  /** Each request as "METHOD what status", e.g. "GET file 304" (what: repo, branch, file). */
  log: string[];
  /** The repository is private unless a test says otherwise. */
  isPrivate: boolean;
  branches: string[];
  /** The text of a file, or undefined while there is none. */
  text(path?: string): string | undefined;
  /** Stores a file as another device's sync would. */
  store(text: string, path?: string): Promise<void>;
  /** The next requests get these statuses instead of their normal answers. */
  failNext(...statuses: number[]): void;
  /** Runs before each upload is handled, such as another device storing the file meanwhile. */
  beforePut: (() => Promise<void>) | null;
}

/** For tests only: an in-memory stand-in for the GitHub endpoints sync uses. */
export function fakeGitHub(): FakeGitHub {
  const files = new Map<string, { bytes: Uint8Array; sha: string }>();
  const failures: number[] = [];
  const decoder = new TextDecoder();

  const save = async (path: string, bytes: Uint8Array) => {
    const sha = await blobSha(bytes);
    files.set(path, { bytes, sha });
    return sha;
  };

  const fake: FakeGitHub = {
    log: [],
    isPrivate: true,
    branches: ['main'],
    beforePut: null,
    text: (path = TEST_CONFIG.path) => {
      const file = files.get(path);
      return file && decoder.decode(file.bytes);
    },
    store: async (text, path = TEST_CONFIG.path) => {
      await save(path, new TextEncoder().encode(text));
    },
    failNext: (...statuses) => {
      failures.push(...statuses);
    },
    fetch: async (url, init = {}) => {
      const method = init.method ?? 'GET';
      const headers = new Headers(init.headers);
      const route = new URL(url).pathname.slice(new URL(GITHUB_API).pathname.replace(/\/$/, '').length);
      const repoPath = `/repos/${TEST_CONFIG.owner}/${TEST_CONFIG.repo}`;
      const what = route === repoPath ? 'repo' : route.startsWith(`${repoPath}/branches/`) ? 'branch' : 'file';
      const answer = (status: number, body?: BodyInit | null, extra: Record<string, string> = {}) => {
        fake.log.push(`${method} ${what} ${status}`);
        return new Response(status === 204 || status === 304 ? null : body ?? null, { status, headers: extra });
      };
      const json = (status: number, value: unknown) => answer(status, JSON.stringify(value), { 'Content-Type': 'application/json' });

      const failure = failures.shift();
      if (failure !== undefined) return json(failure, { message: `failure ${failure}` });
      if (headers.get('Authorization') !== `Bearer ${TEST_CONFIG.token}`) return json(401, { message: 'Bad credentials' });
      if (!route.startsWith(`${repoPath}/`) && route !== repoPath) return json(404, { message: 'Not Found' });
      if (what === 'repo') return json(200, { private: fake.isPrivate, default_branch: 'main' });
      if (what === 'branch') {
        const branch = decodeURIComponent(route.slice(`${repoPath}/branches/`.length));
        return fake.branches.includes(branch) ? json(200, { name: branch }) : json(404, { message: 'Branch not found' });
      }
      const path = route.slice(`${repoPath}/contents/`.length).split('/').map(decodeURIComponent).join('/');
      const file = files.get(path);
      if (method === 'GET') {
        if (!file) return json(404, { message: 'Not Found' });
        if (headers.get('If-None-Match') === `"${file.sha}"`) return answer(304);
        return answer(200, file.bytes.slice(), { ETag: `"${file.sha}"` });
      }
      // PUT: create the file, or replace it when the request names its current sha.
      await fake.beforePut?.();
      const body = JSON.parse(String(init.body)) as { content: string; sha?: string; branch: string; message: string };
      const current = files.get(path);
      if (current && body.sha === undefined) return json(422, { message: 'Invalid request. "sha" wasn\'t supplied.' });
      if (current ? body.sha !== current.sha : body.sha !== undefined) return json(409, { message: 'sha does not match' });
      const sha = await save(path, Uint8Array.from(atob(body.content), (c) => c.charCodeAt(0)));
      return json(current ? 200 : 201, { content: { path, sha }, commit: { message: body.message } });
    },
  };
  return fake;
}
