import 'fake-indexeddb/auto';

// Newfoundland time (UTC−3:30): its local day differs from the UTC day for part of every day, so a "today" that
// slipped to UTC days fails here, where UTC (as on most CI machines) would hide it.
process.env.TZ = 'America/St_Johns';
