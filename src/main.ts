import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { db, rederiveIfNeeded } from './lib/db/db';

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing');

async function start(el: HTMLElement): Promise<void> {
  try {
    await db.open();
    await rederiveIfNeeded();
  } catch (e) {
    console.error(e);
    const message = document.createElement('p');
    message.className = 'storage-error';
    message.textContent =
      'Viet Vocab needs site storage (IndexedDB) to keep your words, and this browser is blocking it. ' +
      'Allow site data for this page (or leave private browsing), then reload.';
    el.replaceChildren(message);
    return;
  }
  mount(App, { target: el });
}

void start(target);
