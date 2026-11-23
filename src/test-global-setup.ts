/**
 * Runs once before the test workers start. Tests run in Newfoundland time (UTC−3:30): its local day differs from the
 * UTC day for part of every day, so a "today" that slipped to UTC days fails here, where UTC (as on most CI machines)
 * would hide it. Set here, in the main process, it reaches every worker, threads included.
 */
export default function setup(): void {
  process.env.TZ = 'America/St_Johns';
}
