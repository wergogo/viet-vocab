/** What start() needs from the page, injected so startup can be tested without a browser or IndexedDB. */
export interface StartupDeps {
  /** Opens the database. */
  openDb: () => Promise<unknown>;
  /** Recomputes stored search keys when the derivation code changed (rederiveIfNeeded). */
  rederive: () => Promise<unknown>;
  mountApp: () => void;
  /** Shows a message in place of the app. */
  showError: (message: string) => void;
  /** Defaults to console.error. */
  logError?: (message: string, error: unknown) => void;
}

export type StartResult = 'mounted' | 'failed';

const STORAGE_FULL =
  "Your device is out of storage space, so Viet Vocab can't open your words. Free up some space, then reload.";
const STORAGE_BLOCKED =
  'Viet Vocab needs site storage (IndexedDB) to keep your words, and this browser is blocking it. ' +
  'Allow site data for this page (or leave private browsing), then reload.';
const OPEN_FAILED = "Viet Vocab couldn't open your saved words. Reload the page to try again.";

/** Error names for a browser that refuses site storage: blocked site data, some private modes, no IndexedDB at all. */
const BLOCKED_NAMES = new Set(['InvalidStateError', 'SecurityError', 'MissingAPIError']);

/** A property of a thrown value, when it is an object. */
function prop(value: unknown, key: 'name' | 'inner'): unknown {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

/**
 * What to tell the user when the database won't open. Dexie wraps the browser's error (for example an
 * OpenFailedError whose `inner` is an InvalidStateError), so the names of both count.
 */
export function storageErrorMessage(e: unknown): string {
  const names = [prop(e, 'name'), prop(prop(e, 'inner'), 'name')];
  if (names.includes('QuotaExceededError')) return STORAGE_FULL;
  if (names.some((n) => typeof n === 'string' && BLOCKED_NAMES.has(n))) return STORAGE_BLOCKED;
  return OPEN_FAILED;
}

/**
 * Opens the database, brings stored search keys up to date and mounts the app. Only a database that
 * won't open stops here. A failed re-derive is logged and the app opens anyway, so the user can still
 * reach their words and export a backup; rederiveIfNeeded tries again on the next start.
 */
export async function start(deps: StartupDeps): Promise<StartResult> {
  const logError = deps.logError ?? ((message: string, error: unknown) => console.error(message, error));
  try {
    await deps.openDb();
  } catch (e) {
    logError('Could not open the database.', e);
    deps.showError(storageErrorMessage(e));
    return 'failed';
  }
  try {
    await deps.rederive();
  } catch (e) {
    logError('Could not update the search keys; search may miss some words until a later start succeeds.', e);
  }
  deps.mountApp();
  return 'mounted';
}
