/** The most new cards per day the review settings may ask for; `parseFile` and the Settings form keep to it. */
export const MAX_NEW_CARDS_PER_DAY = 1000;

export function isNewCardsPerDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_NEW_CARDS_PER_DAY;
}

/** The count typed into Settings, or null when it isn't a whole number from 0 to MAX_NEW_CARDS_PER_DAY. */
export function parseNewCardsPerDay(text: string): number | null {
  const trimmed = text.trim();
  const value = Number(trimmed);
  return trimmed !== '' && isNewCardsPerDay(value) ? value : null;
}
