import { describe, expect, it } from 'vitest';
import { blobSha, toBase64 } from './encoding';

const utf8 = (text: string) => new TextEncoder().encode(text);

describe('toBase64', () => {
  it('encodes UTF-8 bytes, Vietnamese and Han text included', () => {
    expect(toBase64(utf8('Hello World!\n'))).toBe('SGVsbG8gV29ybGQhCg==');
    const text = 'nhập khẩu 入口';
    expect(new TextDecoder().decode(Uint8Array.from(atob(toBase64(utf8(text))), (c) => c.charCodeAt(0)))).toBe(text);
    expect(toBase64(new Uint8Array())).toBe('');
  });

  it('encodes content larger than one chunk', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256);
    const decoded = Uint8Array.from(atob(toBase64(bytes)), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(bytes);
  });
});

describe('blobSha', () => {
  it('gives the ids git and GitHub give the same content', async () => {
    // GitHub's sample repository octocat/Hello-World has a README with this content and sha.
    expect(await blobSha(utf8('Hello World!\n'))).toBe('980a0d5f19a64b4b30a87d4206aade58726b60e3');
    // git hash-object of an empty file.
    expect(await blobSha(new Uint8Array())).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  });
});
