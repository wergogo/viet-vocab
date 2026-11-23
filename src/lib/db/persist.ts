/** The parts of the browser's StorageManager this module uses. */
export type PersistentStorage = Pick<StorageManager, 'persist' | 'persisted'>;

/**
 * Asks the browser to keep this site's data when the device runs low on space (spec §10). Chrome decides by itself,
 * and grants it to installed apps; Firefox may ask the user. Returns whether the data is now persistent.
 */
export async function requestPersistentStorage(
  storage: PersistentStorage | undefined = globalThis.navigator?.storage,
): Promise<boolean> {
  if (typeof storage?.persist !== 'function' || typeof storage.persisted !== 'function') return false;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}
