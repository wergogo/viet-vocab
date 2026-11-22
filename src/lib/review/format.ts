import { startOfLocalDay } from '../model/dates';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** One decimal below 10 ("1.5"), whole numbers above. */
function short(n: number): string {
  return n < 10 ? n.toFixed(1).replace(/\.0$/, '') : String(Math.round(n));
}

/** A rating button's interval: "1m", "10m", "3h", "2d", "1.5mo", "2y". */
export function formatInterval(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const days = ms / DAY;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${short(days / 30)}mo`;
  return `${short(days / 365)}y`;
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** When a card is next due, for the end screen: "in 10 minutes", "in 3 hours", "tomorrow", "in 4 days". */
export function formatDueIn(due: Date, now: Date): string {
  const ms = due.getTime() - now.getTime();
  if (ms < MINUTE) return 'now';
  if (ms < HOUR) return relative.format(Math.round(ms / MINUTE), 'minute');
  if (ms < DAY) return relative.format(Math.round(ms / HOUR), 'hour');
  const days = Math.round((startOfLocalDay(due).getTime() - startOfLocalDay(now).getTime()) / DAY);
  return relative.format(days, 'day');
}
