/** The local calendar day of `date` as YYYY-MM-DD. "Today" is the device's local day (spec §8). */
export function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight at the start of the day `date` falls on, or of the day `days` later. */
export function startOfLocalDay(date: Date, days = 0): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
