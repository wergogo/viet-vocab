import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { UPDATE_CHECK_GAP_MS, Updater, type RegisterOptions, type UpdaterDeps } from './updater';

/** An updater on a stand-in page; `waiting` says whether a new version waits in the registration. */
function setup(waiting = true) {
  let options: RegisterOptions = {};
  let time = 0;
  let online = true;
  let visible = true;
  const skipWaiting = vi.fn(async (_reloadPage?: boolean) => {});
  const registration = {
    waiting: waiting ? {} : null,
    update: vi.fn(async () => undefined),
  } as unknown as ServiceWorkerRegistration;
  const document = new EventTarget();
  const deps: UpdaterDeps = {
    register: vi.fn((o: RegisterOptions) => {
      options = o;
      return skipWaiting;
    }),
    reloadPage: vi.fn(),
    now: () => time,
    online: () => online,
    visible: () => visible,
    document,
  };
  const updater = new Updater();
  updater.start(deps);
  options.onRegisteredSW?.('sw.js', registration);
  return {
    updater,
    deps,
    skipWaiting,
    registration,
    options: () => options,
    later: (ms: number) => {
      time += ms;
    },
    goOnline: (on: boolean) => {
      online = on;
    },
    /** The app goes off screen, or comes back. */
    show: (on: boolean) => {
      visible = on;
      document.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

describe('Updater', () => {
  it('shows nothing until a new version waits, and switches this window when Reload is tapped', async () => {
    const t = setup();
    expect(get(t.updater.ready)).toBe(false);
    t.options().onNeedRefresh?.();
    expect(get(t.updater.ready)).toBe(true);

    await t.updater.reload();
    expect(t.skipWaiting).toHaveBeenCalledWith(true);
    // The page reloads once the new version has taken control.
    expect(t.deps.reloadPage).not.toHaveBeenCalled();
    t.options().onNeedReload?.();
    expect(t.deps.reloadPage).toHaveBeenCalledOnce();
  });

  it("leaves this window alone when another window's Reload switches versions", () => {
    const t = setup();
    t.options().onNeedRefresh?.();
    t.options().onNeedReload?.();
    expect(t.deps.reloadPage).not.toHaveBeenCalled();
    expect(get(t.updater.ready)).toBe(true);
  });

  it('just reloads when nothing waits any more', async () => {
    const t = setup(false);
    await t.updater.reload();
    expect(t.skipWaiting).not.toHaveBeenCalled();
    expect(t.deps.reloadPage).toHaveBeenCalledOnce();
  });

  it('asks for a new version when the app comes back on screen: at most hourly, and only online', () => {
    const t = setup();
    t.show(true);
    expect(t.registration.update).not.toHaveBeenCalled(); // the page load has just asked

    t.later(UPDATE_CHECK_GAP_MS);
    t.show(false);
    t.goOnline(false);
    t.show(true);
    expect(t.registration.update).not.toHaveBeenCalled();

    t.goOnline(true);
    t.show(true);
    expect(t.registration.update).toHaveBeenCalledOnce();

    t.later(UPDATE_CHECK_GAP_MS - 1);
    t.show(true);
    expect(t.registration.update).toHaveBeenCalledOnce();
  });

  it('registers once, and logs a failed registration', () => {
    const t = setup();
    t.updater.start(t.deps);
    expect(t.deps.register).toHaveBeenCalledOnce();

    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    t.options().onRegisterError?.(new Error('blocked'));
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it('does nothing on Reload before it started', async () => {
    await expect(new Updater().reload()).resolves.toBeUndefined();
  });
});
