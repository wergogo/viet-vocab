<script lang="ts">
  import ExternalLink from '../components/ExternalLink.svelte';
  import AudioSection from '../settings/AudioSection.svelte';
  import DataSection from '../settings/DataSection.svelte';
  import ListsSection from '../settings/ListsSection.svelte';
  import ReviewSection from '../settings/ReviewSection.svelte';
  import SyncSection from '../settings/SyncSection.svelte';
</script>

<!-- Spec §5.6 order. -->
<div class="stack">
  <h1>Settings</h1>

  <SyncSection />
  <ReviewSection />
  <AudioSection />
  <ListsSection />
  <DataSection />

  <!-- Spec §5.6 and §15: credits with links. -->
  <section class="card stack">
    <h2>About</h2>
    <p class="muted">
      Viet Vocab v{__APP_VERSION__}. Its
      <ExternalLink href="https://github.com/wergogo/viet-vocab">source code</ExternalLink> is open, under the MIT licence.
    </p>
    <ul class="muted credits">
      <li>
        Dictionary content from <ExternalLink href="https://en.wiktionary.org/">Wiktionary</ExternalLink>, available
        under <ExternalLink href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</ExternalLink>.
      </li>
      <li>
        Simplified/traditional character data from
        <ExternalLink href="https://github.com/BYVoid/OpenCC">OpenCC</ExternalLink> (Apache-2.0).
      </li>
      <li>
        Built with <ExternalLink href="https://svelte.dev/">Svelte</ExternalLink>,
        <ExternalLink href="https://vite.dev/">Vite</ExternalLink>,
        <ExternalLink href="https://vite-pwa-org.netlify.app/">vite-plugin-pwa</ExternalLink>,
        <ExternalLink href="https://developer.chrome.com/docs/workbox">Workbox</ExternalLink> and
        <ExternalLink href="https://github.com/open-spaced-repetition/ts-fsrs">ts-fsrs</ExternalLink> (MIT), and
        <ExternalLink href="https://dexie.org/">Dexie</ExternalLink> (Apache-2.0). The bundled libraries'
        <ExternalLink href={`${import.meta.env.BASE_URL}licenses.txt`}>licence texts</ExternalLink>.
      </li>
      <!-- Dexie's NOTICE file, which its Apache-2.0 licence asks to be shown with the credits. -->
      <li>Dexie.js: Copyright (c) 2014-2017 David Fahlander.</li>
    </ul>
  </section>
</div>

<style>
  p { margin: 0; }
  .credits { display: grid; gap: 4px; margin: 0; padding-left: 1.2em; }
</style>
