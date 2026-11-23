/** Why a sync failed (spec §7.4, §11). The message names the cause in words for Settings. */
export type SyncErrorKind =
  | 'auth'
  | 'forbidden'
  | 'not-found'
  | 'no-branch'
  | 'public-repo'
  | 'rate-limited'
  | 'network'
  | 'server'
  | 'conflict'
  | 'newer-schema'
  | 'bad-file'
  | 'bad-local-data'
  | 'insecure-page'
  | 'unexpected';

export class SyncError extends Error {
  override name = 'SyncError';

  constructor(
    readonly kind: SyncErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** Failures a retry won't fix: automatic syncs wait until the settings change or the user syncs by hand (M4 decision 6). */
const STOPPING: ReadonlySet<SyncErrorKind> = new Set([
  'auth',
  'forbidden',
  'not-found',
  'no-branch',
  'public-repo',
  'newer-schema',
  'bad-file',
  'bad-local-data',
  'insecure-page',
]);

export function stopsAutoSync(kind: SyncErrorKind): boolean {
  return STOPPING.has(kind);
}
