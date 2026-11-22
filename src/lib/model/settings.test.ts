import { describe, expect, it } from 'vitest';
import { parseNewCardsPerDay } from './settings';

describe('parseNewCardsPerDay', () => {
  it('reads whole numbers from 0 to 1000', () => {
    expect(['0', '1000', '007', ' 12 ', '1e3'].map(parseNewCardsPerDay)).toEqual([0, 1000, 7, 12, 1000]);
  });

  it('refuses anything else', () => {
    expect(['', ' ', '2.5', '-1', '1001', 'ten'].map(parseNewCardsPerDay)).toEqual([null, null, null, null, null, null]);
  });
});
