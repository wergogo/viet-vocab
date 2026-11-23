import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { deviceSetting } from './deviceSetting';

/** Each test uses its own key, since values that failed to save are kept for the whole session. */
let key = '';
let keys = 0;
const flag = () => deviceSetting<boolean>(key, (text) => text === 'on', (on) => (on ? 'on' : null));

beforeEach(() => {
  localStorage.clear();
  key = `vv.test.${++keys}`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const otherTab = (changedKey: string | null) => window.dispatchEvent(new StorageEvent('storage', { key: changedKey }));

describe('deviceSetting', () => {
  it('reads the stored text through parse, and saves through serialize', () => {
    localStorage.setItem(key, 'on');
    const setting = flag();
    expect(setting.get()).toBe(true);
    setting.set(false);
    expect(localStorage.getItem(key)).toBeNull();
    expect(setting.get()).toBe(false);
    setting.set(true);
    expect(localStorage.getItem(key)).toBe('on');
  });

  it('tells subscribers about changes made here and in other tabs, and ignores other keys', () => {
    const setting = flag();
    const seen: boolean[] = [];
    onTestFinished(setting.subscribe((on) => seen.push(on)));
    setting.set(true);
    localStorage.setItem(key, 'off');
    otherTab('vv.other');
    expect(seen).toEqual([false, true]);
    otherTab(key);
    expect(seen).toEqual([false, true, false]);
  });

  it('reads storage again when another tab clears it', () => {
    localStorage.setItem(key, 'on');
    const setting = flag();
    const seen: boolean[] = [];
    onTestFinished(setting.subscribe((on) => seen.push(on)));
    localStorage.clear();
    otherTab(null);
    expect(seen).toEqual([true, false]);
  });

  it('reads storage again when next used, after a change made while nothing listened', () => {
    const setting = flag();
    expect(get(setting)).toBe(false);
    localStorage.setItem(key, 'on');
    expect(get(setting)).toBe(true);
    expect(setting.get()).toBe(true);
  });

  it('stops listening to other tabs when the last subscriber leaves', () => {
    const added = vi.spyOn(window, 'addEventListener');
    const removed = vi.spyOn(window, 'removeEventListener');
    const stop = flag().subscribe(() => {});
    const listener = added.mock.calls.find(([type]) => type === 'storage')?.[1];
    expect(listener).toBeTypeOf('function');
    stop();
    expect(removed).toHaveBeenCalledWith('storage', listener);
  });

  it('keeps a value storage refused for the rest of the session, until another tab saves one', () => {
    const setting = flag();
    const refuse = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });
    setting.set(true);
    expect(localStorage.getItem(key)).toBeNull();
    expect(setting.get()).toBe(true);
    expect(get(setting)).toBe(true);
    refuse.mockRestore();
    localStorage.setItem(key, 'off');
    otherTab(key);
    expect(setting.get()).toBe(false);
  });

  it('works without storage at all', () => {
    const blocked = () => {
      throw new DOMException('Blocked', 'SecurityError');
    };
    for (const method of ['getItem', 'setItem', 'removeItem'] as const) vi.spyOn(localStorage, method).mockImplementation(blocked);
    const setting = flag();
    expect(setting.get()).toBe(false);
    setting.set(true);
    expect(setting.get()).toBe(true);
    setting.set(false);
    expect(setting.get()).toBe(false);
  });
});
