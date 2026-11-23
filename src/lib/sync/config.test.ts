import { beforeEach, describe, expect, it } from 'vitest';
import { cleanConfig, configProblems, fileKey, isClassicToken, lastSync, SYNC_DEFAULTS, syncConfig, type SyncConfig } from './config';

const good: SyncConfig = { owner: 'me', ...SYNC_DEFAULTS, token: 'github_pat_abc' };

beforeEach(() => {
  localStorage.clear();
});

describe('cleanConfig', () => {
  it('trims every field and forgives a leading slash, an @ and a .git ending', () => {
    expect(cleanConfig({ owner: ' @me ', repo: 'viet-vocab-data.git ', branch: ' main', path: '/data/vocab.json', token: ' t \n' })).toEqual({
      owner: 'me',
      repo: 'viet-vocab-data',
      branch: 'main',
      path: 'data/vocab.json',
      token: 't',
    });
  });
});

describe('configProblems', () => {
  it('accepts the defaults with an owner and a token', () => {
    expect(configProblems(good)).toEqual({});
    expect(configProblems({ ...good, owner: 'my-name-2', repo: 'data_v2.x', branch: 'feature/sync', path: 'a/b.json' })).toEqual({});
  });

  it('names each field that breaks GitHub’s rules', () => {
    for (const owner of ['', '-me', 'me-', 'my--name', 'my name', 'a'.repeat(40)]) {
      expect(configProblems({ ...good, owner })).toHaveProperty('owner');
    }
    for (const repo of ['', 'my repo', '..', 'a/b']) expect(configProblems({ ...good, repo })).toHaveProperty('repo');
    for (const branch of ['', 'my branch', 'a..b', 'a/', '/a', '-a', 'a.lock', 'a/.b', 'a:b']) {
      expect(configProblems({ ...good, branch })).toHaveProperty('branch');
    }
    for (const path of ['', 'a//b.json', '../vocab.json', 'a\\b.json', 'dir/']) {
      expect(configProblems({ ...good, path })).toHaveProperty('path');
    }
    for (const token of ['', 'two words']) expect(configProblems({ ...good, token })).toHaveProperty('token');
  });

  it('accepts only printable ASCII in a token, so fetch can send it in a header', () => {
    expect(configProblems({ ...good, token: '' }).token).toBe('Paste the token from GitHub.');
    const hidden = `github_pat_${String.fromCharCode(0x200b)}abc`;
    for (const token of [hidden, 'tökén', 'a b']) {
      expect(configProblems({ ...good, token }).token).toBe(
        "The token has a character GitHub tokens don't have. Paste it again from GitHub.",
      );
    }
    expect(configProblems({ ...good, token: 'ghp_AZaz09_-~!' })).toEqual({});
  });
});

describe('tokens and keys', () => {
  it('recognizes classic tokens', () => {
    expect(isClassicToken('ghp_abc')).toBe(true);
    expect(isClassicToken('github_pat_abc')).toBe(false);
    expect(isClassicToken('gho_abc')).toBe(true);
    expect(isClassicToken('ghu_abc')).toBe(true);
    expect(isClassicToken('0123456789abcdef0123456789abcdef01234567')).toBe(true);
    expect(isClassicToken('0123456789abcdef0123456789abcdef0123456')).toBe(false);
  });

  it('names the file without regard to the case of owner and repository', () => {
    expect(fileKey({ ...good, owner: 'Me', repo: 'Viet-Vocab-Data' })).toBe(fileKey(good));
    expect(fileKey({ ...good, branch: 'Main' })).not.toBe(fileKey(good));
    expect(fileKey(good)).toBe('me/viet-vocab-data@main:vocab.json');
  });
});

describe('stored settings', () => {
  it('keeps the config and the last sync in localStorage', () => {
    syncConfig.set(good);
    expect(JSON.parse(localStorage.getItem('vv.sync.config') ?? '')).toEqual(good);
    expect(syncConfig.get()).toEqual(good);
    const last = { key: fileKey(good), sha: 'a'.repeat(40), records: 3, at: '2026-11-22T08:00:00.000Z' };
    lastSync.set(last);
    expect(lastSync.get()).toEqual(last);
    syncConfig.set(null);
    expect(localStorage.getItem('vv.sync.config')).toBeNull();
  });

  it('reads a damaged value as not set', () => {
    for (const text of ['{', '[]', '{"owner":"me"}', 'null']) {
      localStorage.setItem('vv.sync.config', text);
      expect(syncConfig.get()).toBeNull();
    }
    localStorage.setItem('vv.sync.last', JSON.stringify({ key: 'k', sha: 's', records: -1, at: 't' }));
    expect(lastSync.get()).toBeNull();
    localStorage.setItem('vv.sync.last', JSON.stringify({ key: 'k', sha: 's', records: 1, at: 'not a date' }));
    expect(lastSync.get()).toBeNull();
  });
});
