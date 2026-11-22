<script lang="ts">
  import AudioSection from '../settings/AudioSection.svelte';
  import DataSection from '../settings/DataSection.svelte';
  import ListsSection from '../settings/ListsSection.svelte';
  import ReviewSection from '../settings/ReviewSection.svelte';
</script>

<!-- Spec §5.6 order; Sync joins at the top in M4. -->
<div class="stack">
  <h1>Settings</h1>

  <ReviewSection />
  <AudioSection />
  <ListsSection />
  <DataSection />

  <section class="card stack">
    <h2>About</h2>
    <p class="muted">
      Viet Vocab v{__APP_VERSION__}. Dictionary content from Wiktionary is available under CC BY-SA 4.0.
      Simplified/traditional character data comes from OpenCC (Apache-2.0).
    </p>
  </section>
</div>

<style>
  p { margin: 0; }
</style>
