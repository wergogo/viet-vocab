import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { db, rederiveIfNeeded } from './lib/db/db';
import { start } from './lib/startup';

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing');

void start({
  openDb: () => db.open(),
  rederive: rederiveIfNeeded,
  mountApp: () => mount(App, { target }),
  showError: (message) => {
    const p = document.createElement('p');
    p.className = 'storage-error';
    p.textContent = message;
    target.replaceChildren(p);
  },
});
