import { describe, expect, it } from 'vitest';
import { isSubmitEnter } from './keys';

const key = (init: Partial<KeyboardEvent>) => init as KeyboardEvent;

describe('isSubmitEnter', () => {
  it('accepts a plain Enter and ignores IME-composition Enters and other keys', () => {
    expect(isSubmitEnter(key({ key: 'Enter', isComposing: false, keyCode: 13 }))).toBe(true);
    expect(isSubmitEnter(key({ key: 'Enter', isComposing: true, keyCode: 13 }))).toBe(false);
    expect(isSubmitEnter(key({ key: 'Enter', isComposing: false, keyCode: 229 }))).toBe(false);
    expect(isSubmitEnter(key({ key: 'a', isComposing: false, keyCode: 65 }))).toBe(false);
  });
});
