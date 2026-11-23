/** Base64 of bytes: the GitHub contents API takes a file's new content this way. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // In chunks, since String.fromCharCode takes its arguments on the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** The id git gives a file's content (its blob), which the contents API calls the file's `sha` (M4 decision 1). */
export async function blobSha(bytes: Uint8Array): Promise<string> {
  const header = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const data = new Uint8Array(header.length + bytes.length);
  data.set(header);
  data.set(bytes, header.length);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-1', data));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
