import { describe, expect, it, vi } from 'vitest';
import { start, storageErrorMessage, type StartupDeps } from './startup';

const BLOCKED =
  'Viet Vocab needs site storage (IndexedDB) to keep your words, and this browser is blocking it. ' +
  'Allow site data for this page (or leave private browsing), then reload.';
const FULL = "Your device is out of storage space, so Viet Vocab can't open your words. Free up some space, then reload.";
const GENERIC = "Viet Vocab couldn't open your saved words. Reload the page to try again.";

/** An error with a DOM or Dexie error name, as IndexedDB and Dexie report them. */
function named(name: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error('x'), { name, ...extra });
}

function deps(over: Partial<StartupDeps> = {}) {
  return {
    openDb: vi.fn(() => Promise.resolve()),
    rederive: vi.fn(() => Promise.resolve()),
    mountApp: vi.fn(),
    showError: vi.fn(),
    logError: vi.fn(),
    ...over,
  };
}

describe('start', () => {
  it('mounts the app when the database opens and re-derives', async () => {
    const d = deps();
    expect(await start(d)).toBe('mounted');
    expect(d.rederive).toHaveBeenCalledOnce();
    expect(d.mountApp).toHaveBeenCalledOnce();
    expect(d.showError).not.toHaveBeenCalled();
    expect(d.logError).not.toHaveBeenCalled();
  });

  it('still mounts the app when re-deriving fails, and logs the error', async () => {
    const error = named('QuotaExceededError');
    const d = deps({ rederive: () => Promise.reject(error) });
    expect(await start(d)).toBe('mounted');
    expect(d.mountApp).toHaveBeenCalledOnce();
    expect(d.logError).toHaveBeenCalledWith(expect.any(String), error);
    expect(d.showError).not.toHaveBeenCalled();
  });

  it('shows the blocked-storage message when Dexie wraps an InvalidStateError, and does not mount', async () => {
    const error = named('OpenFailedError', { inner: named('InvalidStateError') });
    const d = deps({ openDb: () => Promise.reject(error) });
    expect(await start(d)).toBe('failed');
    expect(d.showError).toHaveBeenCalledWith(BLOCKED);
    expect(d.logError).toHaveBeenCalledWith(expect.any(String), error);
    expect(d.rederive).not.toHaveBeenCalled();
    expect(d.mountApp).not.toHaveBeenCalled();
  });

  it('says the device is out of space on a QuotaExceededError', async () => {
    const d = deps({ openDb: () => Promise.reject(named('QuotaExceededError')) });
    expect(await start(d)).toBe('failed');
    expect(d.showError).toHaveBeenCalledWith(FULL);
    expect(d.mountApp).not.toHaveBeenCalled();
  });

  it('shows a generic message for any other error', async () => {
    const d = deps({ openDb: () => Promise.reject(new Error('boom')) });
    expect(await start(d)).toBe('failed');
    expect(d.showError).toHaveBeenCalledWith(GENERIC);
    expect(d.mountApp).not.toHaveBeenCalled();
  });
});

describe('storageErrorMessage', () => {
  it('reads the error name and the name of a wrapped inner error', () => {
    expect(storageErrorMessage(named('SecurityError'))).toBe(BLOCKED);
    expect(storageErrorMessage(named('MissingAPIError'))).toBe(BLOCKED);
    expect(storageErrorMessage(named('OpenFailedError', { inner: named('QuotaExceededError') }))).toBe(FULL);
    expect(storageErrorMessage(named('OpenFailedError', { inner: named('AbortError') }))).toBe(GENERIC);
    for (const thrown of [null, undefined, 'InvalidStateError', 42]) expect(storageErrorMessage(thrown)).toBe(GENERIC);
  });
});
