import { describe, expect, it, vi } from 'vitest';
import { blobSha } from './encoding';
import { GitHubFiles, type FetchFn } from './github';
import { TEST_CONFIG } from './test-helpers';

const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

/** A fetch that answers every request with `answer` and keeps the requests. */
function answering(answer: (url: string, init: RequestInit) => Response) {
  return vi.fn<FetchFn>(async (url, init = {}) => answer(url, init));
}

const header = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name);

describe('GitHubFiles.pull', () => {
  it('downloads the file as stored, with the token, skipping the browser cache', async () => {
    const text = '{"app":"viet-vocab","words":["nhập khẩu"]}\n';
    const fetchFn = answering(() => new Response(text, { status: 200 }));
    const pulled = await new GitHubFiles({ ...TEST_CONFIG, branch: 'feature/x', path: 'data/my vocab.json' }, fetchFn).pull();
    expect(pulled).toEqual({ status: 'found', text, sha: await blobSha(new TextEncoder().encode(text)) });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/me/viet-vocab-data/contents/data/my%20vocab.json?ref=feature%2Fx');
    expect(header(init, 'Authorization')).toBe('Bearer github_pat_test');
    expect(header(init, 'Accept')).toBe('application/vnd.github.raw+json');
    expect(header(init, 'X-GitHub-Api-Version')).toBe('2022-11-28');
    expect(header(init, 'If-None-Match')).toBeNull();
    expect(init?.cache).toBe('no-store');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('asks whether the file still has a known sha, and reads 304 as unchanged', async () => {
    const fetchFn = answering(() => new Response(null, { status: 304 }));
    expect(await new GitHubFiles(TEST_CONFIG, fetchFn).pull('abc')).toEqual({ status: 'unchanged' });
    expect(header(fetchFn.mock.calls[0]![1], 'If-None-Match')).toBe('"abc"');
  });

  it('reads 404 as no file yet', async () => {
    expect(await new GitHubFiles(TEST_CONFIG, answering(() => json(404))).pull()).toEqual({ status: 'absent' });
  });

  it('refuses a file that isn’t UTF-8 text, and drops a byte order mark', async () => {
    const binary = answering(() => new Response(new Uint8Array([0xff, 0xfe, 0x00]), { status: 200 }));
    await expect(new GitHubFiles(TEST_CONFIG, binary).pull()).rejects.toMatchObject({ kind: 'bad-file' });
    const withBom = answering(() => new Response(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]), { status: 200 }));
    expect(await new GitHubFiles(TEST_CONFIG, withBom).pull()).toMatchObject({ text: '{}' });
  });

  it('reports a connection that breaks off during the download as a network problem', async () => {
    const broken = { ok: true, status: 200, arrayBuffer: () => Promise.reject(new TypeError('network error')) } as unknown as Response;
    await expect(new GitHubFiles(TEST_CONFIG, async () => broken).pull()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('GitHubFiles errors', () => {
  const failWith = (response: () => Response) => new GitHubFiles(TEST_CONFIG, answering(response)).pull();

  it('names the cause of each failure (spec §11)', async () => {
    await expect(failWith(() => json(401))).rejects.toMatchObject({ kind: 'auth', message: expect.stringContaining('refused the token') });
    await expect(failWith(() => json(403))).rejects.toMatchObject({ kind: 'forbidden', message: expect.stringContaining('me/viet-vocab-data') });
    await expect(failWith(() => json(403, {}, { 'x-ratelimit-remaining': '0' }))).rejects.toMatchObject({ kind: 'rate-limited' });
    await expect(failWith(() => json(403, {}, { 'retry-after': '60' }))).rejects.toMatchObject({ kind: 'rate-limited' });
    await expect(failWith(() => json(429))).rejects.toMatchObject({ kind: 'rate-limited' });
    const secondary = { message: 'You have exceeded a secondary rate limit. Please wait a few minutes.' };
    await expect(failWith(() => json(403, secondary))).rejects.toMatchObject({ kind: 'rate-limited' });
    await expect(failWith(() => json(502))).rejects.toMatchObject({ kind: 'server', message: expect.stringContaining('502') });
    await expect(failWith(() => json(418))).rejects.toMatchObject({ kind: 'unexpected' });
  });

  it('reports an unreachable GitHub as a network problem', async () => {
    const offline: FetchFn = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(new GitHubFiles(TEST_CONFIG, offline).pull()).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('GitHubFiles.checkRepository', () => {
  const repoAnswers = (repo: Response, branch: Response = json(200, { name: 'main' })) =>
    answering((url) => (url.includes('/branches/') ? branch : repo));

  it('passes for a private repository with the branch', async () => {
    const fetchFn = repoAnswers(json(200, { private: true }));
    await new GitHubFiles(TEST_CONFIG, fetchFn).checkRepository();
    expect(fetchFn.mock.calls.map(([url]) => url)).toEqual([
      'https://api.github.com/repos/me/viet-vocab-data',
      'https://api.github.com/repos/me/viet-vocab-data/branches/main',
    ]);
  });

  it('refuses a public repository, and names a missing repository or branch', async () => {
    const check = (fetchFn: FetchFn) => new GitHubFiles(TEST_CONFIG, fetchFn).checkRepository();
    await expect(check(repoAnswers(json(200, { private: false })))).rejects.toMatchObject({ kind: 'public-repo' });
    await expect(check(repoAnswers(json(404)))).rejects.toMatchObject({ kind: 'not-found' });
    await expect(check(repoAnswers(json(200, { private: true }), json(404)))).rejects.toMatchObject({
      kind: 'no-branch',
      message: expect.stringContaining('add a README'),
    });
  });

  it("doesn't take an answer it can't read for a public repository", async () => {
    const check = (repo: Response) => new GitHubFiles(TEST_CONFIG, repoAnswers(repo)).checkRepository();
    await expect(check(new Response('<html>', { status: 200 }))).rejects.toMatchObject({
      kind: 'unexpected',
      message: "GitHub's answer about me/viet-vocab-data couldn't be read.",
    });
    await expect(check(json(200, { private: 'no' }))).rejects.toMatchObject({ kind: 'unexpected' });
    await expect(check(json(200, { private: false }))).rejects.toMatchObject({ kind: 'public-repo' });
  });
});

describe('GitHubFiles.push', () => {
  it('uploads the text as base64 with the pulled sha, and returns the new sha', async () => {
    const fetchFn = answering(() => json(200, { content: { sha: 'new-sha' } }));
    const sha = await new GitHubFiles(TEST_CONFIG, fetchFn).push('nhập khẩu\n', 'old-sha', 'sync 2026-11-22T08:00:00.000Z');
    expect(sha).toBe('new-sha');
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe('https://api.github.com/repos/me/viet-vocab-data/contents/vocab.json');
    expect(init?.method).toBe('PUT');
    const body = JSON.parse(String(init?.body)) as Record<string, string>;
    expect(body).toEqual({
      message: 'sync 2026-11-22T08:00:00.000Z',
      content: btoa(String.fromCharCode(...new TextEncoder().encode('nhập khẩu\n'))),
      branch: 'main',
      sha: 'old-sha',
    });
  });

  it('creates the file without a sha; a 409, or a 422 to a create, means the file changed meanwhile', async () => {
    const create = answering(() => json(201, { content: { sha: 'first' } }));
    await new GitHubFiles(TEST_CONFIG, create).push('{}', null, 'sync');
    expect(JSON.parse(String(create.mock.calls[0]![1]?.body))).not.toHaveProperty('sha');
    const push = (status: number, sha: string | null, body: unknown = {}) =>
      new GitHubFiles(TEST_CONFIG, answering(() => json(status, body))).push('{}', sha, 'sync');
    await expect(push(409, 'old')).rejects.toMatchObject({ kind: 'conflict' });
    await expect(push(422, null)).rejects.toMatchObject({ kind: 'conflict' });
    // Any other 422 won't go away by pulling again, so it isn't retried as a conflict.
    await expect(push(422, 'old', { message: 'Branch not found' })).rejects.toMatchObject({
      kind: 'unexpected',
      message: 'GitHub refused the upload: Branch not found',
    });
    await expect(push(422, null, { message: 'Branch not found' })).rejects.toMatchObject({
      kind: 'unexpected',
      message: 'GitHub refused the upload: Branch not found',
    });
    await expect(push(422, null, { message: `Invalid request. "sha" wasn't supplied.` })).rejects.toMatchObject({
      kind: 'conflict',
    });
  });

  it('asks for write access when the token may only read', async () => {
    await expect(new GitHubFiles(TEST_CONFIG, answering(() => json(403))).push('{}', 'old', 'sync')).rejects.toMatchObject({
      kind: 'forbidden',
      message: expect.stringContaining('change'),
    });
  });

  it('reports an answer without the new sha', async () => {
    await expect(new GitHubFiles(TEST_CONFIG, answering(() => json(200, {}))).push('{}', 'old', 'sync')).rejects.toMatchObject({
      kind: 'unexpected',
    });
  });
});
