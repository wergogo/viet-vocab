import type { Region } from '../model/types';

/** Full names: the form's toggles, the Words filter and the "In other regions" line. */
export const REGION_NAMES: Readonly<Record<Region, string>> = { north: 'Northern', central: 'Central', south: 'Southern' };

/** Short tags, on word rows, word cards and review cards (spec §5.1). */
export const REGION_TAGS: Readonly<Record<Region, string>> = { north: 'North', central: 'Central', south: 'South' };
