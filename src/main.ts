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

// First, so a new version that finishes installing during a slow start still shows the update bar (spec §10).
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
