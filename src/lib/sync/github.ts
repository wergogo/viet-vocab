import type { SyncConfig } from './config';
import { blobSha, toBase64 } from './encoding';
import { SyncError } from './errors';

/**
 * GitHub's REST API. Browser checks point it at a local stand-in with `VITE_GITHUB_API`, in fake-sync mode only (M4
 * decision 17), so a stray variable in a production build can't send tokens elsewhere.
 */
export const GITHUB_API: string =
  (import.meta.env.MODE === 'fake-sync' && import.meta.env.VITE_GITHUB_API) || 'https://api.github.com';

const READ_TIMEOUT_MS = 30_000;
/** Uploading a large file over a slow phone connection takes a while. */
const WRITE_TIMEOUT_MS = 120_000;

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** The sync file as pulled: its text and git blob sha; unchanged since the sha the pull named; or not there. */
export type Pulled = { status: 'found'; text: string; sha: string } | { status: 'unchanged' } | { status: 'absent' };

/** GitHub's own explanation of a failure, or '' without one. */
async function messageOf(response: Response): Promise<string> {
  const message = (await readJson(response))?.message;
  return typeof message === 'string' ? message : '';
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await response.json();
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The GitHub contents API for the one sync file (spec §7.3), with failures as SyncErrors that say what to fix. */
export class GitHubFiles {
  readonly #config: SyncConfig;
  readonly #fetch: FetchFn;

  constructor(config: SyncConfig, fetchFn: FetchFn = (url, init) => fetch(url, init)) {
    this.#config = config;
    this.#fetch = fetchFn;
  }

  get #repoName(): string {
    return `${this.#config.owner}/${this.#config.repo}`;
  }

  #repoUrl(rest = ''): string {
    const { owner, repo } = this.#config;
    return `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${rest}`;
  }

  #fileUrl(): string {
    return this.#repoUrl(`/contents/${this.#config.path.split('/').map(encodeURIComponent).join('/')}`);
  }

  /** Sends a request with the token. The browser cache is skipped, so a pull never sees an old copy of the file. */
  async #send(url: string, init: RequestInit, timeoutMs = READ_TIMEOUT_MS): Promise<Response> {
    const signal = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(timeoutMs) : undefined;
    try {
      return await this.#fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.#config.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...init.headers },
        cache: 'no-store',
        signal,
      });
    } catch {
      throw new SyncError('network', "Couldn't reach GitHub. Sync will try again later.");
    }
  }

  /**
   * What a failed answer means for the user (spec §11). `action` says what was asked: reading, changing the file, or
   * creating it (a push without a sha).
   */
  async #failure(response: Response, action: 'read' | 'change' | 'create' = 'read'): Promise<SyncError> {
    const { status } = response;
    const where = this.#repoName;
    if (status === 401) {
      return new SyncError('auth', 'GitHub refused the token. It may have expired or been revoked: create a new one and enter it here.');
    }
    const message = status === 403 || status === 422 ? await messageOf(response) : '';
    // A secondary rate limit can come as a 403 that only its message explains.
    const limited =
      response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after') || /rate limit/i.test(message);
    if (status === 429 || (status === 403 && limited)) {
      return new SyncError('rate-limited', 'GitHub asked the app to slow down. Sync will try again later.');
    }
    if (status === 403) {
      return new SyncError(
        'forbidden',
        `The token isn't allowed to ${action === 'read' ? 'read' : 'change'} ${where}. Give it access to this repository with “Contents: Read and write”.`,
      );
    }
    if (status === 404) {
      return new SyncError(
        'not-found',
        `GitHub can't find ${where}, or the token can't reach it. Check the owner and repository names, and that the token was given this repository.`,
      );
    }
    // 409: the sha the push named is no longer the file's. 422 to a create that speaks of the sha: the file appeared
    // meanwhile. Any other 422 (a branch that is gone, say) won't change on a retry.
    if (status === 409 || (status === 422 && action === 'create' && (message === '' || /\bsha\b/i.test(message)))) {
      return new SyncError('conflict', `${this.#config.path} changed on GitHub during the sync.`);
    }
    if (status === 422) return new SyncError('unexpected', `GitHub refused the upload${message ? `: ${message}` : '.'}`);
    if (status >= 500) return new SyncError('server', `GitHub had a problem (error ${status}). Sync will try again later.`);
    return new SyncError('unexpected', `GitHub answered with error ${status}.`);
  }

  /**
   * Checks that the repository exists, that the token reaches it, that it is private, and that it has the branch (M4
   * decision 4). Runs before the first sync with new settings, so a typo can't create the file somewhere else.
   */
  async checkRepository(): Promise<void> {
    const repo = await this.#send(this.#repoUrl(), { headers: { Accept: 'application/vnd.github+json' } });
    if (!repo.ok) throw await this.#failure(repo);
    const isPrivate = (await readJson(repo))?.private;
    if (typeof isPrivate !== 'boolean') {
      throw new SyncError('unexpected', `GitHub's answer about ${this.#repoName} couldn't be read.`);
    }
    if (isPrivate === false) {
      throw new SyncError(
        'public-repo',
        `${this.#repoName} is public, so anyone could read your words. Make it private on GitHub, or sync with a private repository.`,
      );
    }
    const { branch } = this.#config;
    const found = await this.#send(this.#repoUrl(`/branches/${encodeURIComponent(branch)}`), {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (found.status === 404) {
      throw new SyncError(
        'no-branch',
        `${this.#repoName} has no branch named “${branch}”. If the repository is empty, add a README on GitHub to create it.`,
      );
    }
    if (!found.ok) throw await this.#failure(found);
  }

  /**
   * Downloads the sync file as it is stored (M4 decision 1). With `knownSha`, GitHub answers "unchanged" without the
   * file when it still has that sha (M4 decision 2).
   */
  async pull(knownSha?: string): Promise<Pulled> {
    const headers: Record<string, string> = { Accept: 'application/vnd.github.raw+json' };
    if (knownSha) headers['If-None-Match'] = `"${knownSha}"`;
    const response = await this.#send(`${this.#fileUrl()}?ref=${encodeURIComponent(this.#config.branch)}`, { headers });
    if (response.status === 304) return { status: 'unchanged' };
    if (response.status === 404) return { status: 'absent' };
    if (!response.ok) throw await this.#failure(response);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new SyncError('network', 'The connection to GitHub broke off during the download.');
    }
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new SyncError(
        'bad-file',
        `${this.#config.path} in ${this.#repoName} isn't text this app wrote. Sync stopped, so the file isn't overwritten.`,
      );
    }
    return { status: 'found', text, sha: await blobSha(bytes) };
  }

  /** Uploads the file as one commit and returns its new sha. `sha` is the one pulled, or null to create the file. */
  async push(text: string, sha: string | null, message: string): Promise<string> {
    const body: Record<string, string> = {
      message,
      content: toBase64(new TextEncoder().encode(text)),
      branch: this.#config.branch,
    };
    if (sha) body.sha = sha;
    const response = await this.#send(
      this.#fileUrl(),
      {
        method: 'PUT',
        headers: { Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      WRITE_TIMEOUT_MS,
    );
    if (!response.ok) throw await this.#failure(response, sha ? 'change' : 'create');
    const content = (await readJson(response))?.content;
    const newSha = typeof content === 'object' && content !== null ? (content as Record<string, unknown>).sha : undefined;
    if (typeof newSha !== 'string') {
      throw new SyncError('unexpected', "GitHub saved the file, but its answer couldn't be read. The next sync checks it.");
    }
    return newSha;
  }
}
