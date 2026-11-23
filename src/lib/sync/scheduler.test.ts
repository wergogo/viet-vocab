import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncError } from './errors';
import { CHANGE_DELAY_MS, SyncScheduler, VISIBLE_GAP_MS } from './scheduler';

/** A scheduler whose cycles wait until the test ends them, with switches for the device's state. */
function setup() {
  const device = { configured: true, changes: false, online: true, visible: true };
  const changes = new EventTarget();
  const win = new EventTarget();
  const doc = new EventTarget();
  const pending: { resolve: () => void; reject: (e: unknown) => void }[] = [];
  const runCycle = vi.fn(() => new Promise<void>((resolve, reject) => pending.push({ resolve, reject })));
  const withLock = vi.fn((task: () => Promise<void>) => task());
  const scheduler = new SyncScheduler({
    configured: () => device.configured,
    hasChanges: () => device.changes,
    runCycle,
    withLock,
    online: () => device.online,
    visible: () => device.visible,
    now: () => Date.now(),
    changes,
    window: win,
    document: doc,
  });
  return {
    device,
    scheduler,
    runCycle,
    withLock,
    status: () => get(scheduler.status),
    /** An edit on this device. */
    edit() {
      device.changes = true;
      changes.dispatchEvent(new Event('change'));
    },
    /** Ends the oldest running cycle: it succeeds and clears the changes, or fails with `error`. */
    async finish(error?: unknown) {
      const cycle = pending.shift()!;
      if (error === undefined) {
        device.changes = false;
        cycle.resolve();
      } else {
        cycle.reject(error);
      }
      await vi.advanceTimersByTimeAsync(0);
    },
    fire(target: 'window' | 'document', type: string) {
      (target === 'window' ? win : doc).dispatchEvent(new Event(type));
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SyncScheduler', () => {
  it('syncs on start when sync is set up, under the lock every tab shares', async () => {
    const s = setup();
    s.scheduler.start();
    expect(s.runCycle).toHaveBeenCalledTimes(1);
    expect(s.withLock).toHaveBeenCalledTimes(1);
    expect(s.status()).toEqual({ state: 'syncing' });
    await s.finish();
    expect(s.status()).toEqual({ state: 'idle' });
  });

  it('stays off without settings', () => {
    const s = setup();
    s.device.configured = false;
    s.scheduler.start();
    s.edit();
    vi.advanceTimersByTime(CHANGE_DELAY_MS);
    expect(s.runCycle).not.toHaveBeenCalled();
    expect(s.status()).toEqual({ state: 'off' });
  });

  it('syncs 5 s after the last local change', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    s.edit();
    expect(s.status()).toEqual({ state: 'waiting' });
    vi.advanceTimersByTime(CHANGE_DELAY_MS - 1000);
    s.edit();
    vi.advanceTimersByTime(CHANGE_DELAY_MS - 1);
    expect(s.runCycle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it('runs one cycle at a time, and one more when asked during it', async () => {
    const s = setup();
    s.scheduler.start();
    s.scheduler.syncNow();
    s.scheduler.syncNow();
    expect(s.runCycle).toHaveBeenCalledTimes(1);
    await s.finish();
    expect(s.runCycle).toHaveBeenCalledTimes(2);
    await s.finish();
    expect(s.runCycle).toHaveBeenCalledTimes(2);
    expect(s.status()).toEqual({ state: 'idle' });
  });

  it('syncs when the app is visible again, at most every 30 s', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    vi.advanceTimersByTime(VISIBLE_GAP_MS - 1000);
    s.fire('document', 'visibilitychange');
    expect(s.runCycle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    s.fire('document', 'visibilitychange');
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it('holds automatic syncs during review, and syncs on release when changes wait (M4 decision 11)', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    const release = s.scheduler.hold();
    s.edit();
    vi.advanceTimersByTime(CHANGE_DELAY_MS);
    expect(s.runCycle).toHaveBeenCalledTimes(1);
    expect(s.status()).toEqual({ state: 'waiting' });
    release();
    release();
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it('still pulls when the app is visible again during review, so the session sees reviews made elsewhere', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    s.scheduler.hold();
    vi.advanceTimersByTime(VISIBLE_GAP_MS);
    s.fire('document', 'visibilitychange');
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it('pulls first when a review session starts 30 s or more after the last cycle', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    vi.advanceTimersByTime(VISIBLE_GAP_MS);
    s.scheduler.hold();
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it('does not pull when a review session starts sooner after the last cycle', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    vi.advanceTimersByTime(VISIBLE_GAP_MS - 1000);
    s.scheduler.hold();
    expect(s.runCycle).toHaveBeenCalledTimes(1);
  });

  it('keeps a request for the app being shown over a queued change, so the hold does not drop it', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    s.edit();
    vi.advanceTimersByTime(CHANGE_DELAY_MS);
    expect(s.runCycle).toHaveBeenCalledTimes(2);
    s.edit();
    vi.advanceTimersByTime(CHANGE_DELAY_MS);
    s.scheduler.hold();
    vi.advanceTimersByTime(VISIBLE_GAP_MS);
    s.fire('document', 'visibilitychange');
    await s.finish();
    expect(s.runCycle).toHaveBeenCalledTimes(3);
  });

  it('pushes at once when the app is hidden with changes waiting, even during review (M4 decision 10)', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    s.scheduler.hold();
    s.device.visible = false;
    s.fire('document', 'visibilitychange');
    expect(s.runCycle).toHaveBeenCalledTimes(1);
    s.edit();
    s.fire('document', 'visibilitychange');
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it('runs Sync now during review', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    s.scheduler.hold();
    s.scheduler.syncNow();
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it('waits while offline, and syncs when the device is back online', async () => {
    const s = setup();
    s.device.online = false;
    s.scheduler.start();
    expect(s.runCycle).not.toHaveBeenCalled();
    expect(s.status()).toEqual({ state: 'offline' });
    s.device.online = true;
    s.fire('window', 'online');
    expect(s.runCycle).toHaveBeenCalledTimes(1);
    await s.finish();
    s.device.online = false;
    s.fire('window', 'offline');
    expect(s.status()).toEqual({ state: 'offline' });
  });

  it('shows offline rather than a network error when the connection drops during a sync', async () => {
    const s = setup();
    s.scheduler.start();
    s.device.online = false;
    await s.finish(new SyncError('network', "Couldn't reach GitHub."));
    expect(s.status()).toEqual({ state: 'offline' });
    s.device.online = true;
    s.fire('window', 'online');
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it("stops automatic syncs after an error a retry won't fix, until Sync now or new settings (M4 decision 6)", async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish(new SyncError('auth', 'GitHub refused the token.'));
    expect(s.status()).toEqual({ state: 'error', kind: 'auth', message: 'GitHub refused the token.' });
    s.edit();
    vi.advanceTimersByTime(CHANGE_DELAY_MS);
    s.device.visible = false;
    s.fire('document', 'visibilitychange');
    expect(s.runCycle).toHaveBeenCalledTimes(1);
    expect(s.status()).toMatchObject({ state: 'error' });
    s.scheduler.syncNow();
    expect(s.runCycle).toHaveBeenCalledTimes(2);
    await s.finish(new SyncError('auth', 'GitHub refused the token.'));
    s.scheduler.settingsChanged();
    expect(s.runCycle).toHaveBeenCalledTimes(3);
    await s.finish();
    expect(s.status()).toEqual({ state: 'idle' });
  });

  it('queues an edit made during a run by hand after an error that stops automatic syncs', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish(new SyncError('auth', 'GitHub refused the token.'));
    s.scheduler.syncNow();
    expect(s.runCycle).toHaveBeenCalledTimes(2);
    s.edit();
    vi.advanceTimersByTime(CHANGE_DELAY_MS);
    await s.finish();
    expect(s.runCycle).toHaveBeenCalledTimes(3);
  });

  it('syncs on release when a sync was missed offline during the hold', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    vi.advanceTimersByTime(VISIBLE_GAP_MS);
    s.device.online = false;
    const release = s.scheduler.hold();
    s.device.online = true;
    s.fire('window', 'online');
    expect(s.runCycle).toHaveBeenCalledTimes(1);
    release();
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it('runs new settings saved during a cycle, even when that cycle fails in a way that stops syncing', async () => {
    const s = setup();
    s.scheduler.start();
    s.scheduler.settingsChanged();
    await s.finish(new SyncError('auth', 'GitHub refused the token.'));
    expect(s.runCycle).toHaveBeenCalledTimes(2);
    await s.finish();
    expect(s.status()).toEqual({ state: 'idle' });
  });

  it('keeps a push asked for by hiding the app during review, when a cycle was running', async () => {
    const s = setup();
    s.scheduler.start();
    s.scheduler.hold();
    s.edit();
    s.device.visible = false;
    s.fire('document', 'visibilitychange');
    expect(s.runCycle).toHaveBeenCalledTimes(1);
    await s.finish();
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it('tries again on the next trigger after other errors', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish(new SyncError('server', 'GitHub had a problem (error 502).'));
    expect(s.status()).toMatchObject({ state: 'error', kind: 'server' });
    s.edit();
    vi.advanceTimersByTime(CHANGE_DELAY_MS);
    expect(s.runCycle).toHaveBeenCalledTimes(2);
  });

  it('reports a failure on this device, such as full storage, as unexpected', async () => {
    const s = setup();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    s.scheduler.start();
    await s.finish(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    expect(s.status()).toEqual({
      state: 'error',
      kind: 'unexpected',
      message: 'Sync failed on this device: The quota has been exceeded.',
    });
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });

  it('turns off when the settings are removed, and stops listening when stopped', async () => {
    const s = setup();
    s.scheduler.start();
    await s.finish();
    s.device.configured = false;
    s.scheduler.settingsChanged();
    expect(s.status()).toEqual({ state: 'off' });
    s.device.configured = true;
    s.scheduler.stop();
    s.edit();
    vi.advanceTimersByTime(CHANGE_DELAY_MS);
    expect(s.runCycle).toHaveBeenCalledTimes(1);
  });
});
