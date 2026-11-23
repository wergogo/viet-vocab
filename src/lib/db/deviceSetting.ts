import { writable, type Readable } from 'svelte/store';

/**
 * Values whose last write to localStorage failed (storage full, or blocked). They stay in effect for the rest of this
 * session, as dirty.ts keeps its counter, so a setting doesn't snap back the next time its store reads storage.
 */
const unsaved = new Map<string, string | null>();
let listening = false;

/** Keeps a value storage refused, until this tab or another one saves that key. */
function keepUnsaved(key: string, text: string | null): void {
  unsaved.set(key, text);
  if (listening) return;
  listening = true;
  // Stores listen to other tabs only while subscribed, so this hears a save made while none is.
  window.addEventListener('storage', (e) => (e.key === null ? unsaved.clear() : unsaved.delete(e.key)));
}

function readStored(key: string): string | null {
  if (unsaved.has(key)) return unsaved.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, text: string | null): void {
  try {
    if (text === null) localStorage.removeItem(key);
    else localStorage.setItem(key, text);
    unsaved.delete(key);
  } catch {
    keepUnsaved(key, text);
  }
}

/** A per-device setting (spec §4.3: localStorage) as a store. */
export interface DeviceSetting<T> extends Readable<T> {
  /** Saves the value on this device and tells subscribers. */
  set(value: T): void;
  /** The saved value, for code that doesn't subscribe. */
  get(): T;
}

/**
 * Wraps one localStorage key in a store that also follows changes made in other tabs. `parse` turns the stored text
 * (null when there is none) into a value, and `serialize` turns a value back into text (null removes the key).
 */
export function deviceSetting<T>(
  key: string,
  parse: (text: string | null) => T,
  serialize: (value: T) => string | null,
): DeviceSetting<T> {
  const read = () => parse(readStored(key));
  const store = writable<T>(read(), (set) => {
    set(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key && e.key !== null) return;
      // Another tab saved or cleared this key, so its value replaces one this tab couldn't save.
      unsaved.delete(key);
      set(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  });
  return {
    subscribe: store.subscribe,
    get: read,
    set(value: T) {
      writeStored(key, serialize(value));
      store.set(value);
    },
  };
}
