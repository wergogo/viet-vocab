import { writable, type Readable } from 'svelte/store';

/** How often, at most, coming back to the app asks whether a new version was deployed. */
export const UPDATE_CHECK_GAP_MS = 60 * 60 * 1000;

/** The options of vite-plugin-pwa's `registerSW` (from `virtual:pwa-register`) that this module uses. */
export interface RegisterOptions {
  onNeedRefresh?: () => void;
  onNeedReload?: () => void;
  onRegisteredSW?: (swUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  onRegisterError?: (error: unknown) => void;
}

/** vite-plugin-pwa's `registerSW`. The function it returns tells the waiting version to take over. */
export type RegisterSW = (options: RegisterOptions) => (reloadPage?: boolean) => Promise<void>;

/** What the updater needs from the page, passed in so tests can stand in for it. */
export interface UpdaterDeps {
  register: RegisterSW;
  reloadPage: () => void;
  now: () => number;
  online: () => boolean;
  visible: () => boolean;
  /** Fires 'visibilitychange'. */
  document: EventTarget;
}

/**
 * Follows the service worker (spec §10). When a new version has installed and waits, `ready` turns true and the update
 * bar offers Reload. Only the window where Reload is tapped reloads: other windows of the app keep their bar, so a
 * review there is never cut short. An update left waiting starts once every window of the app has closed.
 */
export class Updater {
  readonly #ready = writable(false);
  /** True while a new version waits to take over. */
  readonly ready: Readable<boolean> = { subscribe: this.#ready.subscribe };
  #deps: UpdaterDeps | null = null;
  #registration: ServiceWorkerRegistration | undefined;
  #skipWaiting: ((reloadPage?: boolean) => Promise<void>) | null = null;
  /** Set once this window's Reload has asked the waiting version to take over. */
  #reloadAsked = false;
  #lastCheck = Number.NEGATIVE_INFINITY;

  /** Registers the service worker, once, and asks for new versions when the app comes back on screen. */
  start(deps: UpdaterDeps): void {
    if (this.#deps) return;
    this.#deps = deps;
    // The browser itself checks for a new version as the page loads.
    this.#lastCheck = deps.now();
    this.#skipWaiting = deps.register({
      onNeedRefresh: () => this.#ready.set(true),
      // The new version took control. Without this, vite-plugin-pwa reloads every window that showed the bar.
      onNeedReload: () => {
        if (this.#reloadAsked) deps.reloadPage();
      },
      onRegisteredSW: (_url, registration) => {
        this.#registration = registration;
      },
      onRegisterError: (error) => console.error('The service worker could not be registered', error),
    });
    deps.document.addEventListener('visibilitychange', () => this.#check());
  }

  /**
   * Browsers look for a new version when a page loads, but an installed app resumed from the background, or a window
   * left open, loads nothing. So coming back on screen asks too: at most every UPDATE_CHECK_GAP_MS, and only online.
   */
  #check(): void {
    const deps = this.#deps;
    if (!deps || !this.#registration || !deps.visible() || !deps.online()) return;
    if (deps.now() - this.#lastCheck < UPDATE_CHECK_GAP_MS) return;
    this.#lastCheck = deps.now();
    this.#registration.update().catch(() => {
      // Offline after all, or a server error. The gap counts from this try, so a return to the app after
      // UPDATE_CHECK_GAP_MS asks again.
    });
  }

  /** Lets the waiting version take over and reloads this window into it; with nothing waiting, just reloads. */
  async reload(): Promise<void> {
    const deps = this.#deps;
    if (!deps) return;
    if (this.#registration?.waiting && this.#skipWaiting) {
      this.#reloadAsked = true;
      await this.#skipWaiting(true);
    } else {
      // Another window already let the new version take over, or this page isn't controlled yet.
      deps.reloadPage();
    }
  }
}
