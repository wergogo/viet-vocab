import { describe, expect, it, vi } from 'vitest';
import { requestPersistentStorage, type PersistentStorage } from './persist';

/** A StorageManager whose data is or isn't persistent yet, and that grants or refuses a request. */
function storage(persisted: boolean, grants: boolean) {
  return { persisted: vi.fn(async () => persisted), persist: vi.fn(async () => grants) };
}

describe('requestPersistentStorage', () => {
  it('asks only while the data is not persistent yet', async () => {
    const already = storage(true, false);
    expect(await requestPersistentStorage(already)).toBe(true);
    expect(already.persist).not.toHaveBeenCalled();

    const asked = storage(false, true);
    expect(await requestPersistentStorage(asked)).toBe(true);
    expect(asked.persist).toHaveBeenCalledOnce();
  });

  it('reports a refusal, a browser without the API, and a failure as not persistent', async () => {
    expect(await requestPersistentStorage(storage(false, false))).toBe(false);
    expect(await requestPersistentStorage({} as PersistentStorage)).toBe(false);
    const failing = {
      persisted: vi.fn(async (): Promise<boolean> => {
        throw new Error('blocked');
      }),
      persist: vi.fn(async () => true),
    };
    expect(await requestPersistentStorage(failing)).toBe(false);
  });
});
