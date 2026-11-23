import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { db, rederiveIfNeeded } from './lib/db/db';
import { requestPersistentStorage } from './lib/db/persist';
import { startUpdates } from './lib/pwa/pwa';
import { start } from './lib/startup';
import { startSync } from './lib/sync/sync';

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing');

// Before the database, so the service worker still registers, and a fixed version can still arrive, when the database
// won't open (spec §10).
startUpdates();

void start({
  openDb: () => db.open(),
  rederive: rederiveIfNeeded,
  mountApp: () => {
    mount(App, { target });
    startSync();
    void requestPersistentStorage();
  },
  showError: (message) => {
    const p = document.createElement('p');
    p.className = 'storage-error';
    p.textContent = message;
    target.replaceChildren(p);
  },
});
