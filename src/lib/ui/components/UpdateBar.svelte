<script lang="ts">
  import { reloadToUpdate, updateReady } from '../../pwa/pwa';

  /** Later hides the bar until the app starts again; the new version then starts once every window has closed. */
  let later = $state(false);
</script>

<!-- Mounted from the start, so screen readers announce the bar when it appears (spec §10). -->
<div class="update" role="status">
  {#if $updateReady && !later}
    <div class="bar">
      <span>A new version is ready.</span>
      <span class="actions">
        <button type="button" class="primary" onclick={() => void reloadToUpdate()}>Reload</button>
        <button type="button" onclick={() => (later = true)}>Later</button>
      </span>
    </div>
  {/if}
</div>

<style>
  .update { position: fixed; right: 0; bottom: 16px; left: 0; z-index: 20; display: flex; justify-content: center; padding: 0 16px; pointer-events: none; }
  .bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px 12px; padding: 8px 8px 8px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); box-shadow: 0 4px 16px rgb(0 0 0 / 0.15); pointer-events: auto; }
  .actions { display: flex; gap: 8px; }
  @media (max-width: 767px) {
    /* Above the bottom tab bar. */
    .update { bottom: calc(76px + env(safe-area-inset-bottom)); }
  }
</style>
