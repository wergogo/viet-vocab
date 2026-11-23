import { registerSW } from 'virtual:pwa-register';
import { Updater } from './updater';

const updater = new Updater();

/** True while a new version of the app waits to take over (spec §10). */
export const updateReady = updater.ready;

/** Registers the service worker. main.ts calls it first, before the database opens, so no new version goes unnoticed. */
export function startUpdates(): void {
  updater.start({
    register: registerSW,
    reloadPage: () => window.location.reload(),
    now: () => Date.now(),
    online: () => navigator.onLine,
    visible: () => document.visibilityState === 'visible',
    document,
  });
}

/** Reloads into the waiting version. Only the update bar's Reload button calls it. */
export function reloadToUpdate(): Promise<void> {
  return updater.reload();
}
