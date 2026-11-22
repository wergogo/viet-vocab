/**
 * An update needed a record that was deleted, or never existed. Not named "NotFoundError": Dexie maps errors
 * with standard IndexedDB names (NotFoundError among them) to its own classes, which breaks instanceof.
 */
export class RecordNotFoundError extends Error {
  override name = 'RecordNotFoundError';
}
