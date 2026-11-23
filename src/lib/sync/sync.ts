import { isDirty, localChanges } from '../db/dirty';
import { lastSync, syncConfig, type SyncConfig } from './config';
import { runSyncCycle } from './cycle';
import { SyncScheduler } from './scheduler';

/** Runs a sync under a lock every tab of the app shares, so two tabs never sync at once (M4 decision 10). */
async function withSyncLock(task: () => Promise<void>): Promise<void> {
  if (navigator.locks) await navigator.locks.request('viet-vocab-sync', task);
  else await task();
}

const scheduler = new SyncScheduler({
  configured: () => syncConfig.get() !== null,
  hasChanges: isDirty,
  runCycle: async () => {
    const config = syncConfig.get();
    if (config) await runSyncCycle(config);
  },
  withLock: withSyncLock,
  online: () => navigator.onLine,
  visible: () => document.visibilityState === 'visible',
  now: () => Date.now(),
  changes: localChanges,
  window,
  document,
});

/** What Settings and the tab bar show about sync. */
export const syncStatus = scheduler.status;

/** Starts syncing (spec §7.4: on app start), and follows sync settings changed here or in another tab. */
export function startSync(): void {
  scheduler.start();
  let first = true;
  syncConfig.subscribe(() => {
    if (first) first = false;
    else scheduler.settingsChanged();
  });
}

/** Sync now, from Settings. */
export function syncNow(): void {
  scheduler.syncNow();
}

/** Holds automatic syncs while a review session runs (M4 decision 11); call the result to release. */
export function holdSync(): () => void {
  return scheduler.hold();
}

/** Saves this device's sync settings, and syncs with them. Null stops syncing here and forgets the token. */
export function saveSyncConfig(config: SyncConfig | null): void {
  if (config === null) lastSync.set(null);
  syncConfig.set(config);
}
