// A stand-in for the parts of GitHub's REST API that sync uses, so sync can be tried in the browser without a GitHub
// repository or token (M4 decision 17). Files live in memory: restarting starts over.
//
//   npm run fake-github      listens on http://localhost:8787, on this computer only (its files are open to anyone
//                            who can reach it, so it takes no connections from the network)
//   npm run dev:fake-sync    the app on http://localhost:5174, syncing with it (.env.fake-sync)
//
// Two origins, such as http://a.localhost:5174 and http://b.localhost:5174, keep separate data, like two devices.
// Any owner, repository and token work, except the token "bad-token" (refused) and a repository named "public"
// (public). The only branch is "main".
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 8787);
/** File contents by "owner/repo@branch:path". */
const files = new Map();

/** GitHub matches owner and repository names in any case, but not branches or paths. */
const fileKey = (owner, repo, branch, path) => `${owner.toLowerCase()}/${repo.toLowerCase()}@${branch}:${path}`;

const blobSha = (bytes) => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag', ...headers });
  res.end(body);
}

const json = (res, status, value) => send(res, status, JSON.stringify(value), { 'Content-Type': 'application/json' });

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  res.on('finish', () => console.log(`${req.method} ${url.pathname}${url.search} ${res.statusCode}`));
  if (req.method === 'OPTIONS') {
    return send(res, 204, null, {
      'Access-Control-Allow-Methods': 'GET, PUT',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-None-Match, X-GitHub-Api-Version',
    });
  }
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ') || auth === 'Bearer bad-token') return json(res, 401, { message: 'Bad credentials' });
  const match = /^\/repos\/([^/]+)\/([^/]+)(?:\/(branches|contents)\/(.+))?$/.exec(url.pathname);
  if (!match) return json(res, 404, { message: 'Not Found' });
  const [owner, repo, kind, rest] = match.slice(1).map((part) => part && decodeURIComponent(part));
  if (!kind) return json(res, 200, { private: repo !== 'public', default_branch: 'main' });
  if (kind === 'branches') return rest === 'main' ? json(res, 200, { name: 'main' }) : json(res, 404, { message: 'Branch not found' });

  if (req.method === 'GET') {
    const branch = url.searchParams.get('ref') ?? 'main';
    if (branch !== 'main') return json(res, 404, { message: `No commit found for the ref ${branch}` });
    const file = files.get(fileKey(owner, repo, branch, rest));
    if (!file) return json(res, 404, { message: 'Not Found' });
    const sha = blobSha(file);
    if (req.headers['if-none-match'] === `"${sha}"`) return send(res, 304, null);
    return send(res, 200, file, { 'Content-Type': 'application/vnd.github.raw+json; charset=utf-8', ETag: `"${sha}"` });
  }
  if (req.method === 'PUT') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      body = null;
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return json(res, 400, { message: 'Problems parsing JSON' });
    if (typeof body.content !== 'string') return json(res, 422, { message: 'Invalid request. "content" wasn\'t supplied.' });
    const key = fileKey(owner, repo, body.branch ?? 'main', rest);
    const current = files.get(key);
    if (current && !body.sha) return json(res, 422, { message: 'Invalid request. "sha" wasn\'t supplied.' });
    if (current ? body.sha !== blobSha(current) : body.sha) return json(res, 409, { message: `${rest} does not match` });
    const bytes = Buffer.from(body.content, 'base64');
    files.set(key, bytes);
    return json(res, current ? 200 : 201, { content: { path: rest, sha: blobSha(bytes) }, commit: { message: body.message } });
  }
  return json(res, 405, { message: 'Method not allowed' });
});

server.listen(port, 'localhost', () => console.log(`Fake GitHub API on http://localhost:${port}`));
