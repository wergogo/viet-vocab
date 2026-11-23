import { writable, type Readable } from 'svelte/store';
import { SyncError, stopsAutoSync, type SyncErrorKind } from './errors';

/** What Settings shows about sync (spec §7.4). `idle` means nothing waits: Settings adds the last sync's time. */
export type SyncStatus =
  | { state: 'off' }
  | { state: 'idle' }
  | { state: 'waiting' }
  | { state: 'syncing' }
  | { state: 'offline' }
  | { state: 'error'; kind: SyncErrorKind; message: string };

export interface SchedulerDeps {
  /** Whether sync is set up on this device. */
  configured: () => boolean;
  /** Whether local changes wait to be pushed. */
  hasChanges: () => boolean;
  /** One sync cycle; rejects with a SyncError, or with another error for a failure on this device. */
  runCycle: () => Promise<unknown>;
  /** Runs the task while holding a lock every tab of the app shares, so one tab syncs at a time (M4 decision 10). */
  withLock: (task: () => Promise<void>) => Promise<void>;
  online: () => boolean;
  visible: () => boolean;
  now: () => number;
  /** Fires 'change' after each local edit (db/dirty.ts). */
  changes: EventTarget;
  /** Fires 'online' and 'offline'. */
  window: EventTarget;
  /** Fires 'visibilitychange'. */
  document: EventTarget;
}

/** Spec §7.4: a cycle runs this long after the last local change… */
export const CHANGE_DELAY_MS = 5_000;
/** …and when the app becomes visible again, at most this often. */
export const VISIBLE_GAP_MS = 30_000;

type Trigger = 'start' | 'change' | 'visible' | 'hidden' | 'review' | 'online' | 'release' | 'manual' | 'settings';

/**
 * A request queued during a cycle keeps what it may skip: a request by hand any wait, and hiding the app, showing it
 * and starting a review the hold. A queued `change` must not win over those, or the hold would then drop it.
 */
const STRENGTH: Record<Trigger, number> = {
  start: 0,
  change: 0,
  online: 0,
  release: 0,
  visible: 1,
  hidden: 1,
  review: 1,
  manual: 2,
  settings: 2,
};

/** When sync cycles run (spec §7.4, M4 decisions 10 and 11), and what Settings shows about them. */
export class SyncScheduler {
  readonly #status = writable<SyncStatus>({ state: 'off' });
  readonly status: Readable<SyncStatus> = { subscribe: this.#status.subscribe };
  readonly #deps: SchedulerDeps;
  #running = false;
  /** The strongest request made while a cycle ran, to run after it. */
  #queued: Trigger | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #holds = 0;
  /** How the last cycle failed; null after a success. */
  #error: SyncError | null = null;
  /** A cycle was due while offline, so coming back online runs one. */
  #missed = false;
  #lastEnd = Number.NEGATIVE_INFINITY;
  #listeners: (() => void)[] = [];

  constructor(deps: SchedulerDeps) {
    this.#deps = deps;
  }

  /** Listens for the triggers, and syncs once: spec §7.4 syncs on app start. */
  start(): void {
    this.stop();
    const listen = (target: EventTarget, type: string, handler: () => void) => {
      target.addEventListener(type, handler);
      this.#listeners.push(() => target.removeEventListener(type, handler));
    };
    listen(this.#deps.changes, 'change', () => this.#changed());
    listen(this.#deps.window, 'online', () => {
      if (this.#missed || this.#deps.hasChanges()) this.#request('online');
      else this.#settle();
    });
    listen(this.#deps.window, 'offline', () => this.#settle());
    listen(this.#deps.document, 'visibilitychange', () => this.#visibilityChanged());
    this.#request('start');
  }

  stop(): void {
    for (const remove of this.#listeners) remove();
    this.#listeners = [];
    clearTimeout(this.#timer);
    this.#queued = null;
  }

  /** Sync now, from Settings: runs even after an error that stops automatic syncs, and during review. */
  syncNow(): void {
    this.#request('manual');
  }

  /** The sync settings changed or were removed: forget the last error, and sync with the new settings. */
  settingsChanged(): void {
    this.#request('settings');
  }

  /**
   * Holds automatic syncs while a review session runs (M4 decision 11). Hiding the app still pushes, and showing it again
   * still pulls, so a session doesn't review cards from states another device has moved on from. So does starting a
   * session after the window stayed on screen a while: the first hold pulls first. Returns the release.
   */
  hold(): () => void {
    this.#holds++;
    if (this.#holds === 1 && this.#deps.now() - this.#lastEnd >= VISIBLE_GAP_MS) this.#request('review');
    let holding = true;
    return () => {
      if (!holding) return;
      holding = false;
      this.#holds--;
      if (this.#holds === 0 && (this.#missed || this.#deps.hasChanges())) this.#request('release');
      else this.#settle();
    };
  }

  #changed(): void {
    if (!this.#deps.configured()) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#request('change'), CHANGE_DELAY_MS);
    this.#settle();
  }

  #visibilityChanged(): void {
    if (this.#deps.visible()) {
      if (this.#deps.now() - this.#lastEnd >= VISIBLE_GAP_MS) this.#request('visible');
    } else if (this.#deps.hasChanges()) {
      // The page may be frozen or closed soon, so changes go up at once, even during review (M4 decision 10).
      this.#request('hidden');
    }
  }

  #request(trigger: Trigger): void {
    if (!this.#deps.configured()) {
      clearTimeout(this.#timer);
      this.#settle();
      return;
    }
    const byHand = trigger === 'manual' || trigger === 'settings';
    // A request by hand forgets the last error, or automatic requests made while it runs would be dropped.
    if (byHand) this.#error = null;
    if (!byHand && this.#error && stopsAutoSync(this.#error.kind)) return;
    if (!byHand && trigger !== 'hidden' && trigger !== 'visible' && trigger !== 'review' && this.#holds > 0) {
      this.#settle();
      return;
    }
    if (!this.#deps.online()) {
      this.#missed = true;
      this.#settle();
      return;
    }
    if (this.#running) {
      if (this.#queued === null || STRENGTH[trigger] > STRENGTH[this.#queued]) this.#queued = trigger;
      return;
    }
    // This cycle takes every change made so far.
    clearTimeout(this.#timer);
    void this.#run();
  }

  async #run(): Promise<void> {
    this.#running = true;
    this.#missed = false;
    this.#status.set({ state: 'syncing' });
    try {
      await this.#deps.withLock(async () => {
        await this.#deps.runCycle();
      });
      this.#error = null;
    } catch (e) {
      if (!(e instanceof SyncError)) console.error('Sync failed', e);
      this.#error =
        e instanceof SyncError
          ? e
          : new SyncError('unexpected', `Sync failed on this device: ${e instanceof Error ? e.message : String(e)}`);
      if (this.#error.kind === 'network' && !this.#deps.online()) this.#missed = true;
    }
    this.#running = false;
    this.#lastEnd = this.#deps.now();
    this.#settle();
    const queued = this.#queued;
    this.#queued = null;
    if (queued) this.#request(queued);
  }

  /** Shows the state between cycles. An error a retry won't fix shows even offline, since it needs the user. */
  #settle(): void {
    if (this.#running) return;
    const error = this.#error;
    const errorStatus = (e: SyncError): SyncStatus => ({ state: 'error', kind: e.kind, message: e.message });
    let status: SyncStatus;
    if (!this.#deps.configured()) status = { state: 'off' };
    else if (error && stopsAutoSync(error.kind)) status = errorStatus(error);
    else if (!this.#deps.online()) status = { state: 'offline' };
    else if (error) status = errorStatus(error);
    else if (this.#deps.hasChanges()) status = { state: 'waiting' };
    else status = { state: 'idle' };
    this.#status.set(status);
  }
}
