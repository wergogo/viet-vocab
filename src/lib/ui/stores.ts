import { liveQuery } from 'dexie';
import { listLiveLists } from '../db/lists';
import { listLiveWords } from '../db/words';

/** All live words (with derived fields); re-emits whenever the database changes. */
export const liveWords = liveQuery(() => listLiveWords());

/** All live lists in Vietnamese order. */
export const liveLists = liveQuery(() => listLiveLists());
