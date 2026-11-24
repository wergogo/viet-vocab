import { describe, expect, it } from 'vitest';
import type { Equivalent, Region, Word } from '../model/types';
import { toRow, type LiveWordRow } from './derive';
import { regionLinks } from './equivalents';

const T = '2026-01-01T00:00:00.000Z';

function saved(id: string, word: string, regions: Region[] = [], equivalents: Equivalent[] = []): LiveWordRow {
  const w: Word = { id, word, syllables: word.split(' ').map((text) => ({ text })), senses: [], listIds: [], createdAt: T, updatedAt: T };
  if (regions.length > 0) w.regions = regions;
  if (equivalents.length > 0) w.equivalents = equivalents;
  return toRow(w);
}

describe('regionLinks', () => {
  it('links each equivalent to the saved word it names, or to Add when none is saved', () => {
    const xeLua = saved('1', 'xe lửa', ['south'], [{ word: 'tàu hỏa', regions: ['north'] }, { word: 'tàu lửa' }]);
    const tauHoa = saved('2', 'tàu hoả', ['north']);
    expect(regionLinks(xeLua, [xeLua, tauHoa])).toEqual([
      { word: 'tàu hỏa', regions: ['north'], id: '2' },
      { word: 'tàu lửa', regions: [] },
    ]);
  });

  it('adds the saved words that name this one, with their own regions, in Vietnamese order', () => {
    const muong = saved('1', 'muỗng', ['south']);
    const thia = saved('2', 'thìa', ['north'], [{ word: 'muỗng', regions: ['south'] }]);
    const caiThia = saved('3', 'cái thìa', [], [{ word: 'Muỗng' }]);
    const words = [thia, muong, caiThia];
    expect(regionLinks(muong, words)).toEqual([
      { word: 'cái thìa', regions: [], id: '3' },
      { word: 'thìa', regions: ['north'], id: '2' },
    ]);
    expect(regionLinks(thia, words)).toEqual([{ word: 'muỗng', regions: ['south'], id: '1' }]);
  });

  it('opens the saved word that names this one back, else the oldest, and shows its regions when the equivalent has none', () => {
    const xeLua = saved('1', 'xe lửa', ['south'], [{ word: 'tàu hoả' }]);
    const oldest = { ...saved('2', 'tàu hoả', ['north']), createdAt: '2025-01-01T00:00:00.000Z' };
    const namesBack = saved('3', 'tàu hoả', ['north', 'central'], [{ word: 'xe lửa', regions: ['south'] }]);
    const newer = saved('4', 'tàu hoả');
    expect(regionLinks(xeLua, [newer, oldest, xeLua])).toEqual([{ word: 'tàu hoả', regions: ['north'], id: '2' }]);
    expect(regionLinks(xeLua, [newer, namesBack, oldest, xeLua])).toEqual([
      { word: 'tàu hoả', regions: ['north', 'central'], id: '3' },
    ]);
  });

  it('shows a word once when both name each other, and nothing for a word without links', () => {
    const xeLua = saved('1', 'xe lửa', ['south'], [{ word: 'tàu hoả', regions: ['north'] }]);
    const tauHoa = saved('2', 'tàu hoả', ['north'], [{ word: 'xe lửa', regions: ['south'] }]);
    expect(regionLinks(xeLua, [xeLua, tauHoa])).toEqual([{ word: 'tàu hoả', regions: ['north'], id: '2' }]);
    expect(regionLinks(saved('3', 'nhập khẩu'), [xeLua, tauHoa])).toEqual([]);
  });
});
