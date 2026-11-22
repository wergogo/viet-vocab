/** The local calendar day of `date` as YYYY-MM-DD. "Today" is the device's local day (spec §8). */
export function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The local day of an ISO timestamp, or '' when it isn't a valid time. */
export function localDateOf(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : localDate(date);
}
